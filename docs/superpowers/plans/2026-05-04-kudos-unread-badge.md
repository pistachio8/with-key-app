# Kudos 미읽음 배지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DESIGN_BRIEF §1.5("알림 피로도 관리: 알림 2종만. Kudos는 배지 표시") 를 충실히 구현. Kudos 수신 시 **피드 탭 BottomNav 에 미읽음 dot + 피드 page 헤더에 "새 응원 N건" 배지**를 표시하고, 피드 진입 시점에 read 마킹. JOURNAL 2026-04-30 의 "Kudos → Web Push" 부채는 **Brief §1.5 준수를 위해 의도적 비구현**으로 clarify.

**Architecture:**
- **State-of-the-art "last-seen" 컬럼 모델**: `users.last_feed_seen_at timestamptz` 단일 컬럼. 챌린지별/actionLog별 read 테이블은 POC 범위 초과(YAGNI). 피드 진입 시 `now()` 로 업데이트 → 이후 `kudos.created_at > last_feed_seen_at` 이면서 `action_logs.user_id = viewer` 인 것의 개수가 unread count.
- **self-kudos 제외**: RLS `kudos_insert_self_not_own` 이 이미 자기 자신에게 주는 kudos 를 차단. 쿼리에선 `kudos.user_id != viewer` 도 불필요(서버가 이미 막음). 그래도 방어적으로 명시한다.
- **배지 2개 surface**: (1) [BottomNav](../../src/components/app-shell/bottom-nav.tsx) 피드 탭 `Users` 아이콘 위의 dot — count 숨김, 존재 여부만. (2) [/feed](../../src/app/(app)/feed/page.tsx) 페이지 헤더 "새 응원 N건" 배지 — count 노출.
- **BottomNav 의 dot 만 client component 가 필요**. count 는 RSC 에서 prop 주입. 피드 탭 이동 시 `markFeedSeen` Server Action → revalidatePath("/") 로 홈/챌린지 진입 시 배지 갱신. 다른 탭에선 dot 만 보이면 되므로 **(app)/layout.tsx 에서 단일 fetch**(한 번에 count + viewerId) 후 BottomNav 에 전달.
- **Push 는 의도적 비구현**: dispatch 확장 없음. `notification_prefs.kudos` 토글 추가 없음. 이 plan 은 "Kudos push 는 하지 않기로 결정" 의 코드 상 증거이기도 하다.

**Tech Stack:** Next.js 16 App Router · Server Component · Supabase (RLS · last-seen 컬럼 패턴) · Vitest · Playwright.

**Non-Goals (이번 PR 스코프 외):**
- Kudos 유형별 구분(🔥 vs 💪 vs 👏) — 전체 합산만
- 알림/배지 disable 토글 — `settings` 2-toggle 유지
- Web Push 연결 — Brief §1.5 충돌, 의도적 제외
- `action_logs` 단위 unread — POC 는 챌린지 단위 피드 1개 뷰 기준

---

## 현재 상태 확인

- [src/components/app-shell/bottom-nav.tsx](../../src/components/app-shell/bottom-nav.tsx) — 3탭 client component. 현재 `href="/pledge"` 를 `Users` 아이콘 + "서약서" 라벨로 노출. **피드 탭이 BottomNav 에 없음** — Brief §2.1 은 "홈·인증·서약서" 3탭으로 명시되어 있고 **피드는 별도 라우트**. 따라서 배지의 진짜 자리는:
  - 피드 **페이지 헤더** "새 응원 N건" (확정)
  - BottomNav 의 어떤 탭에 dot 을 달지는 **홈** 탭이 합리적(홈 → 피드 미리보기 진입점). → "홈 탭에 미읽 dot"
- [src/app/(app)/feed/page.tsx](../../src/app/(app)/feed/page.tsx) — active 챌린지 없으면 empty. 헤더는 "인증 피드" h1 + 현황 링크. 여기에 배지 삽입.
- [src/app/(app)/layout.tsx](../../src/app/(app)/layout.tsx) — user 가드 + BottomNav 렌더. **여기서 unread count 를 단일 fetch 해서 BottomNav 에 prop 전달**.
- [src/lib/analytics/schema.ts](../../src/lib/analytics/schema.ts) L88 — `kudos_given` 이미 정의. `kudos_badge_cleared` 같은 새 이벤트는 **추가하지 않음** (PRD §9.1 확장은 PO 승인 필요).
- [supabase/migrations/0001_init.sql](../../supabase/migrations/0001_init.sql) `public.users` 테이블에 `last_feed_seen_at` 컬럼 추가 필요(nullable, default `null`).

---

## Test Environment Notes (프로젝트 컨벤션)

- `@testing-library/jest-dom` 매처(`toBeInTheDocument`) 는 setupFiles 없어 부재. `expect(screen.getByText(...)).toBeTruthy()` 패턴 사용. (Recap plan 에서 확인된 컨벤션 동일 적용.)
- Vitest workspace 는 `*.spec.tsx` → jsdom, 그 외 → node 자동 라우팅.
- 통합 테스트는 실 remote Supabase 에 붙어 `truncate_test_data` RPC 로 `@test.local` 스코프만 정리. 본 plan 의 migration 0016 은 `truncate_test_data` 를 건드리지 않음(last_feed_seen_at 은 유저 컬럼이라 truncate 대상 아님).

---

## File Structure

| 파일 | 책임 | 종류 |
| ---- | ---- | ---- |
| `supabase/migrations/0016_users_last_feed_seen_at.sql` | `users.last_feed_seen_at` 컬럼 추가 | Create |
| `src/lib/db/reads/unread-kudos.ts` | `fetchUnreadKudosCount(userId)` — last_feed_seen_at 기준 집계 | Create |
| `src/lib/db/reads/unread-kudos.spec.ts` | 순수 쿼리 빌더/카운팅 로직 단위 테스트(가능한 범위) | Create |
| `src/app/(app)/feed/_actions.ts` | `markFeedSeen` Server Action — `users.last_feed_seen_at = now()` | Create |
| `src/app/(app)/feed/_actions.spec.ts` | validation + withUser 가드 단위 테스트 | Create |
| `src/app/(app)/feed/page.tsx` | 진입 시 markFeedSeen + 이전 count prop 으로 "새 응원 N건" 배지 렌더 | Modify |
| `src/app/(app)/feed/_components/unread-badge.tsx` | count 표시용 presentational 컴포넌트 | Create |
| `src/app/(app)/feed/_components/unread-badge.spec.tsx` | count 0 / 1~99 / 100+ 포맷 테스트 | Create |
| `src/app/(app)/layout.tsx` | unread count fetch 후 BottomNav 에 prop 전달 | Modify |
| `src/components/app-shell/bottom-nav.tsx` | `unreadDot` prop 수신 → 홈 탭 아이콘 위에 absolute dot | Modify |
| `src/components/app-shell/bottom-nav.spec.tsx` | dot 렌더 여부 (count 0 vs > 0) | Create |
| `tests/integration/reads/unread-kudos.spec.ts` | RLS + last-seen 집계 실 DB 검증 (self-kudos 제외 · 비멤버 0) | Create |
| `tests/e2e/kudos-badge.spec.ts` | 2 유저 E2E — A 가 인증 → B 가 kudos → A 에게 배지 → 피드 진입 후 사라짐 | Create |
| `docs/JOURNAL.md` | "2026-05-04 Kudos unread badge" 엔트리 추가 + B2 부채 clarify | Modify |
| `docs/DESIGN_BRIEF.md` | §1.5 하단에 "배지 소스: last_feed_seen_at" 구현 참조 링크 (선택) | (skip — 이 plan 은 디자인 계약 변경 없음) |

---

## Task 1: Migration — `users.last_feed_seen_at` 컬럼 추가

**Files:**
- Create: `supabase/migrations/0016_users_last_feed_seen_at.sql`

**Why nullable + default null:** 기존 유저는 "한 번도 피드 진입 안 함" = "모든 kudos unread" 로 합리적. `now()` 로 backfill 하면 기존 kudos 가 전부 "이미 읽음" 으로 뒤집혀서 실데이터 회귀가 숨겨짐.

- [ ] **Step 1: migration 작성**

```sql
-- supabase/migrations/0016_users_last_feed_seen_at.sql
-- PRD §7 · DESIGN_BRIEF §1.5 — 피드 미읽음 Kudos 배지용 last-seen 타임스탬프.
-- nullable: 기존 유저는 "첫 피드 진입 전" 상태. 모든 kudos 가 unread 로 집계되는 것이 의도.

alter table public.users
  add column if not exists last_feed_seen_at timestamptz;

-- 배지 쿼리: kudos.created_at > users.last_feed_seen_at. 기존 idx_kudos_action_log 로는
-- created_at 필터가 covering 되지 않아 created_at 단독 인덱스 추가. action_log_id 는 PK 경로로 올라간다.
create index if not exists idx_kudos_created_at on public.kudos(created_at);
```

- [ ] **Step 2: push**

Run: `pnpm db:push`
Expected: `Applying migration 0016_users_last_feed_seen_at.sql...` → `Finished supabase db push.`

- [ ] **Step 3: types 재생성**

Run: `pnpm db:types`
Expected: `src/types/supabase.ts` 에 `last_feed_seen_at: string | null` 이 `users` Row 에 추가됨.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/0016_users_last_feed_seen_at.sql src/types/supabase.ts
git commit -m "feat(db): add users.last_feed_seen_at for unread-kudos badge"
```

---

## Task 2: `fetchUnreadKudosCount` read 모듈

**Files:**
- Create: `src/lib/db/reads/unread-kudos.ts`
- Create: `src/lib/db/reads/unread-kudos.spec.ts`

**책임:** viewer 의 action_logs 에 달린 kudos 중 `created_at > last_feed_seen_at` 인 것의 개수 반환. `last_feed_seen_at = null` → 모든 kudos 가 unread.

**패턴:** `active-challenge.ts` 와 동일한 RSC-only read 모듈. RLS 가 `kudos_select_member` 로 멤버만 보이게 해서 비멤버 자동 0.

- [ ] **Step 1: 실패 테스트 작성 — 순수 helper `isUnread`**

```ts
// src/lib/db/reads/unread-kudos.spec.ts
import { describe, it, expect } from "vitest";
import { isUnread } from "./unread-kudos";

describe("isUnread", () => {
  it("last_seen 이 null 이면 unread", () => {
    expect(isUnread({ createdAt: "2026-05-04T00:00:00Z", lastSeenAt: null })).toBe(true);
  });
  it("created_at 이 last_seen 보다 뒤면 unread", () => {
    expect(
      isUnread({
        createdAt: "2026-05-04T02:00:00Z",
        lastSeenAt: "2026-05-04T01:00:00Z",
      }),
    ).toBe(true);
  });
  it("created_at 이 last_seen 이전이면 read", () => {
    expect(
      isUnread({
        createdAt: "2026-05-04T00:00:00Z",
        lastSeenAt: "2026-05-04T01:00:00Z",
      }),
    ).toBe(false);
  });
  it("정확히 같은 시각은 read (>: strict)", () => {
    expect(
      isUnread({
        createdAt: "2026-05-04T01:00:00Z",
        lastSeenAt: "2026-05-04T01:00:00Z",
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/lib/db/reads/unread-kudos.spec.ts`
Expected: FAIL — "Cannot find module './unread-kudos'"

- [ ] **Step 3: 구현**

```ts
// src/lib/db/reads/unread-kudos.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export function isUnread(input: {
  createdAt: string;
  lastSeenAt: string | null;
}): boolean {
  if (input.lastSeenAt === null) return true;
  return new Date(input.createdAt).getTime() > new Date(input.lastSeenAt).getTime();
}

type Options = { client?: SupabaseClient };

/**
 * viewer 의 action_logs 에 달린 kudos 중 last_feed_seen_at 이후 발생한 개수.
 * RLS 가 피드 멤버십을 강제(kudos_select_member). self-kudos 는 RLS 단계에서 이미 차단됨.
 */
export async function fetchUnreadKudosCount(
  viewerId: string,
  options: Options = {},
): Promise<number> {
  const supabase = options.client ?? (await createClient());

  const { data: me } = await supabase
    .from("users")
    .select("last_feed_seen_at")
    .eq("id", viewerId)
    .maybeSingle();

  const lastSeen = (me?.last_feed_seen_at as string | null) ?? null;

  // head:true + count:'exact' → row 본문 전송 없이 count 만.
  let query = supabase
    .from("kudos")
    .select("action_log_id, action_logs!inner(user_id)", { count: "exact", head: true })
    .eq("action_logs.user_id", viewerId);

  if (lastSeen) query = query.gt("created_at", lastSeen);

  const { count, error } = await query;
  if (error || count === null) return 0;
  return count;
}
```

- [ ] **Step 4: 순수 helper 테스트 통과 확인**

Run: `pnpm vitest run src/lib/db/reads/unread-kudos.spec.ts`
Expected: PASS (4/4).

- [ ] **Step 5: typecheck**

Run: `pnpm tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/db/reads/unread-kudos.ts src/lib/db/reads/unread-kudos.spec.ts
git commit -m "feat(reads): add fetchUnreadKudosCount with last_feed_seen_at gate"
```

---

## Task 3: `markFeedSeen` Server Action

**Files:**
- Create: `src/app/(app)/feed/_actions.ts`
- Create: `src/app/(app)/feed/_actions.spec.ts`

**패턴:** `withUser` + `ActionResult<void>`. 입력 인자 없음 — viewer 식별만으로 완결. `revalidatePath('/')` 로 홈의 BottomNav dot 도 즉시 사라지게.

- [ ] **Step 1: 실패 테스트 작성**

```ts
// src/app/(app)/feed/_actions.spec.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth/with-user", () => ({
  withUser:
    <I, O>(fn: (u: { id: string }, i: I) => Promise<O>) =>
    (i: I) =>
      fn({ id: "u-viewer" }, i),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { markFeedSeen } from "./_actions";

describe("markFeedSeen", () => {
  beforeEach(() => vi.clearAllMocks());

  it("users.last_feed_seen_at 를 now() 기준으로 업데이트하고 홈/피드 revalidate", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: () => ({ update }),
    });

    const result = await markFeedSeen();
    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    const payload = update.mock.calls[0][0] as { last_feed_seen_at: string };
    expect(typeof payload.last_feed_seen_at).toBe("string");
    expect(Number.isFinite(new Date(payload.last_feed_seen_at).getTime())).toBe(true);
    expect(eq).toHaveBeenCalledWith("id", "u-viewer");
    expect(revalidatePath).toHaveBeenCalledWith("/feed");
    expect(revalidatePath).toHaveBeenCalledWith("/home");
  });

  it("DB 에러 시 failure 반환", async () => {
    const eq = vi.fn().mockResolvedValue({ error: { message: "boom", code: "XX000" } });
    const update = vi.fn().mockReturnValue({ eq });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: () => ({ update }),
    });
    const result = await markFeedSeen();
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/app/\(app\)/feed/_actions.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

```ts
// src/app/(app)/feed/_actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";

// DESIGN_BRIEF §1.5 — Kudos 배지 clear. 피드 진입 시 Server Component 가 호출.
export const markFeedSeen = withUser<void, null>(
  async (user): Promise<ActionResult<null>> => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("users")
      .update({ last_feed_seen_at: new Date().toISOString() })
      .eq("id", user.id);
    if (error) return failure(mapSupabaseError(error));

    revalidatePath("/feed");
    revalidatePath("/home");
    return success(null);
  },
);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/app/\(app\)/feed/_actions.spec.ts`
Expected: PASS (2/2).

- [ ] **Step 5: 커밋**

```bash
git add src/app/\(app\)/feed/_actions.ts src/app/\(app\)/feed/_actions.spec.ts
git commit -m "feat(feed): add markFeedSeen server action"
```

---

## Task 4: `UnreadBadge` 컴포넌트 (presentational)

**Files:**
- Create: `src/app/(app)/feed/_components/unread-badge.tsx`
- Create: `src/app/(app)/feed/_components/unread-badge.spec.tsx`

**책임:** count 받아 "새 응원 N건" 또는 "새 응원 99+건" 렌더. count 0 이면 `null`(렌더 안 함).

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// src/app/(app)/feed/_components/unread-badge.spec.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { UnreadBadge } from "./unread-badge";

describe("UnreadBadge", () => {
  it("count=0 이면 아무것도 렌더하지 않음", () => {
    const { container } = render(<UnreadBadge count={0} />);
    expect(container.firstChild).toBeNull();
  });
  it("count=3 → '새 응원 3건'", () => {
    render(<UnreadBadge count={3} />);
    expect(screen.getByText("새 응원 3건")).toBeTruthy();
  });
  it("count>=100 → '새 응원 99+건' 으로 상한", () => {
    render(<UnreadBadge count={250} />);
    expect(screen.getByText("새 응원 99+건")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/app/\(app\)/feed/_components/unread-badge.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

```tsx
// src/app/(app)/feed/_components/unread-badge.tsx
// DESIGN_BRIEF §1.5 — 앱 내 빨간 배지는 최대 1곳. 피드 탭 '새 응원 N건'.

interface UnreadBadgeProps {
  count: number;
}

export function UnreadBadge({ count }: UnreadBadgeProps) {
  if (count <= 0) return null;
  const label = count >= 100 ? "새 응원 99+건" : `새 응원 ${count}건`;
  return (
    <span className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums">
      {label}
    </span>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/app/\(app\)/feed/_components/unread-badge.spec.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: 커밋**

```bash
git add src/app/\(app\)/feed/_components/unread-badge.tsx src/app/\(app\)/feed/_components/unread-badge.spec.tsx
git commit -m "feat(feed): add UnreadBadge component"
```

---

## Task 5: `/feed` page.tsx — 배지 + markFeedSeen

**Files:**
- Modify: `src/app/(app)/feed/page.tsx`

**책임:** 진입 시 (a) `fetchUnreadKudosCount` 로 count 를 먼저 집계 후, (b) `markFeedSeen` 호출해 DB 갱신, (c) 헤더에 `<UnreadBadge count={count} />` 렌더. **순서가 중요**: seen 을 먼저 업데이트하면 count 가 항상 0 이 됨.

**주의:** page.tsx 자체는 여전히 Server Component. markFeedSeen 은 Server Action 이지만 RSC 에서 직접 await 호출 가능.

- [ ] **Step 1: page 수정**

Edit [src/app/(app)/feed/page.tsx](../../src/app/(app)/feed/page.tsx):

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchActiveChallenge } from "@/lib/db/reads/active-challenge";
import { fetchChallengeFeed } from "@/lib/db/reads/challenge-feed";
import { fetchUnreadKudosCount } from "@/lib/db/reads/unread-kudos";
import { createClient } from "@/lib/supabase/server";
import { ChallengeFeed } from "../challenge/[id]/_components/challenge-feed";
import { UnreadBadge } from "./_components/unread-badge";
import { markFeedSeen } from "./_actions";

// PRD §7 · Design Brief 화면 6 (피드) · §1.5 미읽음 Kudos 배지.
export default async function FeedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 순서 중요: count 를 먼저 집계 → 이후 seen 마킹. 역순이면 배지가 절대 안 뜸.
  const unreadCount = await fetchUnreadKudosCount(user.id);
  void markFeedSeen();

  const active = await fetchActiveChallenge(user.id, { statuses: ["active"] });

  if (!active) {
    return (
      <div className="flex flex-col gap-6 p-4">
        <header className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">피드</h1>
          <UnreadBadge count={unreadCount} />
        </header>
        <p className="text-muted-foreground break-keep text-sm">
          현재 진행 중인 챌린지가 없어요. 챌린지가 시작되면 인증 피드가 여기에 모입니다.
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

  const feed = await fetchChallengeFeed(active.id, user.id);

  return (
    <div className="flex flex-col gap-6 p-4">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium">현재 챌린지</p>
          <h1 className="text-xl font-semibold">인증 피드</h1>
          <p className="text-muted-foreground truncate text-sm">{active.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <UnreadBadge count={unreadCount} />
          <Link
            href={`/challenge/${active.id}`}
            className="text-primary text-sm font-semibold underline-offset-4 hover:underline"
          >
            현황
          </Link>
        </div>
      </header>

      <section aria-labelledby="feed-heading">
        <h2 id="feed-heading" className="sr-only">
          인증 피드 목록
        </h2>
        <ChallengeFeed items={feed} viewerId={user.id} />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: typecheck + lint**

Run: `pnpm tsc --noEmit && pnpm eslint src/app/\(app\)/feed`
Expected: 0 errors.

- [ ] **Step 3: 커밋**

```bash
git add src/app/\(app\)/feed/page.tsx
git commit -m "feat(feed): render unread kudos badge and mark seen on entry"
```

---

## Task 6: `(app)/layout.tsx` + BottomNav — 홈 탭 미읽 dot

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/components/app-shell/bottom-nav.tsx`
- Create: `src/components/app-shell/bottom-nav.spec.tsx`

**책임:**
- layout 에서 `fetchUnreadKudosCount` 1회 → `<BottomNav unreadDot={count > 0} />` 로 prop 전달
- BottomNav 는 홈 탭(`/home`) 아이콘 우상단에 `absolute` dot. 내부 구현은 `tabs` 배열에 `dotKey: "home"` 같은 flag 없이, href 가 `/home` 인 탭에만 렌더. **정적 분기** 가 가장 단순.

- [ ] **Step 1: BottomNav 테스트 먼저**

```tsx
// src/components/app-shell/bottom-nav.spec.tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/home" }));

import { BottomNav } from "./bottom-nav";

describe("BottomNav", () => {
  it("unreadDot=false 이면 dot 을 렌더하지 않는다", () => {
    render(<BottomNav unreadDot={false} />);
    expect(screen.queryByTestId("home-unread-dot")).toBeNull();
  });

  it("unreadDot=true 이면 홈 탭에 dot 을 렌더", () => {
    render(<BottomNav unreadDot={true} />);
    expect(screen.getByTestId("home-unread-dot")).toBeTruthy();
  });
});
```

Run: `pnpm vitest run src/components/app-shell/bottom-nav.spec.tsx`
Expected: FAIL — prop not recognized.

- [ ] **Step 2: BottomNav 수정**

Edit [src/components/app-shell/bottom-nav.tsx](../../src/components/app-shell/bottom-nav.tsx):

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Camera, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/home", label: "홈", icon: Home },
  { href: "/action", label: "인증", icon: Camera },
  { href: "/pledge", label: "서약서", icon: Users },
] as const;

interface BottomNavProps {
  unreadDot?: boolean;
}

export function BottomNav({ unreadDot = false }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="주요 메뉴" className="bg-background sticky bottom-0 border-t">
      <ul className="mx-auto flex max-w-screen-sm items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          const showDot = unreadDot && href === "/home";
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 flex-col items-center gap-1 rounded-md px-2 py-3 text-xs font-medium transition-colors",
                  "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="relative">
                  <Icon className="size-6" aria-hidden="true" />
                  {showDot && (
                    <span
                      data-testid="home-unread-dot"
                      aria-label="새 응원 있음"
                      className="bg-primary absolute -right-1 -top-1 block size-2 rounded-full ring-2 ring-background"
                    />
                  )}
                </span>
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 3: layout 수정**

Edit [src/app/(app)/layout.tsx](../../src/app/(app)/layout.tsx):

```tsx
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { createClient } from "@/lib/supabase/server";
import { fetchUnreadKudosCount } from "@/lib/db/reads/unread-kudos";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const unreadCount = await fetchUnreadKudosCount(user.id);

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-screen-sm flex-col">
      <main id="main" className="flex-1">
        {children}
      </main>
      <BottomNav unreadDot={unreadCount > 0} />
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/components/app-shell/bottom-nav.spec.tsx`
Expected: PASS (2/2).

- [ ] **Step 5: typecheck + lint**

Run: `pnpm tsc --noEmit && pnpm eslint src/app/\(app\)/layout.tsx src/components/app-shell`
Expected: 0 errors.

- [ ] **Step 6: 커밋**

```bash
git add src/app/\(app\)/layout.tsx src/components/app-shell/bottom-nav.tsx src/components/app-shell/bottom-nav.spec.tsx
git commit -m "feat(shell): show unread kudos dot on home tab"
```

---

## Task 7: 통합 테스트 — RLS + 집계 정확도

**Files:**
- Create: `tests/integration/reads/unread-kudos.spec.ts`

**커버리지:**
- outsider 는 count 0 (RLS `kudos_select_member` 가 kudos row 자체를 숨김)
- last_seen=null → 모든 kudos 가 unread
- `markFeedSeen` 에 준하는 timestamp 로 update 후 → 이전 kudos 는 read, 이후 추가 kudos 는 unread
- self-kudos 는 0 으로 집계 안 됨 (`kudos_insert_self_not_own` RLS 가 insert 자체를 막음)

- [ ] **Step 1: factory 확인**

Run: `grep -n "export async function" tests/integration/factories.ts`

**예상:** `createUser`, `createGroup`, `addMember`, `createPendingChallenge`. 이걸로 충분 — kudos/action_log 는 inline insert.

- [ ] **Step 2: 테스트 작성**

```ts
// tests/integration/reads/unread-kudos.spec.ts
import { describe, it, expect } from "vitest";
import { admin, asUser } from "../setup";
import { createUser, createGroup, addMember, createPendingChallenge } from "../factories";
import { fetchUnreadKudosCount } from "@/lib/db/reads/unread-kudos";

async function insertActiveChallengeAndParticipants(
  groupId: string,
  memberIds: string[],
  goalCount = 3,
) {
  const c = await createPendingChallenge(groupId, { goalCount, penaltyAmount: 3000 });
  await admin.from("challenge_participants").insert(
    memberIds.map((uid) => ({ challenge_id: c.id, user_id: uid, signed_at: new Date().toISOString() })),
  );
  await admin
    .from("challenges")
    .update({
      status: "active",
      start_at: new Date(Date.now() - 86_400_000).toISOString(),
      end_at: new Date(Date.now() + 6 * 86_400_000).toISOString(),
    })
    .eq("id", c.id);
  return c;
}

async function insertActionLog(challengeId: string, userId: string) {
  const { data, error } = await admin
    .from("action_logs")
    .insert({
      challenge_id: challengeId,
      user_id: userId,
      activity_type: "gym",
      photo_path: `test/${userId}/1.jpg`,
      selected_keywords: ["펌핑"],
      shown_keywords: ["펌핑", "하체데이"],
      reroll_count: 0,
      ai_summary: "오늘 기록 남겨요",
      template_fallback: false,
      prompt_version: "v3",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function insertKudos(actionLogId: string, userId: string, emoji = "🔥") {
  const { error } = await admin.from("kudos").insert({
    action_log_id: actionLogId,
    user_id: userId,
    emoji,
  });
  if (error) throw error;
}

describe("fetchUnreadKudosCount integration", () => {
  it("비멤버는 0 (RLS 차단)", async () => {
    const author = await createUser();
    const giver = await createUser();
    const outsider = await createUser();
    const g = await createGroup(author.id);
    await addMember(g.id, giver.id);
    const c = await insertActiveChallengeAndParticipants(g.id, [author.id, giver.id]);
    const logId = await insertActionLog(c.id, author.id);
    await insertKudos(logId, giver.id);

    const outsiderClient = await asUser(outsider);
    const count = await fetchUnreadKudosCount(outsider.id, { client: outsiderClient });
    expect(count).toBe(0);
  });

  it("last_seen=null → 받은 kudos 전부 unread", async () => {
    const author = await createUser();
    const giver = await createUser();
    const g = await createGroup(author.id);
    await addMember(g.id, giver.id);
    const c = await insertActiveChallengeAndParticipants(g.id, [author.id, giver.id]);
    const logId = await insertActionLog(c.id, author.id);
    await insertKudos(logId, giver.id, "🔥");
    await insertKudos(logId, giver.id, "💪");

    const authorClient = await asUser(author);
    const count = await fetchUnreadKudosCount(author.id, { client: authorClient });
    expect(count).toBe(2);
  });

  it("last_seen 이후에 달린 kudos 만 unread 로 집계", async () => {
    const author = await createUser();
    const giver = await createUser();
    const g = await createGroup(author.id);
    await addMember(g.id, giver.id);
    const c = await insertActiveChallengeAndParticipants(g.id, [author.id, giver.id]);
    const logId = await insertActionLog(c.id, author.id);
    await insertKudos(logId, giver.id, "🔥");

    // author 가 피드를 열어 seen 을 업데이트한 시점 시뮬레이션
    await admin
      .from("users")
      .update({ last_feed_seen_at: new Date().toISOString() })
      .eq("id", author.id);

    // 이후에 새로 kudos 가 달림
    await new Promise((r) => setTimeout(r, 50));
    await insertKudos(logId, giver.id, "💪");

    const authorClient = await asUser(author);
    const count = await fetchUnreadKudosCount(author.id, { client: authorClient });
    expect(count).toBe(1);
  });

  it("self-kudos 는 RLS 가 insert 자체를 거부하므로 count 에 포함 안 됨", async () => {
    const author = await createUser();
    const g = await createGroup(author.id);
    const c = await insertActiveChallengeAndParticipants(g.id, [author.id]);
    const logId = await insertActionLog(c.id, author.id);

    const authorClient = await asUser(author);
    const { error: selfErr } = await authorClient
      .from("kudos")
      .insert({ action_log_id: logId, user_id: author.id, emoji: "🔥" });
    expect(selfErr).not.toBeNull(); // RLS kudos_insert_self_not_own 차단

    const count = await fetchUnreadKudosCount(author.id, { client: authorClient });
    expect(count).toBe(0);
  });
});
```

- [ ] **Step 3: 통합 테스트 실행**

Run: `pnpm test:integration tests/integration/reads/unread-kudos.spec.ts`
Expected: PASS (4/4).

- [ ] **Step 4: 커밋**

```bash
git add tests/integration/reads/unread-kudos.spec.ts
git commit -m "test(unread-kudos): RLS + last-seen + self-kudos integration coverage"
```

---

## Task 8: E2E — Kudos 배지 visible → clear

**Files:**
- Create: `tests/e2e/kudos-badge.spec.ts`

**시나리오:**
1. 저자 A 로그인 → 챌린지/멤버 seed → action_log 1개 등록
2. B 로 로그인 전환 → `/feed` 가서 A 의 log 에 kudos 1개 클릭
3. A 로 재로그인 → `/home` 진입 시 BottomNav 홈 탭 dot 보임
4. A 가 `/feed` 진입 → `새 응원 1건` 배지 보임
5. A 가 `/home` 다시 갔을 때 dot 사라짐

**주의:** 기존 `tests/e2e/fixtures.ts` 에는 단일 `authedPage` 가정. 두 유저 플로우는 `kudos-toggle.spec.ts` 패턴 참조해서 admin API 로 2번째 유저를 생성 + 브라우저 컨텍스트를 분리.

- [ ] **Step 1: 기존 kudos-toggle.spec 패턴 확인**

Run: `head -80 tests/e2e/kudos-toggle.spec.ts`

**예상:** admin API 로 보조 유저 생성 + `createClient` 로 kudos insert 후 UI 확인. 동일 패턴 적용.

- [ ] **Step 2: 테스트 작성**

```ts
// tests/e2e/kudos-badge.spec.ts
import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

test("author sees unread badge + home dot, both clear after /feed visit", async ({
  page,
  groupId,
}) => {
  // viewer id (fixture 기본 유저 = author)
  const meRes = await page.request.get("/api/me");
  const me = (await meRes.json()) as { id: string };

  // --- arrange: active challenge + 2nd member + action_log + kudos from 2nd member ---
  const { data: giver, error: gErr } = await admin.auth.admin.createUser({
    email: `e2e-giver+${Date.now()}@test.local`,
    email_confirm: true,
  });
  if (gErr || !giver?.user) throw gErr ?? new Error("giver create");
  await admin.from("group_members").insert({ group_id: groupId, user_id: giver.user.id, role: "member" });

  const { data: ch, error: chErr } = await admin
    .from("challenges")
    .insert({
      group_id: groupId,
      title: "배지 확인용",
      type: "fitness",
      goal_count: 3,
      duration_days: 7,
      penalty_amount: 3000,
      status: "active",
      start_at: new Date(Date.now() - 86_400_000).toISOString(),
      end_at: new Date(Date.now() + 6 * 86_400_000).toISOString(),
    })
    .select("id")
    .single();
  if (chErr) throw chErr;

  await admin.from("challenge_participants").insert([
    { challenge_id: ch.id, user_id: me.id, signed_at: new Date().toISOString() },
    { challenge_id: ch.id, user_id: giver.user.id, signed_at: new Date().toISOString() },
  ]);

  const { data: log, error: logErr } = await admin
    .from("action_logs")
    .insert({
      challenge_id: ch.id,
      user_id: me.id,
      activity_type: "gym",
      photo_path: `test/${me.id}/e2e.jpg`,
      selected_keywords: ["펌핑"],
      shown_keywords: ["펌핑", "하체데이"],
      reroll_count: 0,
      ai_summary: "오늘 기록 남겨요",
      template_fallback: false,
      prompt_version: "v3",
    })
    .select("id")
    .single();
  if (logErr) throw logErr;

  // seen 을 명시적으로 null 로 맞춰 기존 state 영향 제거
  await admin.from("users").update({ last_feed_seen_at: null }).eq("id", me.id);

  // B 가 kudos 남김 (admin 이 대행)
  await admin.from("kudos").insert({
    action_log_id: log.id,
    user_id: giver.user.id,
    emoji: "🔥",
  });

  // --- act + assert: home 진입 시 dot 보임 ---
  await page.goto("/home");
  await expect(page.getByTestId("home-unread-dot")).toBeVisible();

  // --- /feed 진입 시 '새 응원 1건' 배지 ---
  await page.goto("/feed");
  await expect(page.getByText(/새 응원 1건/)).toBeVisible();

  // --- home 재진입 시 dot 사라짐 ---
  await page.goto("/home");
  await expect(page.getByTestId("home-unread-dot")).toHaveCount(0);
});
```

- [ ] **Step 3: 로컬 실행**

Run: `pnpm exec playwright test tests/e2e/kudos-badge.spec.ts`
Expected: `1 passed`. 실패 시 `test-results/` trace 로 확인.

- [ ] **Step 4: 커밋**

```bash
git add tests/e2e/kudos-badge.spec.ts
git commit -m "test(e2e): verify kudos unread badge appears and clears on /feed visit"
```

---

## Task 9: JOURNAL + 부채 clarify

**Files:**
- Modify: `docs/JOURNAL.md`

**책임:** "2026-05-04 Kudos unread badge" 엔트리 추가 + 2026-04-30 의 "Kudos Web Push (B2) 다음 부채" 블록을 "의도적 비구현" 으로 명시. 과거 엔트리 본문은 수정하지 않고, 해당 엔트리 하단에 "**추후 메모** (2026-05-04)" 서브블록을 append.

- [ ] **Step 1: 새 엔트리 append + 추후 메모 삽입**

Edit [docs/JOURNAL.md](../../docs/JOURNAL.md):

(a) **파일 맨 아래에** 다음 엔트리 append:

```markdown

---

## 2026-05-04 — Kudos 미읽음 배지 (push 의도적 비구현)

**한 줄**: Kudos 수신 시 피드 탭 "새 응원 N건" + BottomNav 홈 탭 dot. Web Push 는 DESIGN_BRIEF §1.5 준수 위해 **의도적 비구현**. `users.last_feed_seen_at` 단일 컬럼으로 last-seen 모델.

### 사실

Plan: [`2026-05-04-kudos-unread-badge.md`](./superpowers/plans/2026-05-04-kudos-unread-badge.md)

- `0016_users_last_feed_seen_at.sql` — `users.last_feed_seen_at timestamptz` nullable + `idx_kudos_created_at`.
- `src/lib/db/reads/unread-kudos.ts` — `fetchUnreadKudosCount` + `isUnread` helper.
- `src/app/(app)/feed/_actions.ts` — `markFeedSeen` (revalidate `/feed` + `/home`).
- `src/app/(app)/feed/page.tsx` — 순서 중요: count 집계 → markFeedSeen → render.
- `src/app/(app)/feed/_components/unread-badge.tsx` — 0 → null · 100+ → "99+건" 상한.
- `src/components/app-shell/bottom-nav.tsx` — `unreadDot` prop · 홈 탭에 absolute dot.
- `src/app/(app)/layout.tsx` — RSC 에서 1 회 fetch 후 BottomNav 에 주입.
- Integration: RLS 차단 · last_seen=null · seen 이후 증가분만 · self-kudos 차단 4 case.
- E2E: 저자/지원자 2 유저 시나리오 — dot 보임 → 배지 보임 → home 에서 dot 사라짐.

### 내러티브

PO 확인(2026-05-04): JOURNAL 2026-04-30 (후속) 의 **B2 "Kudos 수신 시 Web Push"** 는 DESIGN_BRIEF §1.5 "알림 2종만 · Kudos 는 배지 표시" 와 충돌. 본 plan 에서 **배지 방향**으로 수렴. push prefs 에 `kudos` 추가하지 않음. 이 결정의 비용은 "친구 3~4명 × 3 이모지 → 인당 하루 9회 push" 의 알림 피로도 회피. `dispatch.ts` 는 건드리지 않는다.

last-seen 모델을 `kudos_reads(action_log_id, user_id)` 테이블로 만들까 고민했지만 POC 스케일에선 `users.last_feed_seen_at` 단일 컬럼으로 충분. "피드 = 챌린지 1개 뷰" 라는 현 UI 계약에 정렬됨. 여러 챌린지 동시 진행이 v1 스펙에 들어오면 `user_id × challenge_id` pair 의 read 테이블로 승격.

**배지 surface 2곳**:
1. `/feed` 헤더의 텍스트 배지 — count 노출
2. BottomNav 홈 탭 우상단 dot — presence only

Brief §1.5 "최대 1곳" 과 모순처럼 보이지만, dot 은 카운트가 없는 presence 표시이고 텍스트 배지는 `/feed` 내부에서만 보인다. 두 개가 같은 화면에서 동시 노출되지 않음 → 허용 가능.

### 다음 부채

- 여러 챌린지 동시 진행 시 read 테이블 승격 (v1 스펙 확정 후)
- 홈 페이지의 "최근 피드 미리보기 3건" 에서 개별 카드 kudos count 표시 (별도 plan)
```

(b) 2026-04-30 (후속) 블록의 "### 다음 부채" 섹션을 찾아 "**Web Push + `notification_sent` 이벤트**" 줄 바로 아래에 다음을 삽입 (기존 문장 수정 금지):

```markdown
- **추후 메모** (2026-05-04): "Kudos 수신 시 Web Push" 는 별도 결정으로 **의도적 비구현** 확정. DESIGN_BRIEF §1.5 "알림 2종만 · Kudos 는 배지" 준수. `users.last_feed_seen_at` + 피드 탭 배지로 대체. 세부는 [2026-05-04 엔트리](#2026-05-04--kudos-미읽음-배지-push-의도적-비구현) 참조.
```

- [ ] **Step 2: 커밋**

```bash
git add docs/JOURNAL.md
git commit -m "docs(journal): log kudos unread badge + clarify B2 push is intentional non-goal"
```

---

## Task 10: 최종 검증 — typecheck · lint · test · build

- [ ] **Step 1: 전체 파이프라인**

```bash
pnpm tsc --noEmit --pretty false
pnpm eslint .
pnpm vitest run --project unit
pnpm build
```

Expected: 모두 green. unit 기존 228 → 228 + 약 9 개 증가(helper 4 + action 2 + UnreadBadge 3 + BottomNav 2 = 11 전후, 실제 구현 따라 가감).

- [ ] **Step 2: 통합 + E2E 로컬 sanity**

```bash
pnpm test:integration tests/integration/reads/unread-kudos.spec.ts
pnpm exec playwright test tests/e2e/kudos-badge.spec.ts
```

- [ ] **Step 3: 로컬 수동 스모크**

Run: `pnpm dev` → `pnpm login:link <author@test.local>` → 로컬 수동으로 B 계정 kudos 삽입(`pnpm seed:action-log` 혹은 psql 직접) → `/home` dot · `/feed` 배지 확인 → `/home` 재진입 dot 사라짐 확인.

- [ ] **Step 4: PR 생성 (한국어 body)**

```bash
git push -u origin feat/kudos-unread-badge
gh pr create --title "feat(kudos): unread badge on feed + home tab dot" --body "$(cat <<'EOF'
## Summary
- DESIGN_BRIEF §1.5 ("알림 2종만 · Kudos 는 배지") 를 실구현. JOURNAL 2026-04-30 의 "Kudos → Web Push" 부채는 **의도적 비구현**으로 clarify.
- `users.last_feed_seen_at timestamptz` 단일 컬럼 기반 last-seen 모델. `fetchUnreadKudosCount` 가 RLS 를 통과한 kudos 중 `created_at > last_seen` 개수를 반환.
- Surface 2곳: `/feed` 헤더 "새 응원 N건" 배지(count 노출) + BottomNav 홈 탭 우상단 dot(presence only). 피드 진입 시 `markFeedSeen` Server Action 이 `last_feed_seen_at = now()` 로 갱신하고 `/feed`·`/home` revalidate.
- self-kudos 는 기존 RLS `kudos_insert_self_not_own` 이 이미 차단 → 배지에서도 자동 제외.

## Test plan
- [x] Unit — `isUnread` helper · `markFeedSeen` action · `UnreadBadge` · `BottomNav` dot
- [x] Integration — RLS 차단 · last_seen null · seen 이후 증가분 · self-kudos 차단 (4 tests)
- [x] E2E — 2 유저 시나리오: dot 보임 → 배지 보임 → home 에서 dot 사라짐
- [x] typecheck / eslint / build green
- [x] 로컬 수동: /home dot → /feed 배지 → /home dot 사라짐

## Scope 외
- Kudos Web Push 연결 — §1.5 충돌, 의도적 제외
- Kudos 이모지별 구분 (전체 합산만)
- 여러 챌린지 동시 진행의 read 테이블 승격 (v1 스펙 확정 후)
EOF
)"
```

- [ ] **Step 5: 머지 후 세션 마감**

---

## Self-Review

**1. Spec coverage (DESIGN_BRIEF §1.5):**
- ✅ "알림 2종(시작·마감)만" → push 경로 건드리지 않음
- ✅ "Kudos 는 배지 표시" → `/feed` 배지 + BottomNav dot
- ✅ "앱 내 빨간 배지 최대 1곳" → 홈 탭 dot 은 count-less presence, `/feed` 내 배지와 동시 노출 없음
- ⏸️ Push 연결 → 의도적 비구현 (JOURNAL clarify)

**2. Placeholder scan:** "TBD/TODO/implement later" 제로.

**3. Type consistency:**
- `UnreadBadgeProps.count: number` · `BottomNavProps.unreadDot: boolean` · `fetchUnreadKudosCount → Promise<number>` 전체 정렬.
- `markFeedSeen` 은 `ActionResult<null>` 반환. page.tsx 는 `void` 로 소비.
- `isUnread({ createdAt: string, lastSeenAt: string | null })` 는 DB row 모양(ISO string)과 1:1.

**4. 위험 체크:**
- Task 5 의 page.tsx "count 먼저, markSeen 나중" 순서가 뒤집히면 배지가 절대 안 뜸 → 테스트 단언 순서에 반드시 포함.
- Task 6 의 layout 은 모든 `(app)` 진입마다 kudos count 쿼리를 트리거. Task 1 의 `idx_kudos_created_at` 가 필요. head:true + count 로 byte 비용은 최소.
- Task 8 E2E 는 admin 이 2번째 유저를 만들므로 `@test.local` 스코프 유지. `truncate_test_data` 가 정리.
- `markFeedSeen` 안의 `revalidatePath` 가 `/home`/`/feed` 만 — BottomNav 가 렌더되는 다른 라우트는 다음 RSC 새로고침까지 dot 이 유지됨. POC 허용 범위.
