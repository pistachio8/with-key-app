# 그룹-챌린지 책임 분리 · 카피 정합화 · 현황판 KPI 버그 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 그룹당 동시 챌린지 1개 강제 + `StatusCard` socialProof 카피의 status×솔로×owner 분기 + `DashboardTab` KPI 라벨의 status 직접 분기를 한 PR 로 묶어 머지한다.

**Architecture:** DB 레이어에 partial unique index 1개를 신규로 추가하여 동시성·일관성을 강제하고, 챌린지 상세 페이지(`(tabs)/layout.tsx`, `(tabs)/dashboard/page.tsx`)는 이미 derive 되어 있는 `totalSigned`·`isOwner`·`status` 를 자식 컴포넌트에 prop 으로 전달하기만 한다. `/challenge/new` 는 RSC 레이아웃에서 owner 의 open challenge 가 있으면 그 챌린지로 redirect 하여 폼 도달 전에 충돌을 차단한다.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Supabase (Postgres) · Vitest + Testing Library (jsdom) · pnpm.

**Spec:** [`docs/superpowers/specs/2026-05-20-group-challenge-concept.md`](../specs/2026-05-20-group-challenge-concept.md)

**Base branch:** `develop` (3d6758b). **Working branch:** `fix/group-challenge-concept`.

---

## File Structure

신규 / 수정 파일 매핑.

```
supabase/migrations/
  └── 0029_one_active_challenge_per_group.sql                       NEW

src/lib/db/reads/
  └── owner-open-challenge.ts                                        NEW  (RSC helper)

src/app/(app)/challenge/
  ├── new/
  │   ├── layout.tsx                                                 NEW  (RSC redirect guard)
  │   └── page.tsx                                                   MODIFY (conflict toast)
  └── [id]/
      ├── (tabs)/
      │   ├── layout.tsx                                             MODIFY (pass new props)
      │   └── dashboard/page.tsx                                     MODIFY (pass status prop)
      └── _components/
          ├── status-card.tsx                                        MODIFY (socialProof matrix)
          ├── status-card.spec.tsx                                   NEW
          ├── dashboard-tab.tsx                                      MODIFY (daysPill by status)
          └── dashboard-tab.spec.tsx                                 MODIFY (status cases)

tests/integration/migrations/
  └── one-open-challenge-per-group.spec.ts                           NEW

docs/
  ├── adr/0011-group-challenge-ownership-model.md                    NEW
  ├── PRD.md                                                         MODIFY (§3.3 AC-1, §3.4)
  └── BE_SCHEMA.md                                                   MODIFY (§5.5 비고)
```

각 파일의 단일 책임:
- `0029_*.sql`: `challenges` 에 partial unique index 추가 (closed 제외).
- `owner-open-challenge.ts`: 현재 사용자가 owner 인 그룹의 open challenge 1건을 가장 최근 `created_at` 기준으로 찾는다.
- `(challenge/new)/layout.tsx`: 진입 시 위 helper 호출 후 존재하면 redirect.
- `status-card.tsx`: status × isSolo × isOwner 분기 카피.
- `dashboard-tab.tsx`: status 별 daysPill 분기.

---

## Task 1 — Migration 0029: partial unique index

**Files:**
- Create: `supabase/migrations/0029_one_active_challenge_per_group.sql`

- [ ] **Step 1.1 — 사전 확인 쿼리 실행 (local DB)**

Run:
```bash
pnpm supabase db reset
psql "$DATABASE_URL" -c "select group_id, count(*) from challenges where status in ('pending','accepted','active') group by 1 having count(*) > 1;"
```

Expected: 0 rows. 결과가 비어 있어야 다음 단계로 진행.

- [ ] **Step 1.2 — Migration 파일 작성**

Create `supabase/migrations/0029_one_active_challenge_per_group.sql`:

```sql
-- 0029_one_active_challenge_per_group.sql
--
-- 그룹당 동시 챌린지 1개만 허용한다. closed 는 제외하여 직렬 진행에는
-- 영향이 없고, pending|accepted|active 단계의 챌린지가 같은 group_id 로
-- 두 개 이상 존재하지 못하도록 partial unique index 로 강제한다.
--
-- 참조:
--   docs/superpowers/specs/2026-05-20-group-challenge-concept.md C3
--   docs/adr/0011-group-challenge-ownership-model.md
--
-- 위반 시 sqlstate 23505 → Server Action 의 mapSupabaseError 가
-- "conflict" ErrorCode 로 매핑 → 호출처 UI 에서 "이미 진행 중인 챌린지가
-- 있어요" 토스트로 안내.

create unique index if not exists challenges_one_open_per_group
  on public.challenges (group_id)
  where status in ('pending', 'accepted', 'active');
```

- [ ] **Step 1.3 — 로컬 DB 적용 + 인덱스 존재 확인**

Run:
```bash
pnpm supabase db reset
psql "$DATABASE_URL" -c "\d+ public.challenges" | grep challenges_one_open_per_group
```

Expected: `"challenges_one_open_per_group" UNIQUE, btree (group_id) WHERE status = ANY ...` 한 줄 출력.

- [ ] **Step 1.4 — Commit**

```bash
git add supabase/migrations/0029_one_active_challenge_per_group.sql
git commit -m "feat(db): one open challenge per group via partial unique index"
```

---

## Task 2 — Integration test for partial unique index

**Files:**
- Create: `tests/integration/migrations/one-open-challenge-per-group.spec.ts`

- [ ] **Step 2.1 — 실패 테스트 작성**

Create `tests/integration/migrations/one-open-challenge-per-group.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { admin } from "../setup";
import { createUser, createGroup, createPendingChallenge } from "../factories";

describe("challenges_one_open_per_group partial unique index", () => {
  it("rejects a second pending challenge in the same group", async () => {
    const owner = await createUser();
    const g = await createGroup(owner.id);
    await createPendingChallenge(g.id);

    const { error } = await admin.from("challenges").insert({
      group_id: g.id,
      title: "두 번째",
      type: "fitness",
      goal_count: 3,
      duration_days: 7,
      penalty_amount: 3000,
      status: "pending",
    });

    expect(error?.code).toBe("23505");
  });

  it("rejects a second active challenge in the same group", async () => {
    const owner = await createUser();
    const g = await createGroup(owner.id);
    const first = await createPendingChallenge(g.id);
    await admin.from("challenges").update({ status: "active" }).eq("id", first.id);

    const { error } = await admin.from("challenges").insert({
      group_id: g.id,
      title: "두 번째",
      type: "fitness",
      goal_count: 3,
      duration_days: 7,
      penalty_amount: 3000,
      status: "pending",
    });

    expect(error?.code).toBe("23505");
  });

  it("allows a new pending after the previous one is closed", async () => {
    const owner = await createUser();
    const g = await createGroup(owner.id);
    const first = await createPendingChallenge(g.id);
    await admin.from("challenges").update({ status: "closed" }).eq("id", first.id);

    const { data, error } = await admin
      .from("challenges")
      .insert({
        group_id: g.id,
        title: "다음 챌린지",
        type: "fitness",
        goal_count: 3,
        duration_days: 7,
        penalty_amount: 3000,
        status: "pending",
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.status).toBe("pending");
  });

  it("allows pending challenges in different groups concurrently", async () => {
    const owner = await createUser();
    const g1 = await createGroup(owner.id, { name: "A" });
    const g2 = await createGroup(owner.id, { name: "B" });
    await createPendingChallenge(g1.id);

    const { data, error } = await admin
      .from("challenges")
      .insert({
        group_id: g2.id,
        title: "두 번째 그룹의 챌린지",
        type: "fitness",
        goal_count: 3,
        duration_days: 7,
        penalty_amount: 3000,
        status: "pending",
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.group_id).toBe(g2.id);
  });
});
```

- [ ] **Step 2.2 — 실행: PASS 확인**

Run:
```bash
pnpm test -- tests/integration/migrations/one-open-challenge-per-group.spec.ts
```

Expected: 4 passing.

- [ ] **Step 2.3 — Commit**

```bash
git add tests/integration/migrations/one-open-challenge-per-group.spec.ts
git commit -m "test(db): integration tests for one-open-challenge-per-group index"
```

---

## Task 3 — `StatusCard.socialProof` matrix (TDD)

**Files:**
- Create: `src/app/(app)/challenge/[id]/_components/status-card.spec.tsx`
- Modify: `src/app/(app)/challenge/[id]/_components/status-card.tsx`

- [ ] **Step 3.1 — 실패 테스트 작성**

Create `src/app/(app)/challenge/[id]/_components/status-card.spec.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusCard } from "./status-card";

const baseProps = {
  title: "이번 주 운동",
  goalCount: 3,
  durationDays: 7,
  penaltyAmount: 3000,
  ownerName: "민지",
  daysLeft: 5,
  participantCount: 1,
  signedCount: 0,
  isOwner: true,
  status: "pending" as const,
};

describe("StatusCard socialProof", () => {
  it("pending + solo + owner → '지금 초대하면 함께 시작해요'", () => {
    render(<StatusCard {...baseProps} status="pending" participantCount={1} signedCount={0} />);
    expect(screen.getByText(/지금 초대하면 함께 시작해요/)).toBeTruthy();
  });

  it("pending + solo + 비owner → '서명 대기 중'", () => {
    render(<StatusCard {...baseProps} status="pending" participantCount={1} isOwner={false} />);
    expect(screen.getByText("서명 대기 중")).toBeTruthy();
  });

  it("pending + multi → '{signed}/{N}명 서명'", () => {
    render(
      <StatusCard {...baseProps} status="pending" participantCount={3} signedCount={1} />,
    );
    expect(screen.getByText("1/3명 서명")).toBeTruthy();
  });

  it("accepted + multi → '곧 시작'", () => {
    render(
      <StatusCard {...baseProps} status="accepted" participantCount={3} signedCount={3} />,
    );
    expect(screen.getByText(/곧 시작/)).toBeTruthy();
  });

  it("active + solo + owner → '혼자 시작했어요 · 다음 챌린지엔 함께해요'", () => {
    render(<StatusCard {...baseProps} status="active" participantCount={1} />);
    expect(screen.getByText(/혼자 시작했어요/)).toBeTruthy();
    expect(screen.getByText(/다음 챌린지엔 함께해요/)).toBeTruthy();
  });

  it("active + multi → '{N}명이 함께해요'", () => {
    render(
      <StatusCard {...baseProps} status="active" participantCount={3} />,
    );
    expect(screen.getByText("3명이 함께해요")).toBeTruthy();
  });

  it("closed + solo → '혼자 마쳤어요'", () => {
    render(<StatusCard {...baseProps} status="closed" participantCount={1} />);
    expect(screen.getByText("혼자 마쳤어요")).toBeTruthy();
  });

  it("closed + multi → '{N}명이 함께했어요'", () => {
    render(<StatusCard {...baseProps} status="closed" participantCount={3} />);
    expect(screen.getByText("3명이 함께했어요")).toBeTruthy();
  });
});
```

- [ ] **Step 3.2 — 실행: FAIL 확인**

Run:
```bash
pnpm test -- src/app/\(app\)/challenge/\[id\]/_components/status-card.spec.tsx
```

Expected: 모든 케이스 FAIL (props 시그니처 불일치 또는 텍스트 매칭 실패).

- [ ] **Step 3.3 — `StatusCard` 본문 수정**

Modify `src/app/(app)/challenge/[id]/_components/status-card.tsx` 전체 교체:

```tsx
// 모킹업 §6 상단 — primary bg 상태 카드.
// socialProof 는 status × isSolo × isOwner 3축으로 분기 (spec C4).

import { goalCountLabel } from "@/lib/challenge/frequency";
import { penaltyLabel } from "@/lib/challenge/penalty";

interface StatusCardProps {
  title: string;
  status: "pending" | "accepted" | "active" | "closed";
  goalCount: number;
  durationDays: number;
  penaltyAmount: number;
  participantCount: number;
  signedCount: number;
  isOwner: boolean;
  ownerName: string;
  daysLeft: number | null;
}

function socialProofFor(
  status: StatusCardProps["status"],
  participantCount: number,
  signedCount: number,
  isOwner: boolean,
): string {
  const isSolo = participantCount === 1;
  if (status === "pending") {
    if (isSolo) return isOwner ? "서명 대기 · 지금 초대하면 함께 시작해요" : "서명 대기 중";
    return `${signedCount}/${participantCount}명 서명`;
  }
  if (status === "accepted") {
    return `${participantCount}명 모두 서명 완료 · 곧 시작`;
  }
  if (status === "active") {
    if (isSolo) return isOwner ? "혼자 시작했어요 · 다음 챌린지엔 함께해요" : "혼자 진행 중";
    return `${participantCount}명이 함께해요`;
  }
  // closed
  return isSolo ? "혼자 마쳤어요" : `${participantCount}명이 함께했어요`;
}

export function StatusCard({
  title,
  status,
  goalCount,
  durationDays,
  penaltyAmount,
  participantCount,
  signedCount,
  isOwner,
  ownerName,
  daysLeft,
}: StatusCardProps) {
  const socialProof = socialProofFor(status, participantCount, signedCount, isOwner);
  const meta = `${goalCountLabel(goalCount).detail} · ${durationDays}일 · ${penaltyLabel(penaltyAmount)}`;
  const dayLabel =
    status === "active" && daysLeft !== null
      ? `D-${daysLeft}`
      : status === "pending"
        ? "서명 대기"
        : status === "accepted"
          ? "곧 시작"
          : "종료";

  return (
    <section className="bg-primary text-primary-foreground rounded-[14px] p-5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold tracking-[0.05em] opacity-90">
          FROM · WITH · 운영자 {ownerName}
        </div>
        <span className="t-caption text-primary-foreground/85 tabular-nums">{dayLabel}</span>
      </div>
      <h1 className="t-h2 mt-1">{title}</h1>
      <p className="t-sub text-primary-foreground/85 mt-2">{meta}</p>
      <p className="t-caption text-primary-foreground/85 mt-3">{socialProof}</p>
    </section>
  );
}
```

- [ ] **Step 3.4 — 실행: PASS 확인**

Run:
```bash
pnpm test -- src/app/\(app\)/challenge/\[id\]/_components/status-card.spec.tsx
```

Expected: 8 passing.

- [ ] **Step 3.5 — Commit**

```bash
git add src/app/\(app\)/challenge/\[id\]/_components/status-card.tsx \
        src/app/\(app\)/challenge/\[id\]/_components/status-card.spec.tsx
git commit -m "fix(challenge): status × solo × owner copy matrix in StatusCard"
```

---

## Task 4 — `(tabs)/layout.tsx` 에서 새 props 전달

**Files:**
- Modify: `src/app/(app)/challenge/[id]/(tabs)/layout.tsx`

- [ ] **Step 4.1 — `StatusCard` 호출부 두 줄 prop 추가**

Modify the `<StatusCard ... />` JSX block (lines around 61-70) to include the two new props:

```tsx
<StatusCard
  title={detail.title}
  status={detail.status}
  goalCount={detail.goalCount}
  durationDays={detail.durationDays}
  penaltyAmount={detail.penaltyAmount}
  participantCount={detail.participantCount}
  signedCount={totalSigned}
  isOwner={isOwner}
  ownerName={ownerName}
  daysLeft={daysLeft}
/>
```

(`totalSigned` 와 `isOwner` 는 L40·L47 에서 이미 derive 중. 신규 변수 없음.)

- [ ] **Step 4.2 — typecheck 확인**

Run:
```bash
pnpm typecheck
```

Expected: no error.

- [ ] **Step 4.3 — Commit**

```bash
git add src/app/\(app\)/challenge/\[id\]/\(tabs\)/layout.tsx
git commit -m "fix(challenge): pass signedCount + isOwner to StatusCard"
```

---

## Task 5 — `DashboardTab` daysPill by status (TDD)

**Files:**
- Modify: `src/app/(app)/challenge/[id]/_components/dashboard-tab.spec.tsx`
- Modify: `src/app/(app)/challenge/[id]/_components/dashboard-tab.tsx`

- [ ] **Step 5.1 — 기존 잘못된 테스트 폐기 + 새 케이스 추가**

Replace contents of `src/app/(app)/challenge/[id]/_components/dashboard-tab.spec.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardTab } from "./dashboard-tab";

const baseProps = {
  totalPenalty: 15000,
  totalActions: 27,
  totalFailures: 3,
  daysRemaining: 15,
  goalCount: 30,
  status: "active" as const,
  members: [
    { id: "u1", displayName: "두두", doneCount: 13, signed: true },
    { id: "u2", displayName: "민지", doneCount: 15, signed: true },
  ],
};

describe("DashboardTab", () => {
  it("renders 누적 벌금 with toLocaleString-formatted amount", () => {
    render(<DashboardTab {...baseProps} />);
    expect(screen.getByText("누적 벌금")).toBeTruthy();
    expect(screen.getByText("15,000")).toBeTruthy();
  });

  it("renders 3 KPI pills with action/failure/remaining day counts", () => {
    render(<DashboardTab {...baseProps} />);
    expect(screen.getByText("총 인증 27회")).toBeTruthy();
    expect(screen.getByText("실패 3회")).toBeTruthy();
    expect(screen.getByText("남은 15일")).toBeTruthy();
  });

  it("shows '시작 전' when status is pending", () => {
    render(<DashboardTab {...baseProps} status="pending" daysRemaining={null} />);
    expect(screen.getByText("시작 전")).toBeTruthy();
  });

  it("shows '곧 시작' when status is accepted", () => {
    render(<DashboardTab {...baseProps} status="accepted" daysRemaining={null} />);
    expect(screen.getByText("곧 시작")).toBeTruthy();
  });

  it("shows '종료' when status is closed", () => {
    render(<DashboardTab {...baseProps} status="closed" daysRemaining={0} />);
    expect(screen.getByText("종료")).toBeTruthy();
  });

  it("does NOT show '종료' for pending with null daysRemaining (regression: endAt-null bug)", () => {
    render(<DashboardTab {...baseProps} status="pending" daysRemaining={null} />);
    expect(screen.queryByText("종료")).toBeNull();
  });
});
```

- [ ] **Step 5.2 — 실행: FAIL 확인**

Run:
```bash
pnpm test -- src/app/\(app\)/challenge/\[id\]/_components/dashboard-tab.spec.tsx
```

Expected: status 관련 테스트 FAIL (`status` prop 미지원).

- [ ] **Step 5.3 — `DashboardTab` 본문 수정**

Replace contents of `src/app/(app)/challenge/[id]/_components/dashboard-tab.tsx`:

```tsx
// 모킹업 §8-B 현황판 탭 — primary bg status-card (누적 벌금 + KPI pills) + 멤버 strip.
// daysPill 라벨은 status 로 직접 분기 (spec C5).

import { Card } from "@/components/ui/card";
import { MemberStrip } from "./member-strip";
import type { ChallengeMemberView } from "@/lib/db/reads/challenge-detail";

interface DashboardTabProps {
  totalPenalty: number;
  totalActions: number;
  totalFailures: number;
  daysRemaining: number | null;
  status: "pending" | "accepted" | "active" | "closed";
  members: ReadonlyArray<ChallengeMemberView>;
  goalCount: number;
}

function daysPillLabel(
  status: DashboardTabProps["status"],
  daysRemaining: number | null,
): string {
  if (status === "pending") return "시작 전";
  if (status === "accepted") return "곧 시작";
  if (status === "active") return daysRemaining != null ? `남은 ${daysRemaining}일` : "—";
  return "종료";
}

export function DashboardTab({
  totalPenalty,
  totalActions,
  totalFailures,
  daysRemaining,
  status,
  members,
  goalCount,
}: DashboardTabProps) {
  return (
    <div className="flex flex-col gap-3">
      <Card tone="primary" padding="lg" className="text-center">
        <div className="text-[12px] opacity-85">누적 벌금</div>
        <div className="mt-1 text-[32px] font-extrabold tracking-tight tabular-nums">
          {totalPenalty.toLocaleString()}
          <sub className="ml-1 align-baseline text-[14px] font-semibold opacity-90">원</sub>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <KpiPill label={`총 인증 ${totalActions}회`} />
          <KpiPill label={`실패 ${totalFailures}회`} />
          <KpiPill label={daysPillLabel(status, daysRemaining)} />
        </div>
      </Card>
      <MemberStrip goalCount={goalCount} members={members} />
    </div>
  );
}

function KpiPill({ label }: { label: string }) {
  return (
    <div className="rounded-[10px] bg-white/15 py-2 text-center text-[11px] font-semibold text-white tabular-nums">
      {label}
    </div>
  );
}
```

- [ ] **Step 5.4 — 실행: PASS 확인**

Run:
```bash
pnpm test -- src/app/\(app\)/challenge/\[id\]/_components/dashboard-tab.spec.tsx
```

Expected: 6 passing.

- [ ] **Step 5.5 — Commit**

```bash
git add src/app/\(app\)/challenge/\[id\]/_components/dashboard-tab.tsx \
        src/app/\(app\)/challenge/\[id\]/_components/dashboard-tab.spec.tsx
git commit -m "fix(challenge): daysPill label by status (fixes endAt-null '종료' bug)"
```

---

## Task 6 — `(tabs)/dashboard/page.tsx` 에서 status prop 전달

**Files:**
- Modify: `src/app/(app)/challenge/[id]/(tabs)/dashboard/page.tsx`

- [ ] **Step 6.1 — `DashboardTab` 호출부에 `status` 추가**

Modify the `<DashboardTab ... />` JSX (around line 36) to include `status={detail.status}`:

```tsx
<DashboardTab
  totalPenalty={totalPenalty}
  totalActions={feed.length}
  totalFailures={totalFailures}
  daysRemaining={daysLeft}
  status={detail.status}
  members={detail.members}
  goalCount={detail.goalCount}
/>
```

- [ ] **Step 6.2 — typecheck**

Run:
```bash
pnpm typecheck
```

Expected: no error.

- [ ] **Step 6.3 — Commit**

```bash
git add src/app/\(app\)/challenge/\[id\]/\(tabs\)/dashboard/page.tsx
git commit -m "fix(challenge): pass status to DashboardTab"
```

---

## Task 7 — `owner-open-challenge` read helper

**Files:**
- Create: `src/lib/db/reads/owner-open-challenge.ts`

- [ ] **Step 7.1 — Helper 작성**

Create `src/lib/db/reads/owner-open-challenge.ts`:

```ts
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type OwnerOpenChallenge = {
  id: string;
};

/**
 * 사용자가 owner 인 그룹 중 `pending|accepted|active` 챌린지를 가진
 * 그룹의 가장 최근(`created_at desc`) 챌린지 1건. 없으면 null.
 *
 * `/challenge/new` 진입 가드(spec C8) 와 후속 라우팅 보강에서 사용.
 */
export const fetchOwnerOpenChallenge = cache(
  async (ownerId: string): Promise<OwnerOpenChallenge | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("challenges")
      .select("id, groups!inner(owner_id)")
      .eq("groups.owner_id", ownerId)
      .in("status", ["pending", "accepted", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? { id: data.id as string } : null;
  },
);
```

- [ ] **Step 7.2 — typecheck**

Run:
```bash
pnpm typecheck
```

Expected: no error.

- [ ] **Step 7.3 — Commit**

```bash
git add src/lib/db/reads/owner-open-challenge.ts
git commit -m "feat(reads): fetchOwnerOpenChallenge helper for create-guard redirect"
```

---

## Task 8 — `/challenge/new/layout.tsx` RSC redirect 가드

**Files:**
- Create: `src/app/(app)/challenge/new/layout.tsx`

- [ ] **Step 8.1 — `getAuthedUser` 시그니처 확인**

Run:
```bash
grep -n "export.*getAuthedUser" src/lib/supabase/auth.ts
```

Expected: helper exists with `{ user }` return shape. (이미 `(tabs)/layout.tsx:31` 에서 같은 패턴으로 사용 중.)

- [ ] **Step 8.2 — RSC layout 작성**

Create `src/app/(app)/challenge/new/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getAuthedUser } from "@/lib/supabase/auth";
import { fetchOwnerOpenChallenge } from "@/lib/db/reads/owner-open-challenge";

// spec C8 — owner 가 이미 open challenge 를 갖고 있으면 폼 진입을 막고
// 그 챌린지로 즉시 redirect. ADR-0003 auto-group 흐름(첫 챌린지 사용자)은
// open challenge 가 없을 때 자연스럽게 폼이 렌더되어 그대로 동작.
export default async function NewChallengeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await getAuthedUser();
  if (!user) redirect("/login");

  const open = await fetchOwnerOpenChallenge(user.id);
  if (open) redirect(`/challenge/${open.id}`);

  return <>{children}</>;
}
```

- [ ] **Step 8.3 — 수동 확인 (로컬 dev)**

```bash
pnpm dev
```

브라우저 (모바일 emulation):
1. owner 가 진행 중인 챌린지가 있는 사용자 로그인 → `/challenge/new` 접속 → 즉시 `/challenge/<openId>` 로 redirect.
2. 그룹이 없는 신규 사용자 로그인 → `/challenge/new` 접속 → 폼 정상 노출.

- [ ] **Step 8.4 — Commit**

```bash
git add src/app/\(app\)/challenge/new/layout.tsx
git commit -m "feat(challenge): redirect away from /challenge/new when owner has open challenge"
```

---

## Task 9 — `/challenge/new/page.tsx` conflict 토스트 분기

**Files:**
- Modify: `src/app/(app)/challenge/new/page.tsx`
- (조건부) Modify: `src/lib/actions/error-messages.ts`

- [ ] **Step 9.1 — `makeUserMessage` 시그니처 확인**

Run:
```bash
grep -n "export.*makeUserMessage\|FALLBACK_ERROR_MESSAGE" src/lib/actions/error-messages.ts
```

Expected: helper 시그니처 출력. 두 케이스:
- (a) `makeUserMessage(overrides?: Partial<Record<ErrorCode, string>>)` 형태 → Step 9.2 만 수행.
- (b) overrides 미지원 닫힌 형태 → Step 9.1a 로 시그니처 외과적 확장 후 Step 9.2.

- [ ] **Step 9.1a — (조건부) `makeUserMessage` overrides 지원 추가**

만약 시그니처가 닫혀 있으면 `src/lib/actions/error-messages.ts` 의 export 를 다음 형태로 확장:

```ts
import type { ErrorCode } from "./response";

export const FALLBACK_ERROR_MESSAGE = "잠시 후 다시 시도해주세요";

const DEFAULTS: Record<ErrorCode, string> = {
  unauthorized: "다시 로그인해 주세요",
  forbidden: "권한이 없어요",
  invalid_input: "입력값을 확인해 주세요",
  not_found: "찾을 수 없어요",
  conflict: "이미 처리된 요청이에요",
  rate_limited: "잠시 후 다시 시도해주세요",
  upstream_error: FALLBACK_ERROR_MESSAGE,
};

export function makeUserMessage(
  overrides: Partial<Record<ErrorCode, string>> = {},
): (code: ErrorCode) => string {
  return (code) => overrides[code] ?? DEFAULTS[code] ?? FALLBACK_ERROR_MESSAGE;
}
```

**왜 외과적**: `makeUserMessage` 가 닫혀 있다면 호출처마다 컨텍스트 카피를 주입하기 어렵다 — overrides 지원은 한 줄 시그니처 변경. 이미 호출처가 인자 없이 호출 중이면 기본값 `{}` 으로 호환.

- [ ] **Step 9.2 — `/challenge/new/page.tsx` 에서 카피 주입**

Modify line 21:

```tsx
const userMessage = makeUserMessage({
  forbidden: "그룹장만 챌린지를 만들 수 있어요",
  conflict: "이미 진행 중인 챌린지가 있어요",
});
```

(나머지 `submit()` 본문은 그대로 — `userMessage(res.error)` 가 자동으로 새 카피를 노출.)

- [ ] **Step 9.3 — typecheck**

Run:
```bash
pnpm typecheck
```

Expected: no error.

- [ ] **Step 9.4 — 수동 확인 (race fallback)**

```bash
pnpm dev
```

브라우저: owner 가 진행 중 챌린지가 있는 상태에서 (Task 8 redirect 가 적용된 후라 일반적으로는 redirect 가 먼저 잡지만) 두 개 탭에서 폼을 동시 제출하는 시나리오 또는 직접 URL 우회로 폼에 도달 후 제출 → 토스트 "이미 진행 중인 챌린지가 있어요" 확인.

- [ ] **Step 9.5 — Commit**

```bash
git add src/app/\(app\)/challenge/new/page.tsx \
        src/lib/actions/error-messages.ts
git commit -m "fix(challenge): toast messages for forbidden + conflict on create"
```

---

## Task 10 — ADR-0011 작성

**Files:**
- Create: `docs/adr/0011-group-challenge-ownership-model.md`

- [ ] **Step 10.1 — ADR 본문 작성**

Create `docs/adr/0011-group-challenge-ownership-model.md`:

```markdown
# 0011 — 그룹·챌린지 책임 분리 · 동시 1개 제약

- **Status**: Accepted
- **Date**: 2026-05-20
- **Author**: ian
- **Related**: ADR-0003 (auto-group), ADR-0009 (pending-invite explicit start), spec [2026-05-20-group-challenge-concept](../superpowers/specs/2026-05-20-group-challenge-concept.md)

## Context

PRD·코드·UI 가 "그룹 = 챌린지" 인 양 혼용되어 카피·상태머신·동시성에 모순이 누적되었다. 특히:

- `StatusCard.socialProof` 가 `participantCount === 1` 만 보고 "혼자 시작했어요" 를 출력해 `pending+솔로` 에서도 같은 카피가 노출.
- `DashboardTab` 의 3번째 KPI 가 `daysRemaining === null` 을 "종료" 로 표시하지만, `end_at IS NULL` 은 사실 `pending|accepted` 에서 더 흔하다 — 의미가 정확히 반전.
- RPC `create_challenge` 와 RLS `challenges_insert_owner` 가 owner-only 를 이미 강제하고 있으나, 그룹당 동시 챌린지 1개 제약은 어디에도 없어 동시성 race 가 발생 가능.

## Decision

- 그룹과 챌린지를 1:N + 직렬(동시 1개) 모델로 재정의.
- partial unique index `challenges_one_open_per_group` 로 `status in ('pending','accepted','active')` 챌린지가 그룹당 1개를 넘지 못하도록 DB 레벨에서 강제.
- `StatusCard.socialProof` 카피를 status × isSolo × isOwner 3축으로 분기.
- `DashboardTab` daysPill 라벨을 status 로 직접 분기.
- `/challenge/new` 의 RSC layout 이 owner 의 open challenge 가 있으면 그 챌린지로 redirect.
- `challenges.created_by` 컬럼은 도입하지 않는다 (owner=creator 모델 유지).

## Alternatives Considered

- `challenges.created_by` 도입 + 모든 멤버에게 챌린지 생성 허용: POC 범위 초과.
- `accepted` 상태를 재활성화하여 자동 전이 트리거 추가: 현 PRD 와 wording 충돌. POC 이후로 미룸.
- `"already_open"` 신규 ErrorCode 도입: `ErrorCode` union·`mapSupabaseError`·UI 카피 매핑 전부 변경 → 컨텍스트 분기로 대체.

## Consequences

긍정:
- DB 레벨에서 동시성 race 차단.
- `pending+솔로`·`accepted+솔로`·`active+솔로`·`closed+솔로` 모두 의미와 카피가 정합.
- KPI 라벨이 `endAt` 파생 신호 대신 status 직접 분기 → 회귀 재발 가능성 ↓.

부정 / 비용:
- 같은 그룹 내에서 "다음 챌린지를 미리 준비" 는 불가 (active 끝난 뒤에만 새 챌린지 가능). 사용자 흐름상 자연스러우나 명시적으로 받아들임.
- `accepted` 상태가 dead state 임을 받아들이고 매트릭스에 안전망 카피만 유지.

## Rollback

`drop index challenges_one_open_per_group;` 한 줄로 즉시 무효화 (별도 migration 권장). UI 변경은 PR revert.
```

- [ ] **Step 10.2 — 링크 깨짐 검증**

Run:
```bash
pnpm validate:docs
```

Expected: pass.

- [ ] **Step 10.3 — Commit**

```bash
git add docs/adr/0011-group-challenge-ownership-model.md
git commit -m "docs(adr): 0011 group-challenge ownership model"
```

---

## Task 11 — PRD §3.3 AC-1 · §3.4 갱신

**Files:**
- Modify: `docs/PRD.md`

- [ ] **Step 11.1 — §3.3 AC-1 줄 갱신**

`docs/PRD.md` 의 "AC-1 그룹장은 아래 필드로 챌린지를 생성할 수 있다:" 헤드 줄에 동시 1개 제약을 추가:

```markdown
- **AC-1** 그룹장은 아래 필드로 챌린지를 생성할 수 있다 (그룹당 동시 1개 — `pending|accepted|active` 합쳐 1개. partial unique index `challenges_one_open_per_group` 가 강제, 위반 시 conflict 토스트):
```

- [ ] **Step 11.2 — §3.4 솔로 챌린지 문단 끝에 카피 매트릭스 링크 추가**

§3.4 "솔로 챌린지 (1인 그룹)" 문단 끝에 한 줄 추가:

```markdown
> 2026-05-20: `StatusCard.socialProof` 카피는 status × isSolo × isOwner 3축 — 자세한 매트릭스는 [spec 2026-05-20-group-challenge-concept](./superpowers/specs/2026-05-20-group-challenge-concept.md) C4 참조.
```

- [ ] **Step 11.3 — 링크 검증**

Run:
```bash
pnpm validate:docs
```

Expected: pass.

- [ ] **Step 11.4 — Commit**

```bash
git add docs/PRD.md
git commit -m "docs(prd): one-open-per-group + status×solo×owner copy matrix link"
```

---

## Task 12 — BE_SCHEMA §5.5 비고 갱신

**Files:**
- Modify: `docs/BE_SCHEMA.md`

- [ ] **Step 12.1 — `challenges` 표 하단 비고 두 줄 추가**

`docs/BE_SCHEMA.md` §5.5 `challenges` 테이블 컬럼 표 아래의 비고 영역(`-` bullet 들이 있는 부분) 에 다음 두 줄 추가:

```markdown
- **그룹당 동시 1개 제약**: partial unique index `challenges_one_open_per_group on challenges(group_id) where status in ('pending','accepted','active')` (migration 0029). closed 는 제외하여 종료 챌린지 history 누적 보존.
- `created_by` 컬럼은 POC 에서 추가하지 않음 — owner=creator 모델 유지 (ADR-0011).
```

- [ ] **Step 12.2 — 링크 검증**

Run:
```bash
pnpm validate:docs
```

Expected: pass.

- [ ] **Step 12.3 — Commit**

```bash
git add docs/BE_SCHEMA.md
git commit -m "docs(be-schema): one-open-per-group + created_by note in §5.5"
```

---

## Task 13 — 통합 검증 + PR

**Files:** (변경 없음)

- [ ] **Step 13.1 — spec staging 후 commit**

(spec 파일은 untracked 상태로 따라옴.)

```bash
git add docs/superpowers/specs/2026-05-20-group-challenge-concept.md \
        docs/superpowers/plans/2026-05-20-group-challenge-concept.md
git commit -m "docs(spec+plan): group-challenge concept clarification"
```

- [ ] **Step 13.2 — 전체 typecheck + lint + 단위 테스트**

Run:
```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green.

- [ ] **Step 13.3 — 통합 테스트**

Run:
```bash
pnpm test -- tests/integration
```

Expected: 기존 + 신규 (one-open-challenge-per-group) 모두 PASS.

- [ ] **Step 13.4 — 모바일 viewport 수동 회귀**

Run:
```bash
pnpm dev
```

Chrome DevTools 모바일 emulation 또는 실기로 확인:

1. **솔로 owner pending**: `/challenge/new` 진입 → 폼 → 제출 → `/challenge/<id>` 진입 → StatusCard "서명 대기 · 지금 초대하면 함께 시작해요" + dashboard 탭 KpiPill "시작 전" 확인.
2. **솔로 owner active**: "혼자 시작하기" 클릭 → StatusCard "혼자 시작했어요 · 다음 챌린지엔 함께해요" + KpiPill "남은 N일" 확인.
3. **conflict redirect**: 위 active 상태에서 `/challenge/new` 재진입 → 즉시 `/challenge/<id>` 로 redirect 확인.
4. **closed**: `endChallenge` 트리거 후 KpiPill "종료" 확인.
5. **멀티 active**: 멤버 2명+ active → StatusCard "{N}명이 함께해요" 확인.

- [ ] **Step 13.5 — 최종 빌드**

Run:
```bash
pnpm build
```

Expected: pass.

- [ ] **Step 13.6 — Push + PR**

```bash
git push -u origin fix/group-challenge-concept
gh pr create --base develop --title "fix(challenge): 그룹·챌린지 책임 분리 + 카피 정합화 + 현황판 KPI 버그" --body "$(cat <<'EOF'
## Summary

그룹과 챌린지를 1:N + 직렬(동시 1개) 모델로 재정의하고, 그에 맞춰 카피·KPI 라벨·진입 가드를 정리.

- partial unique index `challenges_one_open_per_group` 추가 (migration 0029)
- `StatusCard.socialProof` 를 status × 솔로 × owner 3축으로 분기
- `DashboardTab` daysPill 라벨을 status 직접 분기 (endAt-null → "종료" 버그 수정)
- `/challenge/new` RSC layout 에 owner open-challenge redirect 가드
- ADR-0011 + PRD §3.3 AC-1 · §3.4 · BE_SCHEMA §5.5 갱신

## Spec / ADR

- Spec: docs/superpowers/specs/2026-05-20-group-challenge-concept.md
- ADR: docs/adr/0011-group-challenge-ownership-model.md

## 가드레일 체크

- [x] 클라이언트→서버 쓰기는 Server Action (createChallenge 기존 유지)
- [x] RLS 전 테이블 ON (변경 없음)
- [x] migration 단방향 (0029)
- [x] AnalyticsEvent PRD §9.1 1:1 (변경 없음)

## Verification

- [x] pnpm typecheck
- [x] pnpm lint
- [x] pnpm test
- [x] pnpm test -- tests/integration
- [x] pnpm build
- [x] 모바일 viewport: pending/accepted/active/closed 4상태 회귀

## Rollback

`drop index challenges_one_open_per_group;` 한 줄로 무효화 가능. UI 변경은 PR revert.
EOF
)"
```

---

## Self-Review

**1. Spec coverage**:

| Spec 섹션 | 구현 task |
|---|---|
| C1 도메인 모델 | ADR-0011 (Task 10) + PRD/BE_SCHEMA (Task 11·12) |
| C2 권한 모델 | 기존 RPC/RLS 그대로 (no-op) + ADR 명시 |
| C3 partial unique index | Task 1·2 |
| C4 카피 매트릭스 | Task 3 |
| C5 daysPill | Task 5 |
| C6 signedCount derive | Task 4 (호출부 1줄) |
| C7 에러 매핑 | Task 9 |
| C8 UI 진입 가드 | Task 7·8 |

모든 섹션이 한 task 이상에서 다뤄짐. 누락 없음.

**2. Placeholder scan**: TBD/TODO 없음. 모든 step 에 actual code 또는 actual command 포함. Step 9.1a 가 조건부지만 분기 조건과 분기 본문 둘 다 명시.

**3. Type consistency**:
- `StatusCardProps` (Task 3) 의 신규 필드 `status`, `signedCount`, `isOwner` → Task 4 호출부와 1:1.
- `DashboardTabProps` (Task 5) 의 신규 필드 `status` → Task 6 호출부와 1:1.
- `OwnerOpenChallenge` 타입 (Task 7) → Task 8 layout 의 `open.id` 사용과 정합.
- ErrorCode `"conflict"`·`"forbidden"` (Task 9) 은 기존 `response.ts` union 그대로.

검토 통과.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-20-group-challenge-concept.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 본 plan 의 task 단위로 fresh subagent 를 dispatch, task 사이에 리뷰. 13개 task 중 일부는 5분 미만이라 분리 비용이 있을 수 있어 묶어 dispatch 도 가능.

**2. Inline Execution** — 이 세션에서 직접 실행, checkpoint 마다 사용자 검토.

어느 쪽으로 진행할까요?
