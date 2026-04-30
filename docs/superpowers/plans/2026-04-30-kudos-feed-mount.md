# Kudos UI + FeedCard Mount 구현 계획 (B3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Day 2 에서 merged 된 `toggleKudos` Server Action 과 `FeedCard` 컴포넌트를 [/challenge/[id]](src/app/(app)/challenge/[id]/page.tsx) 에 실제로 mount 한다. `action_logs` 피드를 `src/lib/db/reads/challenge-feed.ts` 로 읽고, 클라이언트에서 kudos toggle + optimistic update + 롤백을 배선한다.

**Architecture:**

- **Read layer 추가**: 기존 `fetchChallengeDetail` 은 member progress 만 계산. 피드는 행 당 JOIN(author · kudos count · 내 kudos 여부) 이 필요하므로 별도 함수 `fetchChallengeFeed(challengeId, viewerId)` 를 `src/lib/db/reads/challenge-feed.ts` 에 둔다(D-013 pattern 준수).
- **Optimistic state는 로컬 리스트 전체**: 피드 항목은 읽기 전용 array 로 서버에서 내려오지만, kudos toggle 은 `useOptimistic` 로 카운트/토글 상태를 즉시 반영. 서버 응답이 `failure` 면 롤백 + 토스트. `useOptimistic` 는 React 19 stable(이 프로젝트 `react@19.2.4`).
- **next/image remotePatterns 는 건드리지 않는다**: 현재 `photo_url` 은 `https://example.com/photo.jpg` hardcoded (Day 2 이월, Storage 배선 전). `FeedCard` 의 `next/image` 를 조건부로 `<img>` 로 렌더하는 fallback 을 두어 sample URL 에서 터지지 않게 함. Storage + signed URL 은 B4 플랜에서 처리.
- **RLS 재확인 경계**: `kudos_insert_self_not_own` 는 "자기 로그에 자기 kudos 금지" 를 강제. FeedCard 는 author가 본인이면 kudos 버튼 비활성화 표시(서버 reject 전 UX 가드). 실검증은 여전히 RLS.

**Tech Stack:** Next.js 16 App Router · React 19 (`useOptimistic`) · Supabase (Postgres + RLS) · Vitest (unit + integration) · Playwright (e2e) · TypeScript strict.

---

## 0. 사전 이해 — 이 plan 이 해결하는 것

현재 repo 실측:

1. `src/app/(app)/challenge/[id]/_components/feed-card.tsx` — 완성된 UI, props 계약 확정(spec 포함).
2. `src/app/(app)/challenge/[id]/_actions.ts` — `toggleKudos` Server Action merged(insert/delete 방식).
3. `src/app/(app)/challenge/[id]/page.tsx` — `MemberStrip` + `SettlementTrigger` 만 렌더. **FeedCard 는 아직 mount 안 됨**.
4. `src/lib/db/reads/` — `active-challenge` / `challenge-detail` / `pledge` 만 존재. 피드 read 없음.
5. `tests/integration/actions/give-kudos.spec.ts` — insert/delete + unique constraint 회귀 이미 확인됨.

**이 plan 범위**:

- `fetchChallengeFeed` read BFF 추가 + integration 테스트.
- `ChallengeFeed` client wrapper 추가(FeedCard 리스트 + optimistic state).
- `/challenge/[id]` 에 feed section mount.
- E2E 1 개: "kudos 누르면 카운트가 즉시 1 증가하고 DB 에도 반영".
- **안 함**: 페이지네이션(피드 길어질 때 무한 스크롤은 B3 이후) · Storage 사진 업로드(B4) · 알림(B2).

---

## 0.5 실행 가드레일 (Pre-flight)

### 의존성 순서

```
T1 (feed read BFF + integration test)
  → T2 (ChallengeFeed client wrapper + unit test)
    → T3 (page mount + server-side viewerId wiring)
      → T4 (E2E kudos toggle)
        → T5 (DECISIONS D-016 if needed · follow-up list)
```

T1 을 건너뛰고 T2 먼저 하면 client 가 mock 에 의존해 실제 RLS 회귀를 못 잡는다. T4 는 T3 까지 실 데이터 경로가 서버에서 끝난 후.

### 환경 가드

- [ ] `develop` 기준 최신(`git pull --ff-only origin develop`). Runway 트랙 merged 상태 전제.
- [ ] `pnpm test:integration tests/integration/ci-health.spec.ts` PASS — 원격 Supabase 에 마이그레이션 0001~0007 반영 확인.
- [ ] `pnpm lint && pnpm typecheck && pnpm test:ci` 모두 green 에서 시작.

---

## 1. File Structure

### 1.1 Read BFF (Task 1)

- Create: `src/lib/db/reads/challenge-feed.ts` — `fetchChallengeFeed(challengeId, viewerId)` 반환 `FeedItemView[]`.
- Create: `tests/integration/reads/challenge-feed.spec.ts` — 비멤버 차단 · kudos 카운트 집계 · 내 kudos 여부 플래그 3 개 테스트.

### 1.2 Client wrapper (Task 2)

- Create: `src/app/(app)/challenge/[id]/_components/challenge-feed.tsx` — `"use client"`, `useOptimistic` 로 toggle 관리, `FeedCard` 리스트 렌더.
- Create: `src/app/(app)/challenge/[id]/_components/challenge-feed.spec.tsx` — jsdom, 1) 클릭 즉시 카운트 1 증가(optimistic), 2) server error 시 롤백 + toast.error, 3) 자기 로그 카드는 버튼 disabled.

### 1.3 Page mount (Task 3)

- Modify: `src/app/(app)/challenge/[id]/page.tsx` — `fetchChallengeFeed` 호출 + `ChallengeFeed` 마운트.

### 1.4 E2E (Task 4)

- Create: `tests/e2e/kudos-toggle.spec.ts` — 서명/활성 + 로그 1 건 seeded → `/challenge/<id>` → 🔥 클릭 → DB 에 row 생성 확인.

### 1.5 문서 (Task 5)

- Modify: `docs/TEAM_SHARE_DECISIONS.md` — **D-016** append (피드 Read BFF 별도 파일 + optimistic 전략 기록). 필요 없다면 skip.

---

## 2. Tasks

### Task 1: Feed read BFF + integration test

> **근거**: `fetchChallengeDetail` 이 이미 멤버 집계를 하지만, 피드 행마다 author/kudos 를 JOIN 하려면 SQL 모양이 달라진다. D-013 에 따라 별도 `src/lib/db/reads/*.ts` 로 분리.

**Files:**

- Create: `src/lib/db/reads/challenge-feed.ts`
- Create: `tests/integration/reads/challenge-feed.spec.ts`

- [ ] **Step 1: 실패 테스트 작성 (3 case)**

Create `tests/integration/reads/challenge-feed.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { asUser, admin } from "../setup";
import { createUser, createGroup, addMember, createPendingChallenge } from "../factories";
import { fetchChallengeFeed } from "@/lib/db/reads/challenge-feed";

async function seedActive(): Promise<{
  ownerId: string;
  otherId: string;
  challengeId: string;
  logId: string;
}> {
  const owner = await createUser();
  const other = await createUser();
  const g = await createGroup(owner.id);
  await addMember(g.id, other.id);
  const c = await createPendingChallenge(g.id);
  await admin.from("challenge_participants").insert([
    { challenge_id: c.id, user_id: owner.id },
    { challenge_id: c.id, user_id: other.id },
  ]);
  await admin
    .from("challenges")
    .update({
      status: "active",
      start_at: new Date(Date.now() - 60_000).toISOString(),
      end_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    })
    .eq("id", c.id);
  const { data: log } = await admin
    .from("action_logs")
    .insert({
      challenge_id: c.id,
      user_id: other.id,
      activity_type: "gym",
      photo_url: "https://example.com/p.jpg",
      selected_keywords: ["펌핑"],
      shown_keywords: ["펌핑", "집중"],
      reroll_count: 0,
      ai_summary: "오늘도 해냈다.",
      prompt_version: "v1",
    })
    .select("id")
    .single();
  if (!log) throw new Error("seed action_log failed");
  return { ownerId: owner.id, otherId: other.id, challengeId: c.id, logId: log.id };
}

describe("fetchChallengeFeed", () => {
  it("returns feed items with author name, summary, keywords, zero kudos initially", async () => {
    const { ownerId, challengeId, logId, otherId } = await seedActive();
    // Mock `createClient` path: the read BFF runs in node (no cookie), so it
    // will hit anon client. That anon client has no session — the query
    // returns [] due to RLS. We proxy through asUser to simulate an RSC
    // render authenticated as the viewer.
    // Integration test harness exposes asUser which returns a supabase client
    // already signed in; the read BFF uses the default server client, so we
    // bypass it and assert via the admin client separately.

    // Assert: as owner viewer, should see the other user's log.
    const rows = await fetchChallengeFeedAsUser(ownerId, challengeId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: logId,
      authorId: otherId,
      summary: "오늘도 해냈다.",
      keywords: ["펌핑"],
      kudosByEmoji: { "🔥": 0, "💪": 0, "👏": 0 },
      viewerKudos: [],
    });
  });

  it("aggregates kudos counts by emoji and marks viewer's own kudos", async () => {
    const { ownerId, otherId, logId } = await seedActive();
    await admin.from("kudos").insert([
      { action_log_id: logId, user_id: ownerId, emoji: "🔥" },
      { action_log_id: logId, user_id: otherId, emoji: "🔥" },
      { action_log_id: logId, user_id: ownerId, emoji: "💪" },
    ]);
    const rows = await fetchChallengeFeedAsUser(ownerId, /* challengeId */ undefined!);
    expect(rows[0].kudosByEmoji).toEqual({ "🔥": 2, "💪": 1, "👏": 0 });
    expect(rows[0].viewerKudos).toEqual(expect.arrayContaining(["🔥", "💪"]));
  });

  it("returns [] for non-members (RLS denies select)", async () => {
    const { challengeId } = await seedActive();
    const outsider = await createUser();
    const rows = await fetchChallengeFeedAsUser(outsider.id, challengeId);
    expect(rows).toEqual([]);
  });
});

// Test-only adapter — calls fetchChallengeFeed with an auth'd client.
async function fetchChallengeFeedAsUser(viewerId: string, challengeId: string) {
  const client = await asUser({ id: viewerId, email: `u-${viewerId.slice(0, 6)}@test.local` });
  return fetchChallengeFeed(challengeId, viewerId, { client });
}
```

**주의**: `fetchChallengeFeedAsUser` 는 `asUser` helper 의 email 포맷(`u-<suffix>@test.local`)에 의존. `asUser` signature 는 `{ id, email }` 을 받는데 email 은 유저 생성 시 반환된 것이므로, 실제로는 아래와 같이 수정 — `createUser()` 결과를 바로 넘기도록 바꾼다.

수정: helper 를 다음과 같이 바꾼다:

```ts
import { createClient } from "@supabase/supabase-js";
async function fetchChallengeFeedAsUser(
  viewer: { id: string; email: string },
  challengeId: string,
) {
  const client = await asUser(viewer);
  return fetchChallengeFeed(challengeId, viewer.id, { client });
}
```

그리고 각 테스트에서 `createUser()` 반환을 그대로 넘기도록 통일. 상단 3 case 의 `fetchChallengeFeedAsUser(ownerId, …)` 호출을 `fetchChallengeFeedAsUser(owner, …)` 로 바꾼 뒤 test 내부에서 `owner` 참조를 `seedActive` 반환에 추가.

실제 반영된 파일은 Step 3 의 시그니처 확정 후 이 테스트를 다시 손본다(이 Step 은 "실패하는 테스트가 뭘 요구하는지" 를 정의하는 목적).

- [ ] **Step 2: 테스트 실행해 컴파일 에러 확인**

Run: `pnpm test:integration tests/integration/reads/challenge-feed.spec.ts`

Expected: `fetchChallengeFeed` 미존재로 TS 에러 → vitest 가 전체 suite fail. 이 상태를 의도했음을 확인(Task 1 Step 3 에서 구현).

- [ ] **Step 3: 구현 작성**

Create `src/lib/db/reads/challenge-feed.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { KUDOS_EMOJIS, type KudosEmoji } from "@/lib/validators/kudos";

export type FeedItemView = {
  id: string;
  authorId: string;
  authorName: string;
  photoUrl: string;
  summary: string;
  keywords: ReadonlyArray<string>;
  kudosByEmoji: Readonly<Record<KudosEmoji, number>>;
  viewerKudos: ReadonlyArray<KudosEmoji>;
  createdAt: string;
};

type Options = { client?: SupabaseClient };

// PRD §7 · BE_SCHEMA §5.7 — 챌린지 피드.
// RLS 가 al_select_member / kudos_select_member 를 강제하므로 비멤버면 []
// 이 함수는 RSC 에서 호출되는 게 기본이며, 테스트에서는 options.client 로 주입.
export async function fetchChallengeFeed(
  challengeId: string,
  viewerId: string,
  options: Options = {},
): Promise<FeedItemView[]> {
  const supabase = options.client ?? (await createClient());

  const { data: logs, error } = await supabase
    .from("action_logs")
    .select(
      [
        "id",
        "user_id",
        "photo_url",
        "ai_summary",
        "selected_keywords",
        "created_at",
        "users!inner(display_name)",
        "kudos(user_id, emoji)",
      ].join(","),
    )
    .eq("challenge_id", challengeId)
    .order("created_at", { ascending: false });

  if (error || !logs) return [];

  return logs.map((row) => {
    const user = Array.isArray(row.users) ? row.users[0] : row.users;
    const kudos = (row.kudos ?? []) as Array<{ user_id: string; emoji: string }>;

    const kudosByEmoji = Object.fromEntries(KUDOS_EMOJIS.map((e) => [e, 0])) as Record<
      KudosEmoji,
      number
    >;
    const viewerKudos: KudosEmoji[] = [];
    for (const k of kudos) {
      if (!KUDOS_EMOJIS.includes(k.emoji as KudosEmoji)) continue;
      const e = k.emoji as KudosEmoji;
      kudosByEmoji[e]++;
      if (k.user_id === viewerId) viewerKudos.push(e);
    }

    return {
      id: row.id as string,
      authorId: row.user_id as string,
      authorName: user?.display_name ?? "익명",
      photoUrl: row.photo_url as string,
      summary: row.ai_summary as string,
      keywords: (row.selected_keywords ?? []) as string[],
      kudosByEmoji,
      viewerKudos,
      createdAt: row.created_at as string,
    };
  });
}
```

- [ ] **Step 4: 테스트 헬퍼 수정(시그니처 정합)**

Edit `tests/integration/reads/challenge-feed.spec.ts` — Step 1 에서 적어둔 "수정" 블록을 실제로 반영. 각 test 에서:

```ts
it("returns feed items with author name, …", async () => {
  const seeded = await seedActive();
  const owner = { id: seeded.ownerId, email: `u-${seeded.ownerId.slice(0, 6)}@test.local` };
  const rows = await fetchChallengeFeedAsUser(owner, seeded.challengeId);
  expect(rows).toHaveLength(1);
  // ...
});
```

**더 안전한 수정**: `seedActive()` 가 `createUser()` 결과를 그대로 반환하도록 바꾼다. 최종 형태:

```ts
async function seedActive() {
  const owner = await createUser();
  const other = await createUser();
  // ... (same as before)
  return { owner, other, challenge: c, logId: log.id };
}

it("returns feed items with author, summary, keywords, zero kudos initially", async () => {
  const { owner, other, challenge, logId } = await seedActive();
  const rows = await fetchChallengeFeedAsUser(owner, challenge.id);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    id: logId,
    authorId: other.id,
    summary: "오늘도 해냈다.",
    keywords: ["펌핑"],
    kudosByEmoji: { "🔥": 0, "💪": 0, "👏": 0 },
    viewerKudos: [],
  });
});

async function fetchChallengeFeedAsUser(
  viewer: { id: string; email: string },
  challengeId: string,
) {
  const client = await asUser(viewer);
  return fetchChallengeFeed(challengeId, viewer.id, { client });
}
```

Non-member 케이스도 `const outsider = await createUser();` → `fetchChallengeFeedAsUser(outsider, challenge.id)`.

- [ ] **Step 5: 테스트 실행**

Run: `pnpm test:integration tests/integration/reads/challenge-feed.spec.ts`

Expected: `3 passed`.

실패 시 체크:
- `users!inner(display_name)` JOIN 이 authenticated client 에서 `users` RLS 에 걸리면 `[]`. `supabase/migrations/0002_rls.sql` 에서 `users_select` 정책이 "group 공유자 공개" 인지 확인.
- `kudos(user_id, emoji)` 임베디드 select 가 0 rows 반환하면 `row.kudos` 가 `null`. `(row.kudos ?? [])` 로 처리됨.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/reads/challenge-feed.ts tests/integration/reads/challenge-feed.spec.ts
git commit -m "feat(reads): add fetchChallengeFeed with author + kudos aggregate"
```

---

### Task 2: `ChallengeFeed` client wrapper + unit test

> **근거**: 서버에서 feed 를 렌더해도 kudos toggle 은 client interaction. `useOptimistic` 로 즉시 반영 · 실패 롤백 · disabled(자기 로그) 를 한 컴포넌트에 모은다.

**Files:**

- Create: `src/app/(app)/challenge/[id]/_components/challenge-feed.tsx`
- Create: `src/app/(app)/challenge/[id]/_components/challenge-feed.spec.tsx`

- [ ] **Step 1: 실패 테스트 작성**

Create `src/app/(app)/challenge/[id]/_components/challenge-feed.spec.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => {
    const { fill, ...rest } = props;
    void fill;
    // eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element -- rest includes alt; test-only mock
    return <img {...rest} />;
  },
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));

const toggleMock = vi.fn();
vi.mock("../_actions", () => ({ toggleKudos: (...args: unknown[]) => toggleMock(...args) }));

import { ChallengeFeed } from "./challenge-feed";

const baseItem = {
  id: "00000000-0000-4000-8000-000000000001",
  authorId: "author-1",
  authorName: "민지",
  photoUrl: "https://example.com/p.jpg",
  summary: "오늘도 해냈다.",
  keywords: ["펌핑"],
  kudosByEmoji: { "🔥": 2, "💪": 0, "👏": 0 } as const,
  viewerKudos: [] as const,
  createdAt: "2026-04-30T00:00:00Z",
};

describe("ChallengeFeed", () => {
  beforeEach(() => {
    toastError.mockReset();
    toggleMock.mockReset();
  });

  it("increments the emoji count immediately on click (optimistic)", async () => {
    toggleMock.mockResolvedValue({ ok: true, data: { toggled: "added" } });
    render(<ChallengeFeed items={[baseItem]} viewerId="viewer-1" />);
    const fireBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("🔥")) as HTMLButtonElement;
    fireEvent.click(fireBtn);
    // Immediately shows 3 (was 2) before the action resolves.
    expect(fireBtn.textContent).toContain("3");
    await waitFor(() => expect(toggleMock).toHaveBeenCalledTimes(1));
  });

  it("rolls back the count and surfaces an error toast when the action fails", async () => {
    toggleMock.mockResolvedValue({ ok: false, error: "forbidden" });
    render(<ChallengeFeed items={[baseItem]} viewerId="viewer-1" />);
    const fireBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("🔥")) as HTMLButtonElement;
    fireEvent.click(fireBtn);
    await waitFor(() => {
      expect(fireBtn.textContent).toContain("2"); // rolled back
      expect(toastError).toHaveBeenCalled();
    });
  });

  it("disables kudos buttons on the viewer's own log (RLS forbids self-kudos)", () => {
    const ownLog = { ...baseItem, authorId: "viewer-1" };
    render(<ChallengeFeed items={[ownLog]} viewerId="viewer-1" />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      expect(btn).toBeDisabled();
    }
  });

  it("renders an empty state when items is empty", () => {
    render(<ChallengeFeed items={[]} viewerId="viewer-1" />);
    expect(screen.getByText(/아직 인증이 없어요/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `pnpm test src/app/\\(app\\)/challenge/\\[id\\]/_components/challenge-feed.spec.tsx`

Expected: `Cannot find module './challenge-feed'`. 이게 실패의 원인.

- [ ] **Step 3: 컴포넌트 구현**

Create `src/app/(app)/challenge/[id]/_components/challenge-feed.tsx`:

```tsx
"use client";

import { useOptimistic, useTransition, useCallback } from "react";
import { toast } from "sonner";
import { FeedCard } from "./feed-card";
import { toggleKudos } from "../_actions";
import { KUDOS_EMOJIS, type KudosEmoji } from "@/lib/validators/kudos";
import { makeUserMessage, FALLBACK_ERROR_MESSAGE } from "@/lib/actions/error-messages";
import type { FeedItemView } from "@/lib/db/reads/challenge-feed";

type Props = {
  items: ReadonlyArray<FeedItemView>;
  viewerId: string;
};

type OptimisticAction = { type: "toggle"; logId: string; emoji: KudosEmoji; viewerId: string };

const messageFor = makeUserMessage({
  forbidden: "자기 인증에는 응원을 보낼 수 없어요.",
});

function applyToggle(items: FeedItemView[], action: OptimisticAction): FeedItemView[] {
  return items.map((item) => {
    if (item.id !== action.logId) return item;
    const had = item.viewerKudos.includes(action.emoji);
    const nextViewerKudos = had
      ? item.viewerKudos.filter((e) => e !== action.emoji)
      : [...item.viewerKudos, action.emoji];
    const nextByEmoji = { ...item.kudosByEmoji };
    nextByEmoji[action.emoji] = Math.max(0, (nextByEmoji[action.emoji] ?? 0) + (had ? -1 : 1));
    return { ...item, viewerKudos: nextViewerKudos, kudosByEmoji: nextByEmoji };
  });
}

export function ChallengeFeed({ items, viewerId }: Props) {
  const [optimisticItems, applyOptimistic] = useOptimistic<FeedItemView[], OptimisticAction>(
    [...items],
    applyToggle,
  );
  const [, startTransition] = useTransition();

  const handleKudos = useCallback(
    (logId: string, authorId: string, emoji: KudosEmoji) => {
      // Client-side guard mirrors RLS kudos_insert_self_not_own.
      if (authorId === viewerId) return;

      startTransition(async () => {
        applyOptimistic({ type: "toggle", logId, emoji, viewerId });
        try {
          const res = await toggleKudos({ actionLogId: logId, emoji });
          if (!res.ok) {
            // Rollback by reapplying the same toggle (idempotent inverse).
            applyOptimistic({ type: "toggle", logId, emoji, viewerId });
            toast.error(messageFor(res.error));
          }
        } catch (err) {
          console.error("[ChallengeFeed] toggleKudos threw", err);
          applyOptimistic({ type: "toggle", logId, emoji, viewerId });
          toast.error(FALLBACK_ERROR_MESSAGE);
        }
      });
    },
    [applyOptimistic, viewerId],
  );

  if (optimisticItems.length === 0) {
    return (
      <p className="text-muted-foreground text-sm break-keep">
        아직 인증이 없어요. 첫 번째 인증을 올려보세요.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {optimisticItems.map((item) => {
        const isSelf = item.authorId === viewerId;
        return (
          <li key={item.id}>
            <FeedCard
              authorName={item.authorName}
              photoUrl={item.photoUrl}
              summary={item.summary}
              keywords={item.keywords}
              kudosByEmoji={item.kudosByEmoji}
              onKudos={(emoji) => handleKudos(item.id, item.authorId, emoji)}
              disabled={isSelf}
            />
          </li>
        );
      })}
    </ul>
  );
}

// Re-export for tests that iterate the pool.
export { KUDOS_EMOJIS };
```

**주의**: `FeedCard` 의 현재 props 에 `disabled` 가 없다. 다음 Step 에서 feed-card.tsx 에 추가한다.

- [ ] **Step 4: `FeedCard` 에 `disabled` prop 추가**

Edit `src/app/(app)/challenge/[id]/_components/feed-card.tsx`:

```tsx
type Props = {
  authorName: string;
  photoUrl: string;
  summary: string;
  keywords: ReadonlyArray<string>;
  kudosByEmoji: Readonly<Partial<Record<KudosEmoji, number>>>;
  onKudos: (emoji: KudosEmoji) => void;
  disabled?: boolean;
};

// ... existing code
export function FeedCard({
  authorName,
  photoUrl,
  summary,
  keywords,
  kudosByEmoji,
  onKudos,
  disabled = false,
}: Props) {
  return (
    // ... same markup until the footer
      <footer className="flex gap-2">
        {KUDOS_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onKudos(e)}
            disabled={disabled}
            aria-label={`${e} 응원 (${kudosByEmoji[e] ?? 0}개)`}
            className="bg-muted hover:bg-muted/80 focus-visible:ring-ring flex items-center gap-1 rounded-full px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span aria-hidden="true">{e}</span>
            <span className="tabular-nums">{kudosByEmoji[e] ?? 0}</span>
          </button>
        ))}
      </footer>
    // ... close article
  );
}
```

전체 파일의 JSX 구조는 기존과 동일, `disabled` 추가분만. 완전한 대체:

```tsx
"use client";

import Image from "next/image";
import { KUDOS_EMOJIS, type KudosEmoji } from "@/lib/validators/kudos";

type Props = {
  authorName: string;
  photoUrl: string;
  summary: string;
  keywords: ReadonlyArray<string>;
  kudosByEmoji: Readonly<Partial<Record<KudosEmoji, number>>>;
  onKudos: (emoji: KudosEmoji) => void;
  disabled?: boolean;
};

export function FeedCard({
  authorName,
  photoUrl,
  summary,
  keywords,
  kudosByEmoji,
  onKudos,
  disabled = false,
}: Props) {
  return (
    <article className="bg-card flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
      <header className="flex items-center gap-2">
        <span className="font-semibold">{authorName}</span>
      </header>
      <div className="relative aspect-square w-full overflow-hidden rounded-xl">
        <Image
          src={photoUrl}
          alt={`${authorName}의 인증 사진`}
          fill
          sizes="(max-width: 640px) 100vw, 640px"
          className="object-cover"
          unoptimized
        />
      </div>
      <p className="text-sm leading-relaxed break-keep">{summary}</p>
      <ul className="text-muted-foreground flex flex-wrap gap-1.5 text-xs">
        {keywords.map((k) => (
          <li key={k} className="bg-muted rounded-full px-2 py-0.5">
            #{k}
          </li>
        ))}
      </ul>
      <footer className="flex gap-2">
        {KUDOS_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onKudos(e)}
            disabled={disabled}
            aria-label={`${e} 응원 (${kudosByEmoji[e] ?? 0}개)`}
            className="bg-muted hover:bg-muted/80 focus-visible:ring-ring flex items-center gap-1 rounded-full px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span aria-hidden="true">{e}</span>
            <span className="tabular-nums">{kudosByEmoji[e] ?? 0}</span>
          </button>
        ))}
      </footer>
    </article>
  );
}
```

**`unoptimized` 추가 이유**: `example.com` 같은 임의 URL 은 next.config.ts `images.remotePatterns` 에 없어 `/_next/image` optimizer 가 400 을 반환. `unoptimized` 로 우회하면 브라우저가 직접 원본 URL 을 불러가 개발 단계의 placeholder 가 렌더된다. Storage 정식 연동(B4) 때 제거.

- [ ] **Step 5: FeedCard 기존 테스트 회귀 확인**

Run: `pnpm test src/app/\\(app\\)/challenge/\\[id\\]/_components/feed-card.spec.tsx`

Expected: 기존 4 테스트 모두 PASS (새 `disabled` prop 은 optional 이라 기존 테스트 영향 없음).

- [ ] **Step 6: ChallengeFeed 테스트 실행**

Run: `pnpm test src/app/\\(app\\)/challenge/\\[id\\]/_components/challenge-feed.spec.tsx`

Expected: `4 passed`.

실패 디버그 포인트:
- `useOptimistic` 는 `startTransition` 안에서 호출해야 함. 코드에 `startTransition(async () => { applyOptimistic(...) })` 되어 있는지 확인.
- rollback 검증은 `waitFor` 안에서 카운트가 원래대로 돌아온 것을 확인.

- [ ] **Step 7: Commit**

```bash
git add \
  src/app/\(app\)/challenge/\[id\]/_components/challenge-feed.tsx \
  src/app/\(app\)/challenge/\[id\]/_components/challenge-feed.spec.tsx \
  src/app/\(app\)/challenge/\[id\]/_components/feed-card.tsx
git commit -m "feat(challenge): add ChallengeFeed with useOptimistic kudos toggle"
```

---

### Task 3: Page mount

> **근거**: 서버에서 `viewerId` 를 얻어 `fetchChallengeFeed` 로 feed 를 미리 로드해 hydration race 를 피한다. FeedCard 가 참여자 아닌 사람에게 노출되면 안 됨 — 기존 페이지가 이미 `fetchChallengeDetail` 로 detail 을 읽는데 그게 null 이면 `notFound()` 한다. feed 는 detail 이후 호출.

**Files:**

- Modify: `src/app/(app)/challenge/[id]/page.tsx`

- [ ] **Step 1: page.tsx 수정**

Edit `src/app/(app)/challenge/[id]/page.tsx` — 전체 교체:

```tsx
import { notFound, redirect } from "next/navigation";
import { formatKRW } from "@/lib/challenge/penalty";
import { createClient } from "@/lib/supabase/server";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { fetchChallengeFeed } from "@/lib/db/reads/challenge-feed";
import { MemberStrip } from "./_components/member-strip";
import { SettlementTrigger } from "./_components/settlement-trigger";
import { ChallengeFeed } from "./_components/challenge-feed";

type Params = Promise<{ id: string }>;

// PRD §4 · §7 · BE_SCHEMA §4 상태머신 · Design Brief 화면 4/6
export default async function ChallengeDetailPage({ params }: { params: Params }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const detail = await fetchChallengeDetail(id);
  if (!detail) notFound();

  const feed = await fetchChallengeFeed(id, user.id);

  return (
    <div className="flex flex-col gap-6 p-4">
      <header>
        <p className="text-muted-foreground font-mono text-xs">{id.slice(0, 8)}</p>
        <h1 className="text-xl font-semibold">{detail.title}</h1>
      </header>
      <section aria-labelledby="member-progress-heading">
        <h2 id="member-progress-heading" className="mb-3 text-sm font-semibold">
          멤버 진행률
        </h2>
        <MemberStrip goalCount={detail.goalCount} members={detail.members} />
      </section>
      <section
        aria-labelledby="settlement-heading"
        className="bg-card flex items-center justify-between rounded-2xl border p-4"
      >
        <div>
          <p id="settlement-heading" className="text-muted-foreground text-xs">
            모인 예정 벌금
          </p>
          <p className="text-xl font-bold tabular-nums">{formatKRW(detail.potTotal)}</p>
        </div>
        <SettlementTrigger amount={detail.potTotal} memo={`${detail.title} 벌금`} />
      </section>
      <section aria-labelledby="feed-heading">
        <h2 id="feed-heading" className="mb-3 text-sm font-semibold">
          인증 피드
        </h2>
        <ChallengeFeed items={feed} viewerId={user.id} />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: 로컬 sanity (빌드)**

Run: `pnpm typecheck && pnpm lint`

Expected: 둘 다 exit 0.

- [ ] **Step 3: dev 서버로 수동 확인**

Run: `pnpm dev`

브라우저에서 기존 challenge 상세 페이지(예: `http://localhost:3000/challenge/<uuid>`) 접속. 확인:
- 피드 섹션이 추가됐는지
- 로그가 하나도 없으면 "아직 인증이 없어요" 가 뜨는지
- 기존 MemberStrip / SettlementTrigger 는 그대로인지

PID 정리:
```bash
kill %1 2>/dev/null
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/challenge/\[id\]/page.tsx
git commit -m "feat(challenge): mount ChallengeFeed on detail page"
```

---

### Task 4: E2E — kudos toggle round-trip

> **근거**: unit 테스트는 `toggleKudos` 를 mock 함. 실제 RLS + DB insert + optimistic state 가 전부 돌아가는 통합 검증은 e2e 가 유일한 경로.

**Files:**

- Create: `tests/e2e/kudos-toggle.spec.ts`

- [ ] **Step 1: 테스트 작성**

Create `tests/e2e/kudos-toggle.spec.ts`:

```ts
import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

test("tapping 🔥 on a teammate's log creates a kudos row", async ({ page, groupId }) => {
  // 1) Seed: current user + teammate, active challenge, teammate posts a log.
  const userId = await page.evaluate(async () => {
    const r = await fetch("/api/me");
    return r.ok ? ((await r.json()) as { id: string }).id : null;
  });
  if (!userId) throw new Error("cannot resolve current user id");

  const shortSuffix = Math.random().toString(36).slice(2, 8);
  const { data: otherUser } = await admin.auth.admin.createUser({
    email: `o-${shortSuffix}@test.local`,
    email_confirm: true,
  });
  if (!otherUser?.user) throw new Error("failed to create teammate");
  const otherId = otherUser.user.id;

  await admin.from("group_members").insert({
    group_id: groupId,
    user_id: otherId,
    role: "member",
  });

  const { data: ch } = await admin
    .from("challenges")
    .insert({
      group_id: groupId,
      title: "kudos-test",
      type: "fitness",
      goal_count: 3,
      duration_days: 7,
      penalty_amount: 3000,
      status: "active",
      start_at: new Date(Date.now() - 60_000).toISOString(),
      end_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    })
    .select("id")
    .single();
  if (!ch) throw new Error("failed to create challenge");

  await admin.from("challenge_participants").insert([
    { challenge_id: ch.id, user_id: userId, signed_at: new Date().toISOString() },
    { challenge_id: ch.id, user_id: otherId, signed_at: new Date().toISOString() },
  ]);

  const { data: log } = await admin
    .from("action_logs")
    .insert({
      challenge_id: ch.id,
      user_id: otherId,
      activity_type: "gym",
      photo_url: "https://example.com/p.jpg",
      selected_keywords: ["펌핑"],
      shown_keywords: ["펌핑", "집중"],
      reroll_count: 0,
      ai_summary: "오늘도 해냈다.",
      prompt_version: "v1",
    })
    .select("id")
    .single();
  if (!log) throw new Error("failed to create log");

  // 2) Visit the challenge detail page and click 🔥.
  await page.goto(`/challenge/${ch.id}`);
  await expect(page.getByText("오늘도 해냈다.")).toBeVisible({ timeout: 10_000 });

  const fireBtn = page.getByRole("button", { name: /🔥/ }).first();
  await expect(fireBtn).toBeEnabled();
  await fireBtn.click();

  // 3) Poll DB — the row is eventually-inserted via the Server Action.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("kudos")
          .select("emoji")
          .eq("action_log_id", log.id)
          .eq("user_id", userId);
        return (data ?? []).map((r) => r.emoji);
      },
      { timeout: 10_000, intervals: [300, 600, 1000] },
    )
    .toEqual(["🔥"]);
});
```

- [ ] **Step 2: 로컬 실행**

Run: `pnpm exec playwright test tests/e2e/kudos-toggle.spec.ts --project chromium --reporter=line`

Expected: `1 passed`.

실패 디버그:
- 로그가 안 보이면 `fetchChallengeFeed` 의 `users!inner(display_name)` JOIN 이 RLS 때문에 빈 배열을 반환했을 가능성. action_log 만들 때 `users` 가 존재해야 함(trigger 가 이미 생성).
- 버튼 disabled 로 나오면 `authorId === viewerId` 매칭이 잘못된 것. fixture seed 에서 `otherId` 가 아니라 `userId` 로 log 를 넣었는지 확인.

- [ ] **Step 3: 전체 e2e 회귀**

Run: `pnpm test:e2e`

Expected: 기존 3 + 신규 1 = `4 passed`.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/kudos-toggle.spec.ts
git commit -m "test(e2e): verify kudos toggle writes row and reflects in UI"
```

---

### Task 5: (선택) DECISIONS D-016

> **근거**: Task 2 의 "optimistic state 를 로컬 배열 전체로 관리" 와 "feed read 를 `challenge-detail` 과 별도 파일로" 는 D-013 의 파생이지만 *optimistic 롤백 패턴* 자체는 신규 판단. 1 ADR 가치 있음 판단. 없다고 못 쓸 정도는 아님 — 팀 규모 작으면 skip 가능.

**Files:**

- Modify: `docs/TEAM_SHARE_DECISIONS.md`

- [ ] **Step 1: ADR 작성**

Edit `docs/TEAM_SHARE_DECISIONS.md` — `### D-015` 바로 위에 append:

```markdown
### D-016 — Kudos toggle: useOptimistic + 전체 배열 재생성 + 롤백-by-동일-액션

- **날짜**: 2026-04-30
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - `toggleKudos` 는 insert/delete 양방향. 네트워크 왕복(200~500ms)을 기다리면 체감 반응이 느리다.
  - RLS `kudos_insert_self_not_own` 때문에 자기 로그에는 insert 가 fail. UI 가드 없으면 서버 왕복 후 에러로 사용자만 불편.
- **고려한 옵션 (Options considered)**:
  - A) 토글 후 `revalidatePath` — 서버 왕복 필수 · 간단 / 반응 느림
  - B) 로컬 useState 관리 + 실패 시 refetch — 카운트 계산 분산 / 실패 복구 복잡
  - C) `useOptimistic` 전체 배열 변환 함수 + 실패 시 동일 액션 재적용으로 롤백 — React 19 정석 / 배열 전체 복사 cost
- **결정 (Decision)**:
  - 우리는 **C) `useOptimistic` + 동일 액션 롤백** 을 선택한다.
  - 액션이 순수 토글(더하기 ↔ 빼기 inverse 동일)이라 "서버 실패 시 같은 액션 재적용" 으로 롤백.
  - 자기 로그에 대해서는 client-side `disabled` 가드를 두되, 실 보안은 RLS.
- **근거 (Reasoning)**:
  - (A) 는 kudos 가 짧고 자주 일어나는 인터랙션이라 체감 저하 크다.
  - (B) 는 카운트 계산을 두 군데(서버+클라)에서 해야 하고 refetch 시 깜빡임.
  - (C) 는 React 19 native. 피드가 수백 건으로 늘면 구조 바꿔야겠지만 POC 규모(~10~50건)는 안전.
- **영향 범위 (Impact)**:
  - `src/app/(app)/challenge/[id]/_components/challenge-feed.tsx` 신설.
  - `src/lib/db/reads/challenge-feed.ts` 신설 (D-013 패턴 계승).
  - `feed-card.tsx` 에 `disabled` prop 추가.
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 피드가 100+ 건으로 늘어 배열 전체 복사 cost 가 보이면 per-item state 로 전환.
  - `useOptimistic` 가 major 버전에서 API 바뀌면 재평가.
- **되돌리기 비용**: 낮음. `ChallengeFeed` 내부 교체만.
```

- [ ] **Step 2: 검증**

Run: `grep -n "^### D-016" docs/TEAM_SHARE_DECISIONS.md`

Expected: D-016 한 줄.

- [ ] **Step 3: Commit**

```bash
git add docs/TEAM_SHARE_DECISIONS.md
git commit -m "docs(decisions): log D-016 — kudos optimistic toggle pattern"
```

---

## 3. Out of Scope (이 계획에서 하지 않는 것)

- **피드 페이지네이션 / 무한 스크롤** — 피드 10+ 건 일상이 되기 전엔 YAGNI.
- **Supabase Storage 사진 업로드** — B4 플랜. 현재 `photo_url` 은 example.com 계속 사용(`unoptimized` 로 렌더).
- **Kudos 알림(푸시)** — B2 Web Push 뒤로.
- **Kudos 이모지 풀 확장** — PRD §7.3 AC-1 에 3개 고정.
- **action_log 에 kudos sum 캐시 컬럼** — 현재 행별 COUNT 집계로 충분. 피드 100 건 넘으면 재평가.
- **Realtime 구독** — BE_SCHEMA_RLS §3 POC 비활성화 유지.

## 4. Follow-up (다음 PR 후보)

- [ ] B4: Supabase Storage 사진 업로드 (버킷 + RLS + signed URL + camera capture).
- [ ] B2: Kudos 수신 시 푸시 알림 트리거.
- [ ] C 트랙: kudos E2E 에 a11y 체크(axe-core) 추가 — 버튼 label 회귀 방어.
- [ ] 피드 정렬/필터 (활동 유형 · 멤버별) — UX 피드백 이후.

---

## 5. 자체 검토 (Self-Review)

### 5.1 Spec coverage

- **toggleKudos Server Action 재사용** → Task 2 `ChallengeFeed` ✅
- **FeedCard 마운트** → Task 3 ✅
- **`action_logs` 피드 read BFF** → Task 1 ✅
- **Kudos 토글 + optimistic update** → Task 2 ✅
- **E2E 검증** → Task 4 ✅
- **자기 로그 self-kudos 가드** → Task 2 Step 3/4 (client-side) + 기존 RLS (`kudos_insert_self_not_own`) ✅

### 5.2 Placeholder scan

- TBD / TODO — 없음.
- "add error handling" — 없음. 각 catch 에 구체 토스트 + rollback.
- "similar to Task N" — 없음.

### 5.3 Type consistency

- `FeedItemView` (Task 1) ↔ `ChallengeFeed` props (Task 2) ↔ page 주입(Task 3) 동일 shape.
- `KudosEmoji` 는 `src/lib/validators/kudos.ts` 단일 source. Task 1/2 에서 import.
- `toggleKudos` 의 `ActionResult<{ toggled: "added" | "removed" }>` 계약(기존 `_actions.ts`)을 ChallengeFeed 가 `{ ok, error }` discriminated union 으로 정확히 해석.
- `disabled` prop: Task 2 Step 4 에서 `FeedCard` 에 추가, Task 2 Step 3 에서 ChallengeFeed 가 전달, 기존 feed-card.spec.tsx 는 `disabled` 미지정이라 회귀 없음.

---

## 6. 실행 핸드오프

**Plan complete and saved to `docs/superpowers/plans/2026-04-30-kudos-feed-mount.md`. Two execution options:**

**1. Inline Execution (권장)** — 5 Task, cross-task 타입 계약(FeedItemView 가 read BFF → client → page 로 흐름) 이 촘촘해 inline 이 안전.

- **Batch A**: Task 1 (read BFF + integration test). 끝나면 `pnpm test:integration` green.
- **Batch B**: Task 2~3 (client wrapper + page mount). 끝나면 `pnpm dev` 수동 확인 + `pnpm test`.
- **Batch C**: Task 4~5 (e2e + ADR). 끝나면 `pnpm test:e2e` green + PR.

**2. Subagent-Driven** — Task 1 의 `FeedItemView` shape 확정이 Task 2/3 에 그대로 흘러가므로 subagent 에 "정확한 타입 이름 유지" 프롬프트 필요. 불안정하면 inline 권장.

**어느 방식으로 진행할까요?**
