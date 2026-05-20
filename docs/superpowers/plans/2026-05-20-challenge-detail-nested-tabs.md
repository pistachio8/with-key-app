# Challenge Detail Nested Route Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/challenge/[id]` 의 3개 탭(인증 피드 · 현황판 · 정보)을 single-page + client tab switcher 모델에서 **nested route segments** 모델로 재편하고, 동시에 홈 → 상세 진입 시 `useLinkStatus` 기반 row pending indicator 와 각 탭별 `loading.tsx` skeleton 으로 perceived performance 를 회복한다.

**Architecture:**
- `layout.tsx` 가 shell(StatusCard · banners · TabNav · owner menu)과 모든 탭 공통 데이터를 담당. 자식 segment(`page.tsx` / `dashboard/` / `info/`)는 자기 탭에만 필요한 데이터를 fetch.
- React `cache()` 로 `getAuthedUser` · `fetchChallengeDetail` · `fetchChallengeFeed` 를 request-scope dedupe → layout + page 가 같은 reader 를 호출해도 DB hit 1회.
- TabNav 는 `<Link prefetch>` 기반 client component. `useLinkStatus()` 로 클릭 즉시 spinner. 탭 전환은 진짜 navigation 이므로 layout 은 재실행되지 않고 page segment 만 마운트.
- 기존 `?tab=` 쿼리와 `?just_joined=1` 진입은 layout 에서 `redirect()` 로 새 경로(`/dashboard` · `/info`)에 호환.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Supabase SSR client · Vitest (jsdom for `.spec.tsx`).

**Non-Goals (이번 PR 스코프 외):**
- `group/[id]` 등 다른 페이지의 탭 모델 — 별도 결정
- Segment 별 `error.tsx` 추가 — POC 는 root error boundary 로 충분
- row 전체 opacity 피드백 (D-N 자리 spinner 만 본 PR)
- PPR / 부분 캐시 도입

---

## 사전 — with-key 작업 시작 프로토콜

| 필드 | 내용 |
| ---- | ---- |
| **Fact** | dogfood 직전 사용자 보고 — (1) 홈 row 클릭 시 진입 피드백 부재, (2) 탭 클릭 시 매번 렌더링 지연. 원인: `router.replace` 가 RSC re-fetch 를 트리거하지만 `tab` 쿼리는 서버 분기에 미사용 (leaky abstraction). 해법: nested segments + cache dedupe. [ADR-0010](../../adr/0010-challenge-detail-nested-route-tabs.md) · [spec](../specs/2026-05-20-challenge-detail-nested-tabs.md). |
| **작업 범위** | `src/app/(app)/challenge/[id]/**` 전체 트리 재편 · `src/app/(app)/home/_components/running-challenge-list.tsx` row pending · `src/lib/supabase/auth.ts` 신설 · `src/lib/db/reads/challenge-{detail,feed}.ts` cache wrapping · `src/app/(app)/challenge/[id]/action/_components/action-result-dialog.tsx` URL 갱신. |
| **브랜치** | `fix/challenge-detail-nested-tabs` (base: `develop`). |
| **데이터/RLS** | 없음 — RLS · migration · RPC 변경 전혀 없음. |
| **검증 계획** | `pnpm typecheck` → `pnpm lint` → `pnpm test` → `pnpm build && pnpm start` (production mode 에서 prefetch 동작 확인) → 모바일 viewport 수동 검증 10개 시나리오. |

---

## 현재 상태 확인

- `src/app/(app)/challenge/[id]/page.tsx` — 모든 fetch + 3 탭 props 계산 + `ChallengeTabs` 렌더. 이 파일이 layout + page (feed) 로 분리됨.
- `src/app/(app)/challenge/[id]/_components/challenge-tabs.tsx` — client tab switcher. `useSearchParams` + `router.replace` 사용. **삭제 대상**. spec 파일 없음 (그냥 파일 삭제만).
- `src/lib/db/reads/challenge-detail.ts` L35 `fetchChallengeDetail(id)` — `cache()` **미적용** → 적용 필요.
- `src/lib/db/reads/challenge-feed.ts` L43 `fetchChallengeFeed(id, userId)` — `cache()` **미적용** → 적용 필요.
- `src/lib/supabase/server.ts` — `createClient()` 정의. `getAuthedUser` helper 는 신규 `src/lib/supabase/auth.ts` 에 추가.
- `src/app/(app)/challenge/[id]/action/_components/action-result-dialog.tsx` L50 — `?tab=dashboard` URL 갱신 1줄.
- `src/app/(app)/home/_components/running-challenge-list.tsx` L46-83 — `<Link>` row 내부에 `RowPendingIndicator` 추가.
- `src/components/ui/fab.tsx` — 기존 컴포넌트. 변경 없음.
- `src/lib/push/dispatch.ts` L126, L144, L162 — `/challenge/${id}` (default feed) + `/challenge/${id}/action` 만 사용. 새 구조 호환. 변경 없음.

---

## Test Environment Notes (프로젝트 컨벤션)

- `@testing-library/jest-dom` 매처(`toBeInTheDocument`) 부재 — `expect(screen.getByText(...)).toBeTruthy()` 패턴 사용.
- Vitest workspace 는 `*.spec.tsx` → jsdom, 그 외 → node 자동 라우팅.
- `useLinkStatus()` 는 production build 에서만 pending 상태가 진짜로 동작 — 단위 테스트에선 mock 필요. `pnpm dev` 에서 prefetch 효과는 비활성.
- `usePathname()` mock 패턴: `vi.mock("next/navigation", () => ({ usePathname: () => "/challenge/123" }))`.
- `redirect()` 는 layout 에서 동기 호출 후 throw — 테스트 시 `vi.mock("next/navigation")` 으로 spy.

---

## File Structure

| 파일 | 책임 | 종류 |
| ---- | ---- | ---- |
| `src/lib/supabase/auth.ts` | `getAuthedUser = cache(async () => { ... })` — 인증된 user 1회 fetch | Create |
| `src/lib/supabase/auth.spec.ts` | mock 기반 동작 검증 | Create |
| `src/app/(app)/challenge/[id]/layout.tsx` | shell + `?tab=`·`?just_joined` redirect + 공통 fetch + TabNav | Create |
| `src/app/(app)/challenge/[id]/loading.tsx` | feed-shaped skeleton (root segment 의 default loading) | Create |
| `src/app/(app)/challenge/[id]/page.tsx` | feed 탭 — feed fetch + FeedTab + Fab | Modify (축소) |
| `src/app/(app)/challenge/[id]/dashboard/page.tsx` | dashboard 탭 — feed fetch (cache hit) + DashboardTab + Fab | Create |
| `src/app/(app)/challenge/[id]/dashboard/loading.tsx` | dashboard-shaped skeleton | Create |
| `src/app/(app)/challenge/[id]/info/page.tsx` | info 탭 — feed fetch 없음 + InfoTab | Create |
| `src/app/(app)/challenge/[id]/info/loading.tsx` | info-shaped skeleton | Create |
| `src/app/(app)/challenge/[id]/_components/tab-nav.tsx` | `<Link prefetch>` 기반 client tab nav + `useLinkStatus` spinner | Create |
| `src/app/(app)/challenge/[id]/_components/tab-nav.spec.tsx` | active 결정 (usePathname) + 3 link href 검증 | Create |
| `src/app/(app)/challenge/[id]/_components/challenge-tabs.tsx` | (삭제) | Delete |
| `src/app/(app)/challenge/[id]/action/_components/action-result-dialog.tsx:50` | `?tab=dashboard` → `/dashboard` URL 갱신 1줄 | Modify |
| `src/app/(app)/home/_components/row-pending-indicator.tsx` | `useLinkStatus` 읽는 client child (server-list 가 client 가 아니면 별도 분리) | Create |
| `src/app/(app)/home/_components/running-challenge-list.tsx` | `<Link>` 자식으로 `RowPendingIndicator` 사용 | Modify |
| `src/app/(app)/home/_components/running-challenge-list.spec.tsx` | pending=true 시 spinner / pending=false 시 D-N | Modify |
| `src/lib/db/reads/challenge-detail.ts` | `fetchChallengeDetail = cache(async ...)` wrap | Modify |
| `src/lib/db/reads/challenge-feed.ts` | `fetchChallengeFeed = cache(async ...)` wrap | Modify |

---

## Task 1: 브랜치 생성 + 사전 확인

**Files:** 없음 (git 작업만)

- [ ] **Step 1: develop 최신 동기화**

```bash
git fetch origin
git checkout develop
git pull origin develop
```

- [ ] **Step 2: 브랜치 생성**

```bash
git checkout -b fix/challenge-detail-nested-tabs
```

- [ ] **Step 3: 베이스라인 통과 확인**

```bash
pnpm install
pnpm typecheck
```

Expected: 타입 에러 없음.

---

## Task 2: `getAuthedUser` cache helper (TDD)

**Files:**
- Create: `src/lib/supabase/auth.ts`
- Create: `src/lib/supabase/auth.spec.ts`

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/supabase/auth.spec.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();

vi.mock("./server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));

describe("getAuthedUser", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    vi.resetModules();
  });

  it("user 객체를 반환한다", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.c" } }, error: null });
    const { getAuthedUser } = await import("./auth");
    const result = await getAuthedUser();
    expect(result.user?.id).toBe("u1");
  });

  it("error 가 있으면 user 는 null", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: "no session" } });
    const { getAuthedUser } = await import("./auth");
    const result = await getAuthedUser();
    expect(result.user).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행 — FAIL**

```bash
pnpm test src/lib/supabase/auth.spec.ts
```

Expected: FAIL — `Cannot find module './auth'`.

- [ ] **Step 3: 최소 구현**

`src/lib/supabase/auth.ts`:
```ts
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "./server";

// React cache → 같은 request scope 안에서 supabase.auth.getUser 를 1회만 호출.
// challenge/[id] layout + 각 탭 page 가 동시에 user 를 필요로 하는 경우 dedupe.
export const getAuthedUser = cache(async (): Promise<{ user: User | null }> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return { user: null };
  return { user: data.user };
});
```

- [ ] **Step 4: 테스트 실행 — PASS**

```bash
pnpm test src/lib/supabase/auth.spec.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/supabase/auth.ts src/lib/supabase/auth.spec.ts
git commit -m "feat(supabase): add getAuthedUser cache helper for request-scope dedupe"
```

---

## Task 3: reader 함수에 `cache()` 적용

**Files:**
- Modify: `src/lib/db/reads/challenge-detail.ts`
- Modify: `src/lib/db/reads/challenge-feed.ts`

- [ ] **Step 1: `fetchChallengeDetail` cache wrap**

`src/lib/db/reads/challenge-detail.ts` L1 영역에 `import { cache } from "react";` 추가.

`export async function fetchChallengeDetail(...)` 정의를 다음으로 변경:
```ts
// cache() — layout + 각 page 가 같은 request 안에서 호출하면 DB hit 1회.
export const fetchChallengeDetail = cache(
  async (challengeId: string): Promise<ChallengeDetailView | null> => {
    // ... 기존 함수 본문 그대로
  },
);
```

- [ ] **Step 2: `fetchChallengeFeed` cache wrap**

`src/lib/db/reads/challenge-feed.ts` L1 영역에 `import { cache } from "react";` 추가.

기존 `export async function fetchChallengeFeed(challengeId, viewerId, options)` → 다음으로 변경:
```ts
export const fetchChallengeFeed = cache(
  async (challengeId: string, viewerId: string, options?: Options): Promise<FeedItemView[]> => {
    // ... 기존 본문 그대로
  },
);
```

주의: 옵션 인자(`client?`)는 시그니처 호환을 위해 유지. cache key 는 args reference equality 라 client 다른 인스턴스가 전달되면 cache 안 됨 (의도 — 호출처가 client 명시 시 dedupe 불가). 일반 호출(options 생략)은 dedupe 동작.

- [ ] **Step 3: 타입체크 + 기존 테스트 통과 확인**

```bash
pnpm typecheck
pnpm test src/lib/db/reads
```

Expected: PASS. `export const fn = cache(async (...) => {...})` 도 호출 시 `await fn(...)` 동일.

- [ ] **Step 4: 통합 테스트 확인**

```bash
pnpm test tests/integration/reads
```

Expected: 기존 PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/db/reads/challenge-detail.ts src/lib/db/reads/challenge-feed.ts
git commit -m "perf(reads): wrap challenge readers with React cache for request-scope dedupe"
```

---

## Task 4: `TabNav` 컴포넌트 (TDD)

**Files:**
- Create: `src/app/(app)/challenge/[id]/_components/tab-nav.tsx`
- Create: `src/app/(app)/challenge/[id]/_components/tab-nav.spec.tsx`

- [ ] **Step 1: 실패 테스트 작성**

`src/app/(app)/challenge/[id]/_components/tab-nav.spec.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TabNav } from "./tab-nav";

let mockPathname = "/challenge/abc";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));
vi.mock("next/link", async () => {
  const actual = await vi.importActual<typeof import("next/link")>("next/link");
  return {
    ...actual,
    default: actual.default,
    useLinkStatus: () => ({ pending: false }),
  };
});

describe("TabNav", () => {
  beforeEach(() => {
    mockPathname = "/challenge/abc";
  });

  it("3개 탭 링크 렌더링", () => {
    render(<TabNav challengeId="abc" />);
    expect(screen.getByText("인증 피드")).toBeTruthy();
    expect(screen.getByText("현황판")).toBeTruthy();
    expect(screen.getByText("정보")).toBeTruthy();
  });

  it("pathname /challenge/abc 일 때 인증 피드가 active", () => {
    mockPathname = "/challenge/abc";
    render(<TabNav challengeId="abc" />);
    const feedTab = screen.getByText("인증 피드").closest("a");
    expect(feedTab?.getAttribute("aria-selected")).toBe("true");
  });

  it("pathname /challenge/abc/dashboard 일 때 현황판이 active", () => {
    mockPathname = "/challenge/abc/dashboard";
    render(<TabNav challengeId="abc" />);
    const dashTab = screen.getByText("현황판").closest("a");
    expect(dashTab?.getAttribute("aria-selected")).toBe("true");
    const feedTab = screen.getByText("인증 피드").closest("a");
    expect(feedTab?.getAttribute("aria-selected")).toBe("false");
  });

  it("pathname /challenge/abc/info 일 때 정보가 active", () => {
    mockPathname = "/challenge/abc/info";
    render(<TabNav challengeId="abc" />);
    const infoTab = screen.getByText("정보").closest("a");
    expect(infoTab?.getAttribute("aria-selected")).toBe("true");
  });
});
```

- [ ] **Step 2: 테스트 실행 — FAIL**

```bash
pnpm test src/app/\(app\)/challenge/\[id\]/_components/tab-nav.spec.tsx
```

Expected: FAIL — `Cannot find module './tab-nav'`.

- [ ] **Step 3: 구현**

`src/app/(app)/challenge/[id]/_components/tab-nav.tsx`:
```tsx
"use client";

// challenge/[id] 의 3 탭(feed/dashboard/info) navigation.
// <Link prefetch> 로 즉시 전환 + useLinkStatus 로 클릭 즉시 spinner.

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "feed", label: "인증 피드", suffix: "" },
  { key: "dashboard", label: "현황판", suffix: "/dashboard" },
  { key: "info", label: "정보", suffix: "/info" },
] as const;

interface TabNavProps {
  challengeId: string;
}

export function TabNav({ challengeId }: TabNavProps) {
  const pathname = usePathname();
  const base = `/challenge/${challengeId}`;

  return (
    <div role="tablist" aria-label="챌린지 보기" className="bg-muted flex gap-1 rounded-full p-1">
      {TABS.map((t) => {
        const href = `${base}${t.suffix}`;
        const isActive = t.suffix === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={t.key}
            href={href}
            role="tab"
            aria-selected={isActive}
            prefetch
            className={cn(
              "flex-1 rounded-full px-3 py-1.5 text-center text-[12px] font-semibold transition-colors",
              "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              isActive
                ? "bg-card text-foreground shadow-[0_1px_2px_rgba(20,24,36,0.06)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <TabLabel label={t.label} />
          </Link>
        );
      })}
    </div>
  );
}

function TabLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return (
    <span className="inline-flex items-center justify-center gap-1">
      {label}
      {pending && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
    </span>
  );
}
```

- [ ] **Step 4: 테스트 실행 — PASS**

```bash
pnpm test src/app/\(app\)/challenge/\[id\]/_components/tab-nav.spec.tsx
```

Expected: 4 tests PASS.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(app)/challenge/[id]/_components/tab-nav.tsx" "src/app/(app)/challenge/[id]/_components/tab-nav.spec.tsx"
git commit -m "feat(challenge): add TabNav with Link prefetch + useLinkStatus spinner"
```

---

## Task 5: `layout.tsx` + `page.tsx` 축소 + `loading.tsx` (한 커밋)

이 셋은 묶어야 빌드가 통과한다 — layout 신설 + page 가 feed-only 로 축소되어야 dual-rendering 없이 동작.

**Files:**
- Create: `src/app/(app)/challenge/[id]/layout.tsx`
- Modify: `src/app/(app)/challenge/[id]/page.tsx` (대폭 축소)
- Create: `src/app/(app)/challenge/[id]/loading.tsx`

- [ ] **Step 1: `layout.tsx` 작성**

`src/app/(app)/challenge/[id]/layout.tsx`:
```tsx
import { notFound, redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { getAuthedUser } from "@/lib/supabase/auth";
import { ChallengeEndedBanner } from "./_components/challenge-ended-banner";
import { ChallengeOwnerMenu } from "./_components/challenge-owner-menu";
import { JustJoinedBanner } from "./_components/just-joined-banner";
import { StartChallengeCard } from "./_components/start-challenge-card";
import { StatusCard } from "./_components/status-card";
import { TabNav } from "./_components/tab-nav";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  tab?: string;
  just_joined?: string;
  activated?: string;
  joined_late?: string;
}>;

function computeDaysLeft(endAtIso: string | null): number | null {
  if (!endAtIso) return null;
  return Math.max(0, Math.ceil((new Date(endAtIso).getTime() - Date.now()) / 86_400_000));
}

export default async function ChallengeDetailLayout({
  children,
  params,
  searchParams,
}: {
  children: React.ReactNode;
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;

  // 호환 redirect: tab 제외 query 보존 + just_joined 진입은 info 탭으로.
  const preserved = new URLSearchParams();
  if (sp.just_joined === "1") preserved.set("just_joined", "1");
  if (sp.activated === "1") preserved.set("activated", "1");
  if (sp.joined_late === "1") preserved.set("joined_late", "1");
  const preservedQuery = preserved.toString() ? `?${preserved.toString()}` : "";

  if (sp.tab === "dashboard") redirect(`/challenge/${id}/dashboard${preservedQuery}`);
  if (sp.tab === "info") redirect(`/challenge/${id}/info${preservedQuery}`);
  if (sp.tab === undefined && sp.just_joined === "1") {
    redirect(`/challenge/${id}/info${preservedQuery}`);
  }

  const { user } = await getAuthedUser();
  if (!user) redirect("/login");

  const detail = await fetchChallengeDetail(id);
  if (!detail) notFound();

  const me = detail.members.find((m) => m.id === user.id);
  const isParticipant = me != null;
  const mySigned = me?.signed ?? false;
  const isOwner = detail.group.ownerId === user.id;
  const isEndedByDate =
    detail.status === "active" && detail.endAt != null && new Date(detail.endAt) < new Date();
  const showEndedBanner = detail.status === "closed" || isEndedByDate;

  const ownerName =
    detail.members.find((m) => m.id === detail.group.ownerId)?.displayName ?? "운영자";
  const totalSigned = detail.members.filter((m) => m.signed).length;
  const unsignedCount = detail.members.length - totalSigned;
  const daysLeft = computeDaysLeft(detail.endAt);

  const justJoined = sp.just_joined === "1";
  const activated = sp.activated === "1";
  const joinedLate = sp.joined_late === "1";

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      {isOwner && (
        <div className="flex justify-end">
          <ChallengeOwnerMenu challengeId={id} isOwner={isOwner} status={detail.status} />
        </div>
      )}
      {showEndedBanner && <ChallengeEndedBanner challengeId={id} />}
      {justJoined && (
        <JustJoinedBanner
          activated={activated}
          totalSigned={totalSigned}
          totalMembers={detail.members.length}
        />
      )}
      {joinedLate && (
        <Card padding="sm" className="bg-muted/50 border-transparent">
          <p className="text-muted-foreground break-keep text-xs">
            이미 시작된 챌린지예요. 그룹에는 합류했고, 다음 챌린지부터 함께할 수 있어요.
          </p>
        </Card>
      )}
      <StatusCard
        title={detail.title}
        status={detail.status}
        goalCount={detail.goalCount}
        durationDays={detail.durationDays}
        penaltyAmount={detail.penaltyAmount}
        participantCount={detail.participantCount}
        ownerName={ownerName}
        daysLeft={daysLeft}
      />
      {isParticipant && !mySigned && detail.status === "pending" && (
        <Card padding="sm" className="bg-destructive/10 border-transparent">
          <div className="text-destructive flex items-center gap-2 text-[11px]">
            <AlertCircle className="size-3.5" aria-hidden="true" />
            <span>운영자가 작성한 서약서를 확인하고 서명하면 챌린지에 참여돼요</span>
          </div>
        </Card>
      )}
      {isOwner && detail.status === "pending" && mySigned && (
        <StartChallengeCard
          challengeId={id}
          signedCount={totalSigned}
          unsignedCount={unsignedCount}
        />
      )}
      <TabNav challengeId={id} />
      {children}
    </div>
  );
}
```

- [ ] **Step 2: `page.tsx` 완전 재작성 (feed 전용)**

`src/app/(app)/challenge/[id]/page.tsx`:
```tsx
import { notFound, redirect } from "next/navigation";
import { Camera } from "lucide-react";
import { Fab } from "@/components/ui/fab";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { fetchChallengeFeed } from "@/lib/db/reads/challenge-feed";
import { getAuthedUser } from "@/lib/supabase/auth";
import { FeedTab } from "./_components/feed-tab";

type Params = Promise<{ id: string }>;

function isSameLocalDay(iso: string, now = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default async function ChallengeFeedPage({ params }: { params: Params }) {
  const { id } = await params;
  const { user } = await getAuthedUser();
  if (!user) redirect("/login");

  const detail = await fetchChallengeDetail(id);
  if (!detail) notFound();

  const me = detail.members.find((m) => m.id === user.id);
  const isParticipant = me != null;
  const mySigned = me?.signed ?? false;

  const feed = await fetchChallengeFeed(id, user.id);
  const todayAuthorIds = new Set(
    feed.filter((f) => isSameLocalDay(f.createdAt)).map((f) => f.authorId),
  );
  const todayDoneCount = todayAuthorIds.size;
  const todayMissingNames = detail.members
    .filter((m) => !todayAuthorIds.has(m.id))
    .map((m) => (m.id === user.id ? "나" : m.displayName));

  const actionHref =
    isParticipant && detail.status === "active" ? `/challenge/${id}/action` : undefined;

  return (
    <>
      <FeedTab
        viewerId={user.id}
        feed={feed}
        participantCount={detail.participantCount}
        todayDoneCount={todayDoneCount}
        todayMissingNames={todayMissingNames}
        status={detail.status}
        isParticipant={isParticipant}
        mySigned={mySigned}
      />
      {actionHref && (
        <Fab
          href={actionHref}
          label="인증하기"
          icon={Camera}
          className="fixed bottom-6 left-1/2 z-20 -translate-x-1/2"
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: `loading.tsx` (feed) 작성**

`src/app/(app)/challenge/[id]/loading.tsx`:
```tsx
// 피드 탭의 default skeleton. 카드 3개 + 헤더 1줄.
export default function FeedLoading() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="피드 로딩 중">
      <div className="bg-muted h-4 w-32 animate-pulse rounded" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-card flex flex-col gap-3 rounded-2xl border p-4">
          <div className="bg-muted h-3 w-24 animate-pulse rounded" />
          <div className="bg-muted aspect-square w-full animate-pulse rounded-xl" />
          <div className="bg-muted h-3 w-3/4 animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 빌드 확인**

```bash
pnpm typecheck
pnpm lint
```

Expected: PASS. layout 과 page 가 호환되고 detail/user fetch 가 cache dedupe.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(app)/challenge/[id]/layout.tsx" "src/app/(app)/challenge/[id]/page.tsx" "src/app/(app)/challenge/[id]/loading.tsx"
git commit -m "feat(challenge): split detail into layout + feed page + skeleton"
```

---

## Task 6: `dashboard/page.tsx` + `loading.tsx`

**Files:**
- Create: `src/app/(app)/challenge/[id]/dashboard/page.tsx`
- Create: `src/app/(app)/challenge/[id]/dashboard/loading.tsx`

- [ ] **Step 1: dashboard `page.tsx` 작성**

`src/app/(app)/challenge/[id]/dashboard/page.tsx`:
```tsx
import { notFound, redirect } from "next/navigation";
import { Camera } from "lucide-react";
import { Fab } from "@/components/ui/fab";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { fetchChallengeFeed } from "@/lib/db/reads/challenge-feed";
import { getAuthedUser } from "@/lib/supabase/auth";
import { DashboardTab } from "../_components/dashboard-tab";

type Params = Promise<{ id: string }>;

function computeDaysLeft(endAtIso: string | null): number | null {
  if (!endAtIso) return null;
  return Math.max(0, Math.ceil((new Date(endAtIso).getTime() - Date.now()) / 86_400_000));
}

export default async function ChallengeDashboardPage({ params }: { params: Params }) {
  const { id } = await params;
  const { user } = await getAuthedUser();
  if (!user) redirect("/login");

  const detail = await fetchChallengeDetail(id);
  if (!detail) notFound();

  const me = detail.members.find((m) => m.id === user.id);
  const isParticipant = me != null;

  const feed = await fetchChallengeFeed(id, user.id);
  const totalFailures = 0; // PRD §35 결정 전 placeholder — 기존 page.tsx 와 동일.
  const totalPenalty = totalFailures * detail.penaltyAmount;
  const daysLeft = computeDaysLeft(detail.endAt);

  const actionHref =
    isParticipant && detail.status === "active" ? `/challenge/${id}/action` : undefined;

  return (
    <>
      <DashboardTab
        totalPenalty={totalPenalty}
        totalActions={feed.length}
        totalFailures={totalFailures}
        daysRemaining={daysLeft}
        members={detail.members}
        goalCount={detail.goalCount}
      />
      {actionHref && (
        <Fab
          href={actionHref}
          label="인증하기"
          icon={Camera}
          className="fixed bottom-6 left-1/2 z-20 -translate-x-1/2"
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: dashboard `loading.tsx` 작성**

`src/app/(app)/challenge/[id]/dashboard/loading.tsx`:
```tsx
// 현황판 탭 default skeleton — 4 stats + member rank 4행.
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="현황판 로딩 중">
      <div className="bg-card grid grid-cols-4 gap-2 rounded-2xl border p-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="bg-muted h-6 w-10 animate-pulse rounded" />
            <div className="bg-muted h-2 w-8 animate-pulse rounded" />
          </div>
        ))}
      </div>
      <div className="bg-card flex flex-col gap-2 rounded-2xl border p-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <div className="bg-muted size-8 animate-pulse rounded-full" />
            <div className="bg-muted h-3 flex-1 animate-pulse rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 빌드 확인**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: 커밋**

```bash
git add "src/app/(app)/challenge/[id]/dashboard/"
git commit -m "feat(challenge): add dashboard segment with cache-deduped fetches"
```

---

## Task 7: `info/page.tsx` + `loading.tsx`

**Files:**
- Create: `src/app/(app)/challenge/[id]/info/page.tsx`
- Create: `src/app/(app)/challenge/[id]/info/loading.tsx`

- [ ] **Step 1: info `page.tsx` 작성**

`src/app/(app)/challenge/[id]/info/page.tsx`:
```tsx
import { notFound, redirect } from "next/navigation";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { getAuthedUser } from "@/lib/supabase/auth";
import { InviteTrigger } from "@/app/(app)/group/[id]/_components/invite-trigger";
import { AccountInfoTrigger } from "../_components/account-info-trigger";
import { InfoTab } from "../_components/info-tab";
import { StartChallengeCard } from "../_components/start-challenge-card";

type Params = Promise<{ id: string }>;

export default async function ChallengeInfoPage({ params }: { params: Params }) {
  const { id } = await params;
  const { user } = await getAuthedUser();
  if (!user) redirect("/login");

  const detail = await fetchChallengeDetail(id);
  if (!detail) notFound();

  const me = detail.members.find((m) => m.id === user.id);
  const mySigned = me?.signed ?? false;
  const isOwner = detail.group.ownerId === user.id;
  const ownerName =
    detail.members.find((m) => m.id === detail.group.ownerId)?.displayName ?? "운영자";
  const totalSigned = detail.members.filter((m) => m.signed).length;
  const unsignedCount = detail.members.length - totalSigned;

  const inviteSlot = isOwner ? (
    <section aria-label="초대">
      <InviteTrigger groupId={detail.group.id} />
    </section>
  ) : null;
  const accountSlot = (
    <section aria-label="정산 계좌" className="flex items-center justify-end">
      <AccountInfoTrigger
        groupId={detail.group.id}
        bankCode={detail.group.bankCode}
        accountHolder={detail.group.accountHolder}
        accountNumberLast4={detail.group.accountNumberLast4}
      />
    </section>
  );
  const startSlot =
    isOwner && detail.status === "pending" && mySigned ? (
      <StartChallengeCard
        challengeId={id}
        signedCount={totalSigned}
        unsignedCount={unsignedCount}
      />
    ) : null;

  return (
    <InfoTab
      detail={detail}
      ownerName={ownerName}
      inviteSlot={inviteSlot}
      accountSlot={accountSlot}
      startSlot={startSlot}
    />
  );
}
```

- [ ] **Step 2: info `loading.tsx` 작성**

`src/app/(app)/challenge/[id]/info/loading.tsx`:
```tsx
// 정보 탭 default skeleton — 가장 가벼움.
export default function InfoLoading() {
  return (
    <div
      className="bg-card flex flex-col gap-3 rounded-2xl border p-4"
      aria-busy="true"
      aria-label="정보 로딩 중"
    >
      <div className="bg-muted h-3 w-32 animate-pulse rounded" />
      <div className="bg-muted h-3 w-48 animate-pulse rounded" />
      <div className="bg-muted h-3 w-40 animate-pulse rounded" />
    </div>
  );
}
```

- [ ] **Step 3: 빌드 확인**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: 커밋**

```bash
git add "src/app/(app)/challenge/[id]/info/"
git commit -m "feat(challenge): add info segment without feed fetch"
```

---

## Task 8: `challenge-tabs.tsx` 삭제 + `action-result-dialog.tsx` URL 갱신

**Files:**
- Delete: `src/app/(app)/challenge/[id]/_components/challenge-tabs.tsx`
- Modify: `src/app/(app)/challenge/[id]/action/_components/action-result-dialog.tsx`

- [ ] **Step 1: challenge-tabs 삭제**

```bash
git rm "src/app/(app)/challenge/[id]/_components/challenge-tabs.tsx"
```

- [ ] **Step 2: action-result-dialog URL 갱신**

`src/app/(app)/challenge/[id]/action/_components/action-result-dialog.tsx` 의 L50 (또는 `?tab=dashboard` 가 등장하는 라인):

Before:
```ts
router.replace(`/challenge/${challengeId}?tab=dashboard`);
```

After:
```ts
router.replace(`/challenge/${challengeId}/dashboard`);
```

- [ ] **Step 3: import 잔존 검사**

```bash
grep -rn "challenge-tabs" src/
```

Expected: 0 results.

- [ ] **Step 4: 빌드 확인**

```bash
pnpm typecheck
pnpm lint
```

Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "chore(challenge): remove ChallengeTabs and update F8 dashboard URL"
```

---

## Task 9: 홈 row pending indicator (TDD)

`running-challenge-list.tsx` 는 server component (현재 코드 첫 줄에 "use client" 없음). `useLinkStatus` 사용을 위해 별도 client child component 로 분리한다.

**Files:**
- Create: `src/app/(app)/home/_components/row-pending-indicator.tsx`
- Create: `src/app/(app)/home/_components/row-pending-indicator.spec.tsx`
- Modify: `src/app/(app)/home/_components/running-challenge-list.tsx`
- Modify: `src/app/(app)/home/_components/running-challenge-list.spec.tsx`

- [ ] **Step 1: `row-pending-indicator.spec.tsx` 작성 — FAIL**

`src/app/(app)/home/_components/row-pending-indicator.spec.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RowPendingIndicator } from "./row-pending-indicator";

let pendingValue = false;
vi.mock("next/link", async () => {
  const actual = await vi.importActual<typeof import("next/link")>("next/link");
  return { ...actual, useLinkStatus: () => ({ pending: pendingValue }) };
});

describe("RowPendingIndicator", () => {
  it("pending=false 시 D-N 또는 대기 텍스트 표시", () => {
    pendingValue = false;
    render(<RowPendingIndicator daysLeft={3} joinedLate={false} status="active" />);
    expect(screen.getByText("D-3")).toBeTruthy();
  });

  it("pending=false + pending status 시 '대기' 표시", () => {
    pendingValue = false;
    render(<RowPendingIndicator daysLeft={0} joinedLate={false} status="pending" />);
    expect(screen.getByText("대기")).toBeTruthy();
  });

  it("pending=false + joinedLate 시 '다음부터' 표시", () => {
    pendingValue = false;
    render(<RowPendingIndicator daysLeft={3} joinedLate={true} status="active" />);
    expect(screen.getByText("다음부터")).toBeTruthy();
  });

  it("pending=true 시 spinner 표시", () => {
    pendingValue = true;
    render(<RowPendingIndicator daysLeft={3} joinedLate={false} status="active" />);
    expect(screen.getByLabelText("진입 중")).toBeTruthy();
    expect(screen.queryByText("D-3")).toBeFalsy();
  });
});
```

- [ ] **Step 2: 테스트 실행 — FAIL**

```bash
pnpm test src/app/\(app\)/home/_components/row-pending-indicator.spec.tsx
```

Expected: FAIL — `Cannot find module './row-pending-indicator'`.

- [ ] **Step 3: 구현**

`src/app/(app)/home/_components/row-pending-indicator.tsx`:
```tsx
"use client";

// 홈 진행 중 챌린지 row 의 D-N / spinner 자리.
// <Link> 자식 트리 안에서만 useLinkStatus 가 의미 — 부모 Link 가 pending 일 때 spinner.

import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";

type Status = "pending" | "accepted" | "active" | "closed";

interface Props {
  daysLeft: number;
  joinedLate: boolean;
  status: Status;
}

export function RowPendingIndicator({ daysLeft, joinedLate, status }: Props) {
  const { pending } = useLinkStatus();
  if (pending) {
    return (
      <span
        aria-label="진입 중"
        className="text-muted-foreground inline-flex size-5 shrink-0 items-center justify-center"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="t-caption shrink-0 tabular-nums">
      {joinedLate ? "다음부터" : status === "active" ? `D-${daysLeft}` : "대기"}
    </span>
  );
}
```

- [ ] **Step 4: 테스트 PASS**

```bash
pnpm test src/app/\(app\)/home/_components/row-pending-indicator.spec.tsx
```

Expected: 4 tests PASS.

- [ ] **Step 5: `running-challenge-list.tsx` 통합**

import 추가:
```ts
import { RowPendingIndicator } from "./row-pending-indicator";
```

기존 D-N span (`<span className="t-caption shrink-0 tabular-nums">{joinedLate ? "다음부터" : c.status === "active" ? \`D-\${c.daysLeft}\` : "대기"}</span>`) 위치를 다음으로 교체:
```tsx
<RowPendingIndicator
  daysLeft={c.daysLeft}
  joinedLate={joinedLate}
  status={c.status}
/>
```

- [ ] **Step 6: 기존 spec 통과 확인**

```bash
pnpm test src/app/\(app\)/home/_components/running-challenge-list.spec.tsx
```

Expected: 기존 테스트 PASS. 만약 "D-3" 텍스트 매칭이 직접 있다면 그대로 통과 (RowPendingIndicator 도 같은 텍스트 렌더).

- [ ] **Step 7: 커밋**

```bash
git add "src/app/(app)/home/_components/"
git commit -m "feat(home): row pending indicator via useLinkStatus for instant feedback"
```

---

## Task 10: 통합 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 타입체크**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 2: 린트**

```bash
pnpm lint
```

Expected: 0 errors.

- [ ] **Step 3: 단위 테스트 전체**

```bash
pnpm test
```

Expected: 모든 spec PASS.

- [ ] **Step 4: 통합 테스트**

```bash
pnpm test tests/integration
```

Expected: PASS.

- [ ] **Step 5: 빌드**

```bash
pnpm build
```

Expected: 빌드 성공. `/challenge/[id]` · `/challenge/[id]/dashboard` · `/challenge/[id]/info` 3 route 가 빌드 산출 manifest 에 포함.

---

## Task 11: 수동 검증 (production mode 모바일)

**Files:** 없음 (수동 검증)

- [ ] **Step 1: production 모드 기동**

```bash
pnpm build
pnpm start
```

브라우저: Chrome DevTools → Device Mode → iPhone 13 Pro (390×844).

- [ ] **Step 2: 시나리오 1 — 홈 → 진행 중 카드 클릭**

홈 진입 → 진행 중 챌린지 row 클릭. 기대:
- 클릭 즉시 row 의 D-N 자리에 spinner 표시.
- 페이지가 challenge detail 로 navigate.
- feed skeleton 잠시 보임 → 콘텐츠 렌더.

- [ ] **Step 3: 시나리오 2 — 탭 전환**

상세 진입 후 feed → dashboard → info → feed 순으로 탭 클릭. 기대:
- 각 클릭 시 label 옆 mini spinner.
- 콘텐츠 영역에 해당 탭 skeleton 잠시 → 콘텐츠.
- StatusCard / banners 등 layout 요소는 **깜박이지 않음**.

- [ ] **Step 4: 시나리오 3 — 직접 URL 진입**

주소창에 `/challenge/[id]/dashboard` 직접 입력 → 정상 표시. `/info` 도 동일.

- [ ] **Step 5: 시나리오 4 — `?tab=` 호환**

`/challenge/[id]?tab=info` 진입 → `/challenge/[id]/info` 로 자동 redirect. URL 바 확인.

- [ ] **Step 6: 시나리오 5 — `?just_joined=1` 진입**

`/challenge/[id]?just_joined=1` 진입 → `/challenge/[id]/info?just_joined=1` 로 redirect + JustJoinedBanner 표시 확인.

- [ ] **Step 7: 시나리오 6 — F8 결과 모달**

`/challenge/[id]/action` 진입 → 인증 완료 → 결과 모달 → "확인" → `/challenge/[id]/dashboard` 진입 확인.

- [ ] **Step 8: 시나리오 7 — 브라우저 back/forward**

feed → dashboard → info → back → dashboard 표시 → back → feed → forward → dashboard.

- [ ] **Step 9: 시나리오 8 — scroll 위치 복원**

feed 에서 스크롤 200px 내려간 후 dashboard 클릭 → dashboard 확인 후 back → feed 의 200px 위치로 돌아가는지 확인.

- [ ] **Step 10: 시나리오 9 — 느린 네트워크**

DevTools Network → Slow 3G. 홈 → 진입 → 탭 전환 시도 → row spinner → skeleton → 콘텐츠 의 3단계 전환 자연스러움.

- [ ] **Step 11: 시나리오 10 — 종료된 챌린지**

`endAt` 이 과거인 챌린지 진입. 모든 탭에서 ChallengeEndedBanner 표시 + FAB 없음 확인.

- [ ] **Step 12: 검증 결과 기록**

PR description 에 검증 결과를 markdown table 로 첨부:
```
| 시나리오 | 결과 |
|---------|------|
| 1. 홈 클릭 진입 | PASS |
| 2. 탭 전환 | PASS |
| ... | ... |
```

---

## Task 12: PR 생성

**Files:** 없음 (git push + PR)

- [ ] **Step 1: 최종 git 상태 확인**

```bash
git status
git log --oneline develop..HEAD
```

Expected: clean 워킹 트리, 7-9개 커밋.

- [ ] **Step 2: 원격 push**

```bash
git push -u origin fix/challenge-detail-nested-tabs
```

- [ ] **Step 3: PR 생성**

```bash
gh pr create --base develop --title "fix(challenge): nested route tabs + row pending indicator" --body "$(cat <<'EOF'
## Summary
- 챌린지 상세(`/challenge/[id]`) 의 3개 탭을 nested route segments 로 재편 (ADR-0010).
- 홈 → 상세 진입 시 `useLinkStatus` 기반 row pending indicator + 탭별 `loading.tsx` skeleton 추가.
- `getAuthedUser` · `fetchChallengeDetail` · `fetchChallengeFeed` 에 React `cache()` 적용해 layout/page dedupe.

## Spec / ADR
- ADR: `docs/adr/0010-challenge-detail-nested-route-tabs.md`
- Spec: `docs/superpowers/specs/2026-05-20-challenge-detail-nested-tabs.md`
- Plan: `docs/superpowers/plans/2026-05-20-challenge-detail-nested-tabs.md`

## 가드레일 체크리스트
- [x] Server Action / RSC 경계 위반 없음
- [x] zod 타입 SoT 유지 (validators 변경 없음)
- [x] Supabase / RLS / migration 영향 없음
- [x] AnalyticsEvent 변경 없음

## Verification
- `pnpm typecheck` PASS / `pnpm lint` PASS / `pnpm test` PASS / `pnpm build` PASS
- 수동 검증 10 시나리오 모두 PASS (production mode · iPhone 13 Pro emulation)
- prefetch 동작 확인 (build/start 모드)
- 탭 사이 back/forward + scroll restoration 확인

## Rollback
- 단일 PR. revert 1 commit 으로 전체 되돌리기 가능.
EOF
)"
```

- [ ] **Step 4: PR URL 확인**

```bash
gh pr view --web
```

- [ ] **Step 5: CI 통과 확인**

```bash
gh pr checks --watch
```

Expected: 모든 check PASS.

---

## 롤백 절차

PR 머지 후 회귀 발견 시:

```bash
git checkout develop
git pull origin develop
git revert <merge-commit-sha> -m 1
git push origin develop
```

부분 롤백은 비추천 — routing 모델과 redirect 가 묶여 있어 partial revert 는 정합성 깨질 수 있음.

---

## Verification Summary

| 종류 | 명령 | 통과 기준 |
| ---- | ---- | -------- |
| 타입 | `pnpm typecheck` | 0 errors |
| 린트 | `pnpm lint` | 0 errors |
| 단위 | `pnpm test` | 모든 spec PASS |
| 통합 | `pnpm test tests/integration` | PASS |
| 빌드 | `pnpm build` | 성공 |
| 수동 | production mode 10 시나리오 | 전부 PASS |
| CI | GitHub PR checks | 전부 PASS |
