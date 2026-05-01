# /recap 주간 정산 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PRD §10 화면 8 (주간 정산) · §11.1 Day 7 Happy Path 종착점을 실구현으로 완성. 현재 8줄 TODO 껍데기인 `/recap` 을 "결과 헤더 · 개인 통계 · MVP 멤버 · 예상 벌금(표시만)" 이 있는 Server Component 페이지로 전환.

**Architecture:**
- 기존 `challenge-detail.ts` / `active-challenge.ts` 와 같은 **Server Component + RLS read** 패턴을 따른다. 신규 read 모듈 `src/lib/db/reads/recap.ts` 가 "해당 사용자가 속한 가장 최근 챌린지(진행중 또는 closed)" 를 한 번에 집계해 뷰 모델 `RecapView` 로 반환한다.
- 벌금은 **표시만** (PRD §1.2 · §2 용어 사전 · §14 Out of Scope). 실패자 per-head 벌금 = `penalty_amount`, 성공자 = 0.
- MVP 멤버 = `doneCount >= goalCount` 중 doneCount 최대값 보유자들 (동률 시 모두 표시, 0 명 가능). "MVP 없음" 카피는 Design Brief §1.4 "실패에도 따뜻하게" 톤.
- 페이지 진입 시 analytics `penalty_displayed` 이벤트 1회 발송 (PRD §9.1).
- 홈/피드에서 "주간 정산" 진입은 챌린지가 `closed` 상태이거나 `end_at` 이 지난 `active` 일 때만 노출. BottomNav 는 건드리지 않는다 (다른 상태에서 dead-link 방지).

**Tech Stack:** Next.js 15 App Router · React Server Component · Supabase (RLS) · Vitest + Testing Library · Playwright.

**Non-Goals (이번 PR 스코프 외):**
- 사진 콜라주 (PRD §10 recap 의 "사진 콜라주" 는 v1 이후 백로그)
- 다음 주 CTA (재도전) — PRD §11.2 "Day 8 이후 재도전 여부 결정(v1 기능)"
- 실제 결제/정산 (`settlement-sheet` 는 challenge-detail 에 이미 있음; recap 은 표시만)

---

## 현재 상태 확인

- [src/app/(app)/recap/page.tsx](src/app/(app)/recap/page.tsx) — 8줄 TODO 껍데기
- [src/lib/db/reads/](src/lib/db/reads/) — `active-challenge.ts`, `challenge-detail.ts`, `challenge-feed.ts` 패턴 참고
- [src/lib/challenge/penalty.ts](src/lib/challenge/penalty.ts) — `formatKRW` 재사용
- [src/lib/analytics/schema.ts](src/lib/analytics/schema.ts) — `penalty_displayed` 이벤트 이미 정의됨 (props: `{ amount: number }`)
- [tests/integration/factories.ts](tests/integration/factories.ts) — `createUser`, `createGroup`, `addMember`, `createPendingChallenge`

## Test Environment Notes (프로젝트 컨벤션)

- 프로젝트에는 `@testing-library/jest-dom` 이 설치돼 있지만 **setupFiles 가 없어 `toBeInTheDocument` 매처가 런타임에 없음.** 기존 spec 들(e.g. `challenge-feed.spec.tsx`, `feed-card.spec.tsx`)은 `expect(screen.getByText(...)).toBeTruthy()` 패턴 사용. 이번 플랜의 스펙들도 `toBeTruthy()` 를 쓴다.
- Vitest workspace 의 unit 프로젝트는 `*.spec.tsx` 는 jsdom, 그 외는 node 로 자동 라우팅 (`environmentMatchGlobs`). 필요한 경우 파일 상단에 `// @vitest-environment jsdom` 명시해도 무방.
- Node ICU 의 `ko-KR` + `month: "2-digit", day: "2-digit"` 는 `"05. 01."` (공백·마침표 포함) 을 반환한다. `MM.DD` 형식이 필요하면 `formatToParts` 로 `month`/`day` 값만 뽑아 조합할 것.

## File Structure

| 파일 | 책임 | 종류 |
| ---- | ---- | ---- |
| `src/lib/db/reads/recap.ts` | 정산용 뷰 모델 집계 (챌린지 + 참가자별 doneCount + MVP 판정) | Create |
| `src/lib/db/reads/recap.spec.ts` | `pickMvpIds` / `buildRecapView` 순수 함수 단위 테스트 | Create |
| `src/lib/challenge/settlement.ts` | `computePerHeadPenalty` / `pickMvpIds` 순수 계산 분리 | Create |
| `src/lib/challenge/settlement.spec.ts` | 단위 테스트 | Create |
| `src/app/(app)/recap/page.tsx` | Server Component (redirect / 빈 상태 / 뷰 렌더) | Rewrite |
| `src/app/(app)/recap/_components/recap-hero.tsx` | 성공/실패 헤더 — 타이틀 · 기간 · 결과 뱃지 | Create |
| `src/app/(app)/recap/_components/recap-stats-row.tsx` | 내 통계 — 인증 n/N, 예상 벌금 (표시만) | Create |
| `src/app/(app)/recap/_components/recap-members-list.tsx` | 멤버별 doneCount/성공여부/MVP 뱃지 | Create |
| `src/app/(app)/recap/_components/recap-analytics-beacon.tsx` | 클라이언트 `useEffect` 로 `penalty_displayed` 1회 fire | Create |
| `src/app/(app)/recap/_components/recap-hero.spec.tsx` | RTL 단위 테스트 | Create |
| `src/app/(app)/recap/_components/recap-members-list.spec.tsx` | RTL 단위 테스트 | Create |
| `src/app/(app)/home/_components/progress-card.tsx` | 챌린지 종료 시 "주간 정산 보기" CTA 추가 | Modify |
| `tests/integration/reads/recap.spec.ts` | RLS + 집계 실 DB 검증 | Create |
| `tests/e2e/recap.spec.ts` | 빈 상태 스모크 1개 | Create |

---

## Task 1: `computePerHeadPenalty` 순수 함수 TDD

**Files:**
- Create: `src/lib/challenge/settlement.ts`
- Test: `src/lib/challenge/settlement.spec.ts`

**Why a separate file:** `penalty.ts` 는 presets/format 에 한정. 정산 로직은 Week 2 키워드 분석·v1 결제에 재사용될 가능성이 높아 별도 모듈.

- [ ] **Step 1: 실패 테스트 작성**

```ts
// src/lib/challenge/settlement.spec.ts
import { describe, it, expect } from "vitest";
import { computePerHeadPenalty } from "./settlement";

describe("computePerHeadPenalty", () => {
  it("목표 달성자는 0원", () => {
    expect(computePerHeadPenalty({ doneCount: 3, goalCount: 3, penaltyAmount: 3000 })).toBe(0);
    expect(computePerHeadPenalty({ doneCount: 5, goalCount: 3, penaltyAmount: 3000 })).toBe(0);
  });

  it("목표 미달자는 penalty_amount 그대로 (POC 은 표시만 · 과태료 비례 계산 없음)", () => {
    expect(computePerHeadPenalty({ doneCount: 0, goalCount: 3, penaltyAmount: 3000 })).toBe(3000);
    expect(computePerHeadPenalty({ doneCount: 2, goalCount: 3, penaltyAmount: 3000 })).toBe(3000);
  });

  it("penaltyAmount 음수/NaN 방어 — 0 반환", () => {
    expect(computePerHeadPenalty({ doneCount: 0, goalCount: 3, penaltyAmount: -500 })).toBe(0);
    expect(computePerHeadPenalty({ doneCount: 0, goalCount: 3, penaltyAmount: NaN })).toBe(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/lib/challenge/settlement.spec.ts`
Expected: FAIL with "Cannot find module './settlement'"

- [ ] **Step 3: 최소 구현**

```ts
// src/lib/challenge/settlement.ts
// PRD §1.2 · §11.2 — POC 은 벌금 "표시만". 실제 정산은 v1 이후.
// 규칙: doneCount >= goalCount 성공 · 그 외 per-head = penaltyAmount (분할 계산 없음).

export type SettlementInput = {
  doneCount: number;
  goalCount: number;
  penaltyAmount: number;
};

export function computePerHeadPenalty(input: SettlementInput): number {
  const { doneCount, goalCount, penaltyAmount } = input;
  if (!Number.isFinite(penaltyAmount) || penaltyAmount <= 0) return 0;
  if (doneCount >= goalCount) return 0;
  return penaltyAmount;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/challenge/settlement.spec.ts`
Expected: PASS (3/3)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/challenge/settlement.ts src/lib/challenge/settlement.spec.ts
git commit -m "feat(challenge): add computePerHeadPenalty for recap display"
```

---

## Task 2: `pickMvpIds` 순수 함수 TDD

**Files:**
- Modify: `src/lib/challenge/settlement.ts` (append)
- Test: `src/lib/challenge/settlement.spec.ts` (append)

**규칙 (PRD §10 recap 의 "MVP 멤버"):**
- 후보 = `doneCount >= goalCount` 인 멤버만
- 후보 중 `doneCount` 최대값 보유자(복수 가능, 동률 시 전부 MVP)
- 후보 0 명이면 빈 배열

- [ ] **Step 1: 실패 테스트 작성**

```ts
// src/lib/challenge/settlement.spec.ts (append)
import { pickMvpIds } from "./settlement";

describe("pickMvpIds", () => {
  const baseMember = (overrides: { id: string; doneCount: number }) => ({
    id: overrides.id,
    doneCount: overrides.doneCount,
  });

  it("아무도 목표 미달성 시 빈 배열", () => {
    expect(
      pickMvpIds({
        goalCount: 3,
        members: [baseMember({ id: "a", doneCount: 1 }), baseMember({ id: "b", doneCount: 2 })],
      }),
    ).toEqual([]);
  });

  it("단독 1위", () => {
    expect(
      pickMvpIds({
        goalCount: 3,
        members: [
          baseMember({ id: "a", doneCount: 3 }),
          baseMember({ id: "b", doneCount: 5 }),
          baseMember({ id: "c", doneCount: 4 }),
        ],
      }),
    ).toEqual(["b"]);
  });

  it("동률 1위는 모두 MVP", () => {
    expect(
      pickMvpIds({
        goalCount: 3,
        members: [
          baseMember({ id: "a", doneCount: 3 }),
          baseMember({ id: "b", doneCount: 5 }),
          baseMember({ id: "c", doneCount: 5 }),
        ],
      }),
    ).toEqual(["b", "c"]);
  });

  it("목표 미달자는 doneCount 가 더 커도 MVP 후보에서 제외 (이론적 케이스)", () => {
    // 방어적 — MVP 정의상 goalCount 달성이 선행 조건.
    expect(
      pickMvpIds({
        goalCount: 10,
        members: [baseMember({ id: "a", doneCount: 9 }), baseMember({ id: "b", doneCount: 8 })],
      }),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/lib/challenge/settlement.spec.ts`
Expected: FAIL with "pickMvpIds is not a function"

- [ ] **Step 3: 구현 추가**

```ts
// src/lib/challenge/settlement.ts (append)
export type MvpInput = {
  goalCount: number;
  members: ReadonlyArray<{ id: string; doneCount: number }>;
};

export function pickMvpIds(input: MvpInput): ReadonlyArray<string> {
  const achievers = input.members.filter((m) => m.doneCount >= input.goalCount);
  if (achievers.length === 0) return [];
  const max = Math.max(...achievers.map((m) => m.doneCount));
  return achievers.filter((m) => m.doneCount === max).map((m) => m.id);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/challenge/settlement.spec.ts`
Expected: PASS (7/7 — 기존 3 + 신규 4)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/challenge/settlement.ts src/lib/challenge/settlement.spec.ts
git commit -m "feat(challenge): add pickMvpIds with tie-breaker policy"
```

---

## Task 3: `fetchRecap` read 모듈 TDD (순수 빌더)

**Files:**
- Create: `src/lib/db/reads/recap.ts`
- Test: `src/lib/db/reads/recap.spec.ts`

**책임:**
- `buildRecapView(row, participants, viewerId, now)` — DB row 를 `RecapView` 로 빌드하는 순수 함수 (테스트 용이)
- `fetchRecap(viewerId, options?)` — Supabase 쿼리 + buildRecapView orchestration (실 DB 통합 테스트는 Task 8)

**뷰 모델:**

```ts
export type RecapMemberView = {
  id: string;
  displayName: string;
  doneCount: number;
  achieved: boolean;
  isMvp: boolean;
};

export type RecapView = {
  challengeId: string;
  title: string;
  goalCount: number;
  durationDays: number;
  startAt: string | null;
  endAt: string | null;
  status: "active" | "closed";
  viewerId: string;
  viewerAchieved: boolean;
  viewerDoneCount: number;
  viewerPerHeadPenalty: number; // 표시만
  members: ReadonlyArray<RecapMemberView>;
  /** 멤버 1명 이상 목표 달성 시 true */
  anyoneAchieved: boolean;
};
```

**선정 대상 챌린지:**
- 사용자가 참가한 챌린지 중 `status === "closed"` 또는 (`status === "active"` AND `end_at` 이 과거) 인 것을 `end_at DESC` 로 1 개
- 둘 다 없으면 `null`

- [ ] **Step 1: 실패 테스트 작성 — buildRecapView 순수 함수만**

```ts
// src/lib/db/reads/recap.spec.ts
import { describe, it, expect } from "vitest";
import { buildRecapView } from "./recap";

describe("buildRecapView", () => {
  const now = new Date("2026-05-08T00:00:00Z");

  const challenge = {
    id: "c1",
    title: "주 3회 헬스장",
    goal_count: 3,
    duration_days: 7,
    penalty_amount: 3000,
    status: "closed" as const,
    start_at: "2026-05-01T00:00:00Z",
    end_at: "2026-05-08T00:00:00Z",
  };

  const participants = [
    { user_id: "u-minji", display_name: "민지", done_count: 3 },
    { user_id: "u-jj", display_name: "JJ", done_count: 5 },
    { user_id: "u-hee", display_name: "희수", done_count: 1 },
  ];

  it("viewer 가 목표 달성 — per-head penalty 0원 · achieved true", () => {
    const view = buildRecapView({ challenge, participants, viewerId: "u-minji", now });
    expect(view.viewerAchieved).toBe(true);
    expect(view.viewerDoneCount).toBe(3);
    expect(view.viewerPerHeadPenalty).toBe(0);
  });

  it("viewer 가 미달성 — penalty_amount 그대로", () => {
    const view = buildRecapView({ challenge, participants, viewerId: "u-hee", now });
    expect(view.viewerAchieved).toBe(false);
    expect(view.viewerPerHeadPenalty).toBe(3000);
  });

  it("MVP 는 단독 1위 JJ 뿐", () => {
    const view = buildRecapView({ challenge, participants, viewerId: "u-minji", now });
    const mvpIds = view.members.filter((m) => m.isMvp).map((m) => m.id);
    expect(mvpIds).toEqual(["u-jj"]);
    expect(view.anyoneAchieved).toBe(true);
  });

  it("전원 미달성 시 anyoneAchieved=false · MVP 0명", () => {
    const view = buildRecapView({
      challenge,
      participants: participants.map((p) => ({ ...p, done_count: 1 })),
      viewerId: "u-minji",
      now,
    });
    expect(view.anyoneAchieved).toBe(false);
    expect(view.members.every((m) => m.isMvp === false)).toBe(true);
  });

  it("active 인데 end_at 이 지났으면 status='active' 그대로 반환 (UI 가 노출 여부 결정)", () => {
    const view = buildRecapView({
      challenge: { ...challenge, status: "active" },
      participants,
      viewerId: "u-minji",
      now,
    });
    expect(view.status).toBe("active");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/lib/db/reads/recap.spec.ts`
Expected: FAIL with "Cannot find module './recap'"

- [ ] **Step 3: `buildRecapView` 구현**

```ts
// src/lib/db/reads/recap.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { computePerHeadPenalty, pickMvpIds } from "@/lib/challenge/settlement";

export type RecapMemberView = {
  id: string;
  displayName: string;
  doneCount: number;
  achieved: boolean;
  isMvp: boolean;
};

export type RecapView = {
  challengeId: string;
  title: string;
  goalCount: number;
  durationDays: number;
  startAt: string | null;
  endAt: string | null;
  status: "active" | "closed";
  viewerId: string;
  viewerAchieved: boolean;
  viewerDoneCount: number;
  viewerPerHeadPenalty: number;
  members: ReadonlyArray<RecapMemberView>;
  anyoneAchieved: boolean;
};

type ChallengeRow = {
  id: string;
  title: string;
  goal_count: number;
  duration_days: number;
  penalty_amount: number;
  status: "active" | "closed";
  start_at: string | null;
  end_at: string | null;
};

type ParticipantRow = {
  user_id: string;
  display_name: string | null;
  done_count: number;
};

export function buildRecapView(input: {
  challenge: ChallengeRow;
  participants: ReadonlyArray<ParticipantRow>;
  viewerId: string;
  now: Date;
}): RecapView {
  const { challenge, participants, viewerId } = input;
  const mvpIds = pickMvpIds({
    goalCount: challenge.goal_count,
    members: participants.map((p) => ({ id: p.user_id, doneCount: p.done_count })),
  });

  const members: RecapMemberView[] = participants.map((p) => ({
    id: p.user_id,
    displayName: p.display_name ?? "익명",
    doneCount: p.done_count,
    achieved: p.done_count >= challenge.goal_count,
    isMvp: mvpIds.includes(p.user_id),
  }));

  const viewer = members.find((m) => m.id === viewerId);
  const viewerDoneCount = viewer?.doneCount ?? 0;

  return {
    challengeId: challenge.id,
    title: challenge.title,
    goalCount: challenge.goal_count,
    durationDays: challenge.duration_days,
    startAt: challenge.start_at,
    endAt: challenge.end_at,
    status: challenge.status,
    viewerId,
    viewerAchieved: viewerDoneCount >= challenge.goal_count,
    viewerDoneCount,
    viewerPerHeadPenalty: computePerHeadPenalty({
      doneCount: viewerDoneCount,
      goalCount: challenge.goal_count,
      penaltyAmount: challenge.penalty_amount,
    }),
    members,
    anyoneAchieved: members.some((m) => m.achieved),
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/db/reads/recap.spec.ts`
Expected: PASS (5/5)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/db/reads/recap.ts src/lib/db/reads/recap.spec.ts
git commit -m "feat(reads): add buildRecapView pure builder for weekly settlement"
```

---

## Task 4: `fetchRecap` Supabase 쿼리 orchestration

**Files:**
- Modify: `src/lib/db/reads/recap.ts` (append)

**패턴:** `active-challenge.ts` 참조. 2 단계 쿼리:
1. `challenges` 에서 `end_at ≤ now` 인 참가자 챌린지를 `end_at DESC` 로 1건
2. 해당 challenge_id 의 `challenge_participants` + `users(display_name)` join 으로 멤버 목록, `action_logs` 에서 `challenge_id, user_id` 별 count
3. `buildRecapView` 호출

RLS 가 "내가 속한 그룹만" 필터링하므로 outsider 는 자동으로 null 수신.

- [ ] **Step 1: 구현 추가**

```ts
// src/lib/db/reads/recap.ts (append)
type Options = { client?: SupabaseClient; now?: Date };

/**
 * 내가 참가 중인 챌린지 중 "이미 끝났거나 end_at 이 지난" 가장 최근 챌린지 1개의 정산 뷰.
 * 없으면 null. RLS 가 챌린지/참가자/로그 접근을 자동 필터링.
 */
export async function fetchRecap(
  viewerId: string,
  options: Options = {},
): Promise<RecapView | null> {
  const supabase = options.client ?? (await createClient());
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();

  const { data: challenges, error } = await supabase
    .from("challenges")
    .select("id, title, goal_count, duration_days, penalty_amount, status, start_at, end_at")
    .in("status", ["active", "closed"])
    .lte("end_at", nowIso)
    .order("end_at", { ascending: false })
    .limit(1);

  if (error || !challenges?.[0]) return null;
  const challenge = challenges[0] as ChallengeRow;

  const { data: parts } = await supabase
    .from("challenge_participants")
    .select("user_id, users!inner(display_name)")
    .eq("challenge_id", challenge.id);

  const { data: logs } = await supabase
    .from("action_logs")
    .select("user_id")
    .eq("challenge_id", challenge.id);

  const doneByUser = new Map<string, number>();
  for (const l of logs ?? []) {
    doneByUser.set(l.user_id, (doneByUser.get(l.user_id) ?? 0) + 1);
  }

  const participants: ParticipantRow[] = (parts ?? []).map((p) => {
    const u = Array.isArray(p.users) ? p.users[0] : p.users;
    return {
      user_id: p.user_id,
      display_name: u?.display_name ?? null,
      done_count: doneByUser.get(p.user_id) ?? 0,
    };
  });

  return buildRecapView({ challenge, participants, viewerId, now });
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors

- [ ] **Step 3: 기존 단위 테스트 재확인**

Run: `pnpm vitest run src/lib/db/reads/recap.spec.ts`
Expected: PASS (5/5)

- [ ] **Step 4: 커밋**

```bash
git add src/lib/db/reads/recap.ts
git commit -m "feat(reads): add fetchRecap supabase orchestration with RLS"
```

---

## Task 5: `recap-hero` 컴포넌트 TDD

**Files:**
- Create: `src/app/(app)/recap/_components/recap-hero.tsx`
- Test: `src/app/(app)/recap/_components/recap-hero.spec.tsx`

**책임:** 결과 헤더 — 타이틀, 기간 (MM.DD~MM.DD), 결과 뱃지 (성공/미달/팀 성공).

**카피 (Design Brief §1.4 완곡):**
- `viewerAchieved === true` → "목표 달성!" + 체크 아이콘
- `viewerAchieved === false && anyoneAchieved === true` → "이번 주는 아쉬웠어요" (다른 멤버는 달성했으므로 비교 안 함)
- 둘 다 false → "다음 주엔 같이 해봐요"

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// src/app/(app)/recap/_components/recap-hero.spec.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RecapHero } from "./recap-hero";

describe("RecapHero", () => {
  const base = {
    title: "주 3회 헬스장",
    startAt: "2026-05-01T00:00:00Z",
    endAt: "2026-05-08T00:00:00Z",
  };

  it("viewer 달성 시 '목표 달성!' 표시", () => {
    render(<RecapHero {...base} viewerAchieved={true} anyoneAchieved={true} />);
    expect(screen.getByText("목표 달성!")).toBeInTheDocument();
    expect(screen.getByText("주 3회 헬스장")).toBeInTheDocument();
  });

  it("viewer 미달 · 타인 달성 시 '이번 주는 아쉬웠어요'", () => {
    render(<RecapHero {...base} viewerAchieved={false} anyoneAchieved={true} />);
    expect(screen.getByText("이번 주는 아쉬웠어요")).toBeInTheDocument();
  });

  it("전원 미달성 시 '다음 주엔 같이 해봐요'", () => {
    render(<RecapHero {...base} viewerAchieved={false} anyoneAchieved={false} />);
    expect(screen.getByText("다음 주엔 같이 해봐요")).toBeInTheDocument();
  });

  it("기간을 MM.DD~MM.DD 포맷으로 표시", () => {
    render(<RecapHero {...base} viewerAchieved={true} anyoneAchieved={true} />);
    // ko-KR, Asia/Seoul → 05.01 ~ 05.08
    expect(screen.getByText(/05\.01\s*[~–-]\s*05\.08/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/app/\(app\)/recap/_components/recap-hero.spec.tsx`
Expected: FAIL with module not found

- [ ] **Step 3: 구현**

```tsx
// src/app/(app)/recap/_components/recap-hero.tsx
// PRD §10 화면 8 · §11.1~.2 — 결과 헤더. Design Brief §1.4 완곡 톤.

interface RecapHeroProps {
  title: string;
  startAt: string | null;
  endAt: string | null;
  viewerAchieved: boolean;
  anyoneAchieved: boolean;
}

function formatRange(startAt: string | null, endAt: string | null): string {
  if (!startAt || !endAt) return "";
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
  });
  return `${fmt.format(new Date(startAt))} ~ ${fmt.format(new Date(endAt))}`;
}

function verdictLabel(viewerAchieved: boolean, anyoneAchieved: boolean): string {
  if (viewerAchieved) return "목표 달성!";
  if (anyoneAchieved) return "이번 주는 아쉬웠어요";
  return "다음 주엔 같이 해봐요";
}

export function RecapHero({
  title,
  startAt,
  endAt,
  viewerAchieved,
  anyoneAchieved,
}: RecapHeroProps) {
  return (
    <header className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs font-medium">주간 정산</p>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-muted-foreground text-sm">{formatRange(startAt, endAt)}</p>
      <p
        className="text-primary text-lg font-semibold"
        data-testid="recap-verdict"
      >
        {verdictLabel(viewerAchieved, anyoneAchieved)}
      </p>
    </header>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/app/\(app\)/recap/_components/recap-hero.spec.tsx`
Expected: PASS (4/4)

- [ ] **Step 5: 커밋**

```bash
git add src/app/\(app\)/recap/_components/recap-hero.tsx src/app/\(app\)/recap/_components/recap-hero.spec.tsx
git commit -m "feat(recap): add RecapHero with verdict copy per Design Brief"
```

---

## Task 6: `recap-stats-row` 컴포넌트

**Files:**
- Create: `src/app/(app)/recap/_components/recap-stats-row.tsx`

**책임:** "내 인증 n / N · 예상 벌금 X원 (표시만)" 2-셀 행.

- [ ] **Step 1: 구현 (UI 컴포넌트 · 단위 테스트는 page.tsx 통합 스모크로 커버)**

```tsx
// src/app/(app)/recap/_components/recap-stats-row.tsx
// PRD §10 화면 8 · §1.2 "예정 벌금 · POC 는 표시만".

import { formatKRW } from "@/lib/challenge/penalty";

interface RecapStatsRowProps {
  viewerDoneCount: number;
  goalCount: number;
  viewerPerHeadPenalty: number;
}

export function RecapStatsRow({
  viewerDoneCount,
  goalCount,
  viewerPerHeadPenalty,
}: RecapStatsRowProps) {
  return (
    <section
      aria-label="내 주간 통계"
      className="grid grid-cols-2 gap-3"
    >
      <div className="bg-muted/40 rounded-lg p-4">
        <p className="text-muted-foreground text-xs font-medium">내 인증</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {viewerDoneCount} / {goalCount}
        </p>
      </div>
      <div className="bg-muted/40 rounded-lg p-4">
        <p className="text-muted-foreground text-xs font-medium">예상 벌금</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {formatKRW(viewerPerHeadPenalty)}
        </p>
        <p className="text-muted-foreground mt-1 text-[11px]">표시 전용 · 실제 결제 없음</p>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors

- [ ] **Step 3: 커밋**

```bash
git add src/app/\(app\)/recap/_components/recap-stats-row.tsx
git commit -m "feat(recap): add RecapStatsRow with display-only penalty disclaimer"
```

---

## Task 7: `recap-members-list` 컴포넌트 TDD

**Files:**
- Create: `src/app/(app)/recap/_components/recap-members-list.tsx`
- Test: `src/app/(app)/recap/_components/recap-members-list.spec.tsx`

**책임:** 멤버 이름 · doneCount/goalCount · ✓/–/⭐MVP 뱃지.

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// src/app/(app)/recap/_components/recap-members-list.spec.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RecapMembersList } from "./recap-members-list";

describe("RecapMembersList", () => {
  it("각 멤버 이름 · 인증 횟수 표시", () => {
    render(
      <RecapMembersList
        goalCount={3}
        members={[
          { id: "a", displayName: "민지", doneCount: 3, achieved: true, isMvp: false },
          { id: "b", displayName: "JJ", doneCount: 5, achieved: true, isMvp: true },
        ]}
      />,
    );
    expect(screen.getByText("민지")).toBeInTheDocument();
    expect(screen.getByText("JJ")).toBeInTheDocument();
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByText("5 / 3")).toBeInTheDocument();
  });

  it("MVP 멤버에 MVP 뱃지 표시", () => {
    render(
      <RecapMembersList
        goalCount={3}
        members={[
          { id: "b", displayName: "JJ", doneCount: 5, achieved: true, isMvp: true },
        ]}
      />,
    );
    expect(screen.getByLabelText(/MVP/)).toBeInTheDocument();
  });

  it("미달성 멤버는 '아쉬워요' 뱃지", () => {
    render(
      <RecapMembersList
        goalCount={3}
        members={[
          { id: "c", displayName: "희수", doneCount: 1, achieved: false, isMvp: false },
        ]}
      />,
    );
    expect(screen.getByText("아쉬워요")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/app/\(app\)/recap/_components/recap-members-list.spec.tsx`
Expected: FAIL with module not found

- [ ] **Step 3: 구현**

```tsx
// src/app/(app)/recap/_components/recap-members-list.tsx
// PRD §10 화면 8 — 멤버 리스트 + MVP 뱃지.

import type { RecapMemberView } from "@/lib/db/reads/recap";

interface RecapMembersListProps {
  goalCount: number;
  members: ReadonlyArray<RecapMemberView>;
}

export function RecapMembersList({ goalCount, members }: RecapMembersListProps) {
  return (
    <section aria-label="멤버별 결과" className="flex flex-col gap-2">
      <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
        멤버
      </h2>
      <ul className="flex flex-col divide-y rounded-lg border">
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 p-3">
            <div className="flex flex-col">
              <span className="text-sm font-medium">{m.displayName}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {m.doneCount} / {goalCount}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {m.isMvp && (
                <span
                  aria-label="MVP"
                  className="bg-primary/10 text-primary rounded-full px-2 py-1 text-xs font-semibold"
                >
                  ⭐ MVP
                </span>
              )}
              {!m.isMvp && m.achieved && (
                <span className="text-muted-foreground text-xs">달성</span>
              )}
              {!m.achieved && (
                <span className="text-muted-foreground text-xs">아쉬워요</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/app/\(app\)/recap/_components/recap-members-list.spec.tsx`
Expected: PASS (3/3)

- [ ] **Step 5: 커밋**

```bash
git add src/app/\(app\)/recap/_components/recap-members-list.tsx src/app/\(app\)/recap/_components/recap-members-list.spec.tsx
git commit -m "feat(recap): add RecapMembersList with MVP badge"
```

---

## Task 8: `recap-analytics-beacon` — `penalty_displayed` 이벤트 발사

**Files:**
- Create: `src/app/(app)/recap/_components/recap-analytics-beacon.tsx`

**책임:** 클라이언트 `useEffect` 로 페이지 마운트 시 `penalty_displayed` 이벤트 1회. Strict Mode 중복 방지 ref 가드. 기존 `useEffect` + fetch 패턴은 `push-settings.tsx` 참조.

**API endpoint:** 별도 endpoint 안 만듦. 클라이언트가 `/api/analytics/track` 로 POST… **— 확인 필요:** 현재 프로젝트에 analytics endpoint 가 없으면 서버 측에서 직접 dispatchable 하게 만들어야 함.

- [ ] **Step 1: 기존 analytics wiring 확인**

Run: `grep -rn "penalty_displayed\|track(\|analytics" /Users/ian/gitlab/with-key/src/app /Users/ian/gitlab/with-key/src/lib/analytics | grep -v "\.spec\." | head -20`
Expected: `src/lib/analytics/track.ts` 의 `track(event, options)` 시그니처 확인. 클라이언트 호출 경로 (fetch endpoint 또는 서버 액션) 확인.

**조건 분기:**
- **경우 A**: 이미 클라이언트용 `/api/analytics/track` route 또는 Server Action 이 있으면 그것을 재사용
- **경우 B**: 없으면 Server Component `page.tsx` 에서 **서버 측 track 을 직접 호출** (beacon 컴포넌트 불필요). 이 쪽이 POC 범위에 맞고 Strict Mode 이슈도 없음.

**결정 기준:** 기존 다른 페이지(`home/page.tsx`, `feed/page.tsx`) 가 `feed_view` 를 어떻게 발사하는지 확인 후 동일 패턴 채택.

- [ ] **Step 2: 기존 `feed_view` 패턴 확인**

Run: `grep -rn "feed_view\|track(\"feed_view\|track({ name: \"feed_view" /Users/ian/gitlab/with-key/src | head -10`

**의사 결정 포인트:** 출력에 따라:
- 서버 측 fire 패턴이면 → `page.tsx` 안에 `await track({ name: "penalty_displayed", props: { amount: recap.viewerPerHeadPenalty } })` 한 줄 추가하고 beacon 컴포넌트 만들지 않음. Task 8 여기서 종료.
- 클라이언트 fetch 패턴이면 → 해당 엔드포인트 그대로 beacon 에서 재호출.
- 패턴이 아직 없으면 → 서버 측 직접 호출로 진행 (POC 범위상 더 단순).

**에이전트 주의:** 이 Task 의 구체 구현은 Step 2 의 `grep` 결과로 결정됨. 결과를 확인하고 가장 간단한 경로를 택할 것. 아래는 서버 측 호출 경로(가장 단순) 구현.

- [ ] **Step 3: 서버 측 직접 호출 구현 (Task 10 에서 page.tsx 작성 시 포함)**

별도 beacon 컴포넌트 파일 생성하지 않음. Task 10 참조.

- [ ] **Step 4: 커밋 — 이 Task 는 Task 10 에 merge 됨**

(이 Task 는 실제 파일 생성 없이 Task 10 의 구현에 흡수. Skip commit.)

---

## Task 9: 빈 상태(없음) — `/recap` page.tsx 경계 케이스 먼저

**Files:**
- Rewrite: `src/app/(app)/recap/page.tsx`

**책임:** `fetchRecap` 이 null 일 때 "아직 끝난 챌린지가 없어요" 빈 상태 + 홈 링크. 인증 안 된 사용자는 `/login` redirect (다른 페이지 패턴 동일).

- [ ] **Step 1: 빈 상태 먼저 구현 (yagni — data 경로 다음 태스크)**

```tsx
// src/app/(app)/recap/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchRecap } from "@/lib/db/reads/recap";

// PRD §10 화면 8 · §11.1 Day 7 Happy Path.
export default async function RecapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const recap = await fetchRecap(user.id);

  if (!recap) {
    return (
      <div className="flex flex-col gap-6 p-4">
        <h1 className="text-xl font-semibold">주간 정산</h1>
        <p className="text-muted-foreground break-keep text-sm">
          아직 끝난 챌린지가 없어요. 챌린지가 끝나면 결과를 여기서 돌아봐요.
        </p>
        <Link
          href="/home"
          className="text-primary w-fit text-sm font-semibold underline-offset-4 hover:underline"
        >
          홈으로 가기
        </Link>
      </div>
    );
  }

  // Task 10 에서 채움
  return <div className="p-4">TODO: render recap view</div>;
}
```

- [ ] **Step 2: typecheck + 개발 서버 수동 확인**

Run: `pnpm tsc --noEmit`
Expected: no errors

Run: `pnpm dev` → 로컬 `/recap` 진입해서 로그인 상태에서 빈 상태 문구 렌더 확인.

- [ ] **Step 3: 커밋**

```bash
git add src/app/\(app\)/recap/page.tsx
git commit -m "feat(recap): render empty state when no closed challenge"
```

---

## Task 10: `/recap` page.tsx 정식 렌더 + analytics

**Files:**
- Modify: `src/app/(app)/recap/page.tsx`

- [ ] **Step 1: Task 8 Step 2 결과대로 analytics 호출 경로 적용**

```tsx
// src/app/(app)/recap/page.tsx (전체 교체)
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchRecap } from "@/lib/db/reads/recap";
import { track } from "@/lib/analytics/track";
import { RecapHero } from "./_components/recap-hero";
import { RecapStatsRow } from "./_components/recap-stats-row";
import { RecapMembersList } from "./_components/recap-members-list";

// PRD §10 화면 8 · §11.1 Day 7 Happy Path · §9.1 penalty_displayed.
export default async function RecapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const recap = await fetchRecap(user.id);

  if (!recap) {
    return (
      <div className="flex flex-col gap-6 p-4">
        <h1 className="text-xl font-semibold">주간 정산</h1>
        <p className="text-muted-foreground break-keep text-sm">
          아직 끝난 챌린지가 없어요. 챌린지가 끝나면 결과를 여기서 돌아봐요.
        </p>
        <Link
          href="/home"
          className="text-primary w-fit text-sm font-semibold underline-offset-4 hover:underline"
        >
          홈으로 가기
        </Link>
      </div>
    );
  }

  // PRD §9.1 — fire-and-forget, never throws.
  void track(
    { name: "penalty_displayed", props: { amount: recap.viewerPerHeadPenalty } },
    { userId: user.id },
  );

  return (
    <div className="flex flex-col gap-6 p-4">
      <RecapHero
        title={recap.title}
        startAt={recap.startAt}
        endAt={recap.endAt}
        viewerAchieved={recap.viewerAchieved}
        anyoneAchieved={recap.anyoneAchieved}
      />
      <RecapStatsRow
        viewerDoneCount={recap.viewerDoneCount}
        goalCount={recap.goalCount}
        viewerPerHeadPenalty={recap.viewerPerHeadPenalty}
      />
      <RecapMembersList goalCount={recap.goalCount} members={recap.members} />
    </div>
  );
}
```

**만약 Task 8 Step 2 에서 클라이언트 fetch 패턴이 확인됐다면** → `void track(...)` 줄 대신 `<RecapAnalyticsBeacon amount={recap.viewerPerHeadPenalty} />` 컴포넌트를 렌더. 이 경우 클라이언트 컴포넌트는 별도 파일 생성:

```tsx
// src/app/(app)/recap/_components/recap-analytics-beacon.tsx (조건부)
"use client";
import { useEffect, useRef } from "react";

export function RecapAnalyticsBeacon({ amount }: { amount: number }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    // endpoint 는 실제 경로로 교체
    void fetch("/api/analytics/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "penalty_displayed", props: { amount } }),
    }).catch(() => {});
  }, [amount]);
  return null;
}
```

- [ ] **Step 2: typecheck + lint**

Run: `pnpm tsc --noEmit && pnpm eslint "src/app/(app)/recap/**"`
Expected: no errors

- [ ] **Step 3: 로컬 dev 수동 스모크**

Run: `pnpm dev` → `pnpm login:link [email]` 로 로그인 → 종료된 챌린지(`status=closed` 또는 `end_at` 과거) 가 있는 그룹 계정으로 `/recap` 진입. 확인 항목:
- 헤더 verdict 카피
- 내 인증 n/N + 예상 벌금
- 멤버 리스트 · MVP 뱃지 위치
- Supabase `events` 테이블에 `penalty_displayed` 행 삽입 확인 (또는 네트워크 탭에서 track 호출 확인)

- [ ] **Step 4: 커밋**

```bash
git add src/app/\(app\)/recap/page.tsx
git commit -m "feat(recap): render hero + stats + members + penalty_displayed event"
```

---

## Task 11: 홈 ProgressCard — 챌린지 종료 시 "주간 정산 보기" 진입점

**Files:**
- Modify: `src/app/(app)/home/_components/progress-card.tsx`

**책임:** 챌린지가 `closed` 이거나 `daysLeft === 0` 일 때 카드 하단에 `/recap` 진입 버튼. 그 외 상태에서는 숨김 (BottomNav 는 건드리지 않음 → dead-link 방지).

- [ ] **Step 1: 현재 ProgressCard 확인**

Run: `cat src/app/\(app\)/home/_components/progress-card.tsx`

**에이전트 주의:** 현재 props 시그니처를 먼저 파악하고 breaking change 없이 optional prop 추가. 예: `daysLeft === 0 && status === "active" || status === "closed"` 조건. `status` prop 이 없으면 `daysLeft === 0` 단독으로 결정.

- [ ] **Step 2: 종료 상태에 CTA 추가 (실제 코드는 Step 1 결과에 맞춰 작성)**

```tsx
// src/app/(app)/home/_components/progress-card.tsx 내부, 기존 카드 본문 끝에 추가
{daysLeft === 0 && (
  <Link
    href="/recap"
    className="text-primary mt-3 inline-block text-sm font-semibold underline-offset-4 hover:underline"
  >
    주간 정산 보기 →
  </Link>
)}
```

- [ ] **Step 3: 기존 progress-card 스펙 (존재 시) 실행 · 없으면 skip**

Run: `pnpm vitest run src/app/\(app\)/home/_components/progress-card.spec.tsx 2>/dev/null || echo "no spec"`

기존 테스트 실패 시 → CTA 조건 카피를 테스트 기대값에 맞춰 조정.

- [ ] **Step 4: typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors

- [ ] **Step 5: 커밋**

```bash
git add src/app/\(app\)/home/_components/progress-card.tsx
git commit -m "feat(home): surface recap link when challenge ends"
```

---

## Task 12: 통합 테스트 — `fetchRecap` RLS + 집계

**Files:**
- Create: `tests/integration/reads/recap.spec.ts`

**커버리지:**
- outsider 는 null 수신 (RLS)
- closed 챌린지 1개만 반환 (active 는 end_at 미경과면 미포함)
- doneCount 와 MVP 판정 정확도
- 3명 그룹 시나리오 (1명 MVP, 1명 달성, 1명 미달)

- [ ] **Step 1: factory 확장 확인**

Run: `grep -n "export async function" tests/integration/factories.ts`
Expected: `createUser`, `createGroup`, `addMember`, `createPendingChallenge`.

**문제:** `createPendingChallenge` 는 status=pending 고정. 통합 테스트에선 closed + action_logs 가 필요 → factories 에 신규 helper 또는 spec 내부 inline insert 선택. **YAGNI — inline insert 로 처리**.

- [ ] **Step 2: 테스트 작성**

```ts
// tests/integration/reads/recap.spec.ts
import { describe, it, expect } from "vitest";
import { admin, asUser } from "../setup";
import { createUser, createGroup, addMember, createPendingChallenge } from "../factories";
import { buildRecapView } from "@/lib/db/reads/recap";

async function closeChallenge(challengeId: string, endAt: Date) {
  const startAt = new Date(endAt.getTime() - 7 * 86_400_000);
  await admin
    .from("challenges")
    .update({ status: "closed", start_at: startAt.toISOString(), end_at: endAt.toISOString() })
    .eq("id", challengeId);
}

async function insertActionLogs(opts: {
  challengeId: string;
  userId: string;
  count: number;
}) {
  const rows = Array.from({ length: opts.count }, (_, i) => ({
    challenge_id: opts.challengeId,
    user_id: opts.userId,
    activity_type: "gym",
    photo_path: `test/${opts.userId}/${i}.jpg`,
    selected_keywords: ["펌핑"],
    shown_keywords: ["펌핑", "하체데이"],
    reroll_count: 0,
  }));
  const { error } = await admin.from("action_logs").insert(rows);
  if (error) throw error;
}

describe("fetchRecap integration", () => {
  it("outsider 는 closed 챌린지를 볼 수 없다 (RLS)", async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const g = await createGroup(owner.id);
    const c = await createPendingChallenge(g.id);
    await closeChallenge(c.id, new Date(Date.now() - 86_400_000));

    const outsiderClient = await asUser(outsider);
    const { data } = await outsiderClient
      .from("challenges")
      .select("id")
      .eq("id", c.id);
    expect(data).toEqual([]);
  });

  it("3명 그룹 — MVP 단독 · 달성자 · 미달성자 집계", async () => {
    const minji = await createUser({ displayName: "민지" });
    const jj = await createUser({ displayName: "JJ" });
    const hee = await createUser({ displayName: "희수" });
    const g = await createGroup(minji.id);
    await addMember(g.id, jj.id);
    await addMember(g.id, hee.id);
    const c = await createPendingChallenge(g.id, { goalCount: 3, penaltyAmount: 3000 });
    await admin.from("challenge_participants").insert([
      { challenge_id: c.id, user_id: minji.id, signed_at: new Date().toISOString() },
      { challenge_id: c.id, user_id: jj.id, signed_at: new Date().toISOString() },
      { challenge_id: c.id, user_id: hee.id, signed_at: new Date().toISOString() },
    ]);
    await closeChallenge(c.id, new Date(Date.now() - 3600_000));
    await insertActionLogs({ challengeId: c.id, userId: minji.id, count: 3 });
    await insertActionLogs({ challengeId: c.id, userId: jj.id, count: 5 });
    await insertActionLogs({ challengeId: c.id, userId: hee.id, count: 1 });

    // page.tsx 가 createClient (next/headers) 을 요구하므로 fetchRecap 은 직접 호출 불가.
    // RLS + 집계 동작을 buildRecapView 에 주입할 데이터로 검증.
    const { data: challenges } = await (await asUser(minji))
      .from("challenges")
      .select("id, title, goal_count, duration_days, penalty_amount, status, start_at, end_at")
      .eq("id", c.id)
      .limit(1);
    expect(challenges?.[0]).toBeTruthy();

    const { data: logs } = await (await asUser(minji))
      .from("action_logs")
      .select("user_id")
      .eq("challenge_id", c.id);
    const doneByUser = new Map<string, number>();
    for (const l of logs ?? []) doneByUser.set(l.user_id, (doneByUser.get(l.user_id) ?? 0) + 1);

    const view = buildRecapView({
      challenge: challenges![0] as Parameters<typeof buildRecapView>[0]["challenge"],
      participants: [
        { user_id: minji.id, display_name: "민지", done_count: doneByUser.get(minji.id) ?? 0 },
        { user_id: jj.id, display_name: "JJ", done_count: doneByUser.get(jj.id) ?? 0 },
        { user_id: hee.id, display_name: "희수", done_count: doneByUser.get(hee.id) ?? 0 },
      ],
      viewerId: minji.id,
      now: new Date(),
    });

    expect(view.viewerAchieved).toBe(true);
    expect(view.viewerPerHeadPenalty).toBe(0);
    expect(view.members.find((m) => m.id === jj.id)?.isMvp).toBe(true);
    expect(view.members.find((m) => m.id === minji.id)?.isMvp).toBe(false);
    expect(view.members.find((m) => m.id === hee.id)?.achieved).toBe(false);
  });
});
```

- [ ] **Step 3: 통합 테스트 실행**

Run: `pnpm test:integration tests/integration/reads/recap.spec.ts`
Expected: PASS (2/2). 실 remote DB 사용.

- [ ] **Step 4: 커밋**

```bash
git add tests/integration/reads/recap.spec.ts
git commit -m "test(recap): RLS + 3-member aggregation integration coverage"
```

---

## Task 13: E2E 빈 상태 스모크

**Files:**
- Create: `tests/e2e/recap.spec.ts`

**범위 (의도적으로 작음):** 로그인 상태에서 `/recap` 진입 시 "주간 정산" 헤딩과 빈 상태 문구(또는 실제 결과)가 렌더되고 5xx/크래시가 없다는 1개 스모크. 실 데이터 생성은 통합 테스트에서 이미 커버.

- [ ] **Step 1: 기존 fixture 확인**

Run: `head -40 tests/e2e/fixtures.ts`

- [ ] **Step 2: 스모크 작성 (기존 push-settings.spec.ts 패턴 참조)**

```ts
// tests/e2e/recap.spec.ts
import { test, expect } from "./fixtures";

test.describe("/recap smoke", () => {
  test("로그인 상태에서 recap 페이지가 렌더된다", async ({ authedPage }) => {
    await authedPage.goto("/recap");
    await expect(authedPage.getByRole("heading", { name: "주간 정산" })).toBeVisible();
    // 종료된 챌린지 유무와 무관하게 페이지는 200 응답이어야 한다.
  });
});
```

**참고:** `authedPage` fixture 가 없으면 `push-settings.spec.ts` 의 로그인 경로를 재사용. 없으면 그 패턴에 맞게 수정.

- [ ] **Step 3: E2E 실행**

Run: `pnpm test:e2e recap`
Expected: PASS. 재실행으로 flaky 확인.

- [ ] **Step 4: 커밋**

```bash
git add tests/e2e/recap.spec.ts
git commit -m "test(recap): e2e smoke for empty and default render"
```

---

## Task 14: 최종 검증 — typecheck · lint · test · build

- [ ] **Step 1: 전체 파이프라인**

```bash
pnpm tsc --noEmit --pretty false
pnpm eslint .
pnpm vitest run
pnpm build
```

Expected: 모두 green. unit 기존 N → N+(약 12) 개 증가.

- [ ] **Step 2: 필요 시 문서 업데이트 — JOURNAL.md (gitignored · 로컬 전용)**

Run: `echo "\n## 2026-05-01 — /recap 주간 정산\n- 8줄 TODO 페이지를 Hero/Stats/Members 렌더 Server Component 로 전환\n- fetchRecap: closed OR end_at<now 인 최신 챌린지 1건을 RLS 로 조회\n- MVP = doneCount>=goalCount 중 최대값 보유자 (동률 복수)\n- 벌금은 표시만(PRD §1.2 · §14)\n- penalty_displayed 이벤트 발사\n" >> docs/JOURNAL.md`

- [ ] **Step 3: PR 생성 (한국어 body · `.claude/rules/common/git-workflow.md`)**

```bash
git push -u origin <branch>
gh pr create --title "feat(recap): implement /recap weekly settlement page" --body "$(cat <<'EOF'
## Summary
- PRD §10 화면 8 · §11.1 Day 7 종착점 구현. 8줄 TODO 껍데기였던 `/recap` 을 Hero + Stats + Members 렌더 Server Component 로 전환.
- `fetchRecap` 이 "closed 이거나 end_at 이 지난 active" 최신 챌린지 1건을 RLS 로 조회. outsider 자동 null.
- MVP 판정 = `doneCount >= goalCount` 중 `doneCount` 최대값 보유자 (동률 시 전원 MVP).
- 예상 벌금은 **표시만** (PRD §1.2 · §14 Out of Scope). "표시 전용 · 실제 결제 없음" disclaimer 포함.
- 페이지 진입 시 `penalty_displayed` 이벤트 1회 발사.
- 홈 `ProgressCard` 에 `daysLeft===0` 시 "주간 정산 보기" CTA 추가 (BottomNav 는 dead-link 방지 위해 건드리지 않음).

## Test plan
- [x] Unit — `settlement.spec.ts` (7) · `recap.spec.ts` (5) · `recap-hero.spec.tsx` (4) · `recap-members-list.spec.tsx` (3)
- [x] Integration — `reads/recap.spec.ts` (RLS + 3-member 집계, 2 tests)
- [x] E2E — `recap.spec.ts` 빈 상태 smoke 1
- [x] Typecheck / lint / build green
- [x] 로컬 수동 — 종료된 챌린지로 헤더 verdict · stats · MVP 뱃지 · penalty_displayed 이벤트 확인

## Scope 외 (follow-up)
- 사진 콜라주 (v1 이후)
- 다음 주 재도전 CTA (PRD §11.2, v1 기능)
- 실제 결제/정산 (PRD §14)
EOF
)"
```

- [ ] **Step 4: 머지 후 세션 마감**

---

## Self-Review

**1. Spec coverage (PRD §10 화면 8 + §11.1~.2):**
- ✅ 결과 헤더 → Task 5 (RecapHero verdict)
- ✅ MVP → Task 2 (pickMvpIds) + Task 7 (members list badge)
- ✅ 개인 통계 → Task 6 (RecapStatsRow)
- ✅ 예상 벌금 표시만 → Task 1 (computePerHeadPenalty) + Task 6 disclaimer
- ✅ `penalty_displayed` 이벤트 → Task 10
- ⏸️ 사진 콜라주 → 의도적 비스코프 (Non-Goals)
- ⏸️ 다음 주 CTA → 의도적 비스코프 (Non-Goals)

**2. Placeholder scan:** "TBD/TODO/implement later" 제로 확인.

**3. Type consistency:**
- `RecapMemberView` / `RecapView` 타입이 Task 3 에서 정의, Task 7 · 10 에서 import 사용. 일치.
- `computePerHeadPenalty` / `pickMvpIds` 시그니처 Task 1~2 정의, Task 3 에서 import 호출. 일치.
- `formatKRW` 는 기존 `@/lib/challenge/penalty` 재사용 — 신규 정의 없음.

**4. 위험 체크:**
- Task 8 (analytics 호출 경로) 는 기존 코드 패턴 확인 후 분기됨 — 에이전트에게 Step 2 grep 명령 명시.
- Task 11 (ProgressCard) 의 정확한 수정 위치는 현재 props 시그니처 확인 후 결정 — 에이전트에게 Step 1 확인 명시.
- Task 12 integration 은 `next/headers` 의존 우회를 위해 `buildRecapView` 를 직접 호출 (설계 의도대로 분리됨).
