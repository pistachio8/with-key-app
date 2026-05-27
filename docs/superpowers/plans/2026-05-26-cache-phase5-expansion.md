---
plan: 2026-05-26-cache-phase5-expansion
title: Cache Phase 5 — SNS 표면 확대 (/home · /me/challenges · /group/[id])
author: pistachio8
date: 2026-05-26
status: draft
---

# Cache Phase 5 Implementation Plan

**Goal:** SNS Cache Strategy Blueprint §Phase 5 — Phase 4 에서 검증된 `viewerCached` + `cacheTag` 패턴을 `/home` · `/me/challenges` · `/group/[id]` 3개 SNS 표면에 확대 적용해 read 비용 절감 + read-your-writes 보장.

**Architecture:** 각 표면의 read 함수를 `'use cache: private'` inline directive 로 감싸고 viewer-keyed primary tag + entity-keyed secondary tag 부여. mutation 경로에서 owner 본인은 `updateTag` (즉시 fresh), 타 viewer 는 `revalidateTag(..., 'max')` (SWR) 로 분리 invalidation. Phase 4 + ADR-0021 (inline 강제) 와 동일 패턴.

**Tech Stack:** Next.js 16 App Router · React 19 · `'use cache: private'` inline directive (ADR-0021, cacheComponents) · Supabase RLS.

---

## 변경 이력

- **v1 (2026-05-26, 본 PR)** — Phase 4 머지(PR #103) 후 작성. blueprint §Phase 5 의 "별도 plan 권장" 지시에 따라 3개 표면을 sub-PR 로 분할.

## 배경

`docs/superpowers/plans/2026-05-26-sns-cache-strategy-blueprint.md` §Phase 5 (Line 305~309):

> /home · /me/challenges · /group/[id] 같은 SNS 표면에 동일 패턴 적용. Phase 4 패턴 재사용. 별도 plan 파일에서 다루는 게 깔끔.

Phase 4 가 검증한 패턴 핵심:

1. read 를 **viewer-keyed private cache** + 명시적 tag 로 격리
2. mutation 은 **소유 데이터의 tag 만** `updateTag` (owner) + `revalidateTag('max')` (타 viewer)
3. 광범위 `revalidatePath("/", "layout")` 를 점진 폐기

## 영향 범위

### 변경 경로 (요약)

- read 함수:
  - `src/lib/db/reads/current-challenges.ts` — `fetchCurrentChallenges` viewerCached wrapping
  - `src/lib/db/reads/my-challenges.ts` — `fetchMyChallenges` viewerCached wrapping
  - `src/lib/db/reads/group-detail.ts` — `fetchGroupDetail` viewerCached wrapping
  - `src/lib/db/reads/me.ts` — `fetchMyDisplayName` · `hasEverCreatedChallenge` viewerCached wrapping
- page 셸 분리:
  - `src/app/(app)/home/page.tsx` — Suspense 경계 도입 (현재 page 본문에서 await)
  - `src/app/(app)/me/challenges/page.tsx` — Suspense 경계 도입
  - `src/app/(app)/group/[id]/page.tsx` — 이미 분리됨 (Phase 1b-2b), 무변경
- mutation 경로:
  - `src/app/(app)/challenge/[id]/action/_actions.ts` — `logAction` 에 `updateTag('user-${uid}-home-feed')` 추가
  - `src/app/(app)/challenge/[id]/_actions.ts` — `joinChallenge` · `leaveChallenge` · `startChallenge` · `closeChallenge` 등에 affected user 의 `home-feed` · `my-challenges` tag 무효화
  - `src/app/(app)/group/[id]/_actions.ts` — 멤버/그룹 변경에 `group-${gid}` · 멤버별 `home-feed` 무효화
  - `src/app/(app)/group/new/_actions.ts` — 그룹 생성 시 owner 의 `home-feed` 무효화
- spec:
  - `docs/superpowers/specs/2026-05-26-cache-phase5-home-tags.md`
  - `docs/superpowers/specs/2026-05-26-cache-phase5-my-challenges-tags.md`
  - `docs/superpowers/specs/2026-05-26-cache-phase5-group-detail-tags.md`

### 데이터/RLS 영향

**없음.** Phase 2 의 `visibility_version` 같은 schema 변경은 본 plan 범위 외. 모든 작업은 read 함수 래핑 + mutation tag 호출 변경에 한정.

> rationale: /home · /me/challenges · /group/[id] 표면은 멤버십·챌린지 status·action log 변화가 invalidation trigger 이며, 이미 mutation Server Action 이 명시적이라 trigger-based version 컬럼 추가가 ROI 낮다.

### 외부 서비스

없음.

### 재사용 후보

- `src/lib/db/reads/list-visible-action-log-ids.ts` — viewer-keyed inner/outer 분리 inline 패턴 (Phase 4)
- `src/lib/db/reads/kudos-viewer.ts` — `'use cache: private'` inline + cacheTag 직접 선언 (ADR-0021 적용)
- `src/lib/db/reads/kudos-counts.ts` — viewer-agnostic public `'use cache'` 패턴 (Phase 3)

> ADR-0021: `viewerCached` wrapper 는 closure 캡처로 인한 prerender fail 때문에 deprecated. 본 plan 의 모든 task 는 inline directive 패턴.

## Sub-PR 분할

```text
PR #103 (Phase 4) ─ 머지 완료
    │
Sub-PR 5-1 (/home cache)            ← 본 plan 최우선 (read 빈도 ↑)
    │
Sub-PR 5-2 (/me/challenges cache)   ← Sub-PR 5-1 머지 후 (tag 컨벤션 안정화 확인)
    │
Sub-PR 5-3 (/group/[id] cache)      ← Sub-PR 5-2 머지 후
    │
Sub-PR 5-4 (mutation cleanup)       ← 선택 — 잔여 revalidatePath("/", "layout") 제거
```

**병렬 가능성:** 5-1·5-2·5-3 는 서로 독립이라 동시 진행 가능. 다만 첫 PR 에서 tag 네이밍 컨벤션이 확정되므로 순차 진행을 기본으로 한다.

## 태그 컨벤션 (Phase 5)

| 표면              | read 함수                 | 디렉티브               | primary tag                 | secondary tag  | 라이프    |
| ----------------- | ------------------------- | ---------------------- | --------------------------- | -------------- | --------- |
| /home (list)      | `fetchCurrentChallenges`  | `'use cache: private'` | `user-${uid}-home-feed`     | —              | `minutes` |
| /home (name)      | `fetchMyDisplayName`      | `'use cache: private'` | `user-${uid}-display-name`  | —              | `hours`   |
| /home (empty CTA) | `hasEverCreatedChallenge` | `'use cache: private'` | `user-${uid}-has-created`   | —              | `days`    |
| /me/challenges    | `fetchMyChallenges`       | `'use cache: private'` | `user-${uid}-my-challenges` | —              | `minutes` |
| /group/[id]       | `fetchGroupDetail`        | `'use cache: private'` | `user-${uid}-group-${gid}`  | `group-${gid}` | `minutes` |

### 무효화 규칙

| 트리거 mutation                  | 영향 tag (모든 affected uid)                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `logAction` (action_log INSERT)  | `user-${actorUid}-home-feed` (verifiedToday 변경)                                                              |
| `joinChallenge` / `acceptInvite` | `user-${joinerUid}-home-feed` · `user-${joinerUid}-my-challenges` + 기존 멤버 `home-feed` (participantCount ↑) |
| `leaveChallenge`                 | `user-${leaverUid}-home-feed` · `user-${leaverUid}-my-challenges` + 남은 멤버 `home-feed`                      |
| `startChallenge` (status update) | 멤버 전원의 `home-feed`                                                                                        |
| `closeChallenge` (status update) | 멤버 전원의 `home-feed` · `my-challenges`                                                                      |
| `createGroup`                    | `user-${creatorUid}-home-feed`                                                                                 |
| `createChallenge`                | 그룹 멤버 전원의 `home-feed`                                                                                   |
| `updateGroup` (이름/계좌)        | `group-${gid}`                                                                                                 |
| `addGroupMember` / 멤버 제거     | `group-${gid}` + 멤버 본인 `home-feed`                                                                         |

본인 mutation 시 owner uid 에 대해 `updateTag` (즉시 fresh), 타 viewer 에 대해 `revalidateTag(..., 'max')` (SWR) 패턴은 Phase 3 의 kudos toggle 과 동일.

---

## File Structure

### 신규 / 수정 파일

```text
src/lib/db/reads/
  current-challenges.ts       (modify: viewerCached wrapping)
  my-challenges.ts            (modify: viewerCached wrapping)
  group-detail.ts             (modify: viewerCached wrapping)
  me.ts                       (modify: viewerCached wrapping)

src/app/(app)/
  home/page.tsx                          (modify: Suspense 셸 분리)
  me/challenges/page.tsx                 (modify: Suspense 셸 분리)
  group/[id]/page.tsx                    (no change — 기존 분리됨)

  challenge/[id]/_actions.ts             (modify: tag 기반 invalidation)
  challenge/[id]/action/_actions.ts      (modify: tag 기반 invalidation)
  group/[id]/_actions.ts                 (modify: tag 기반 invalidation)
  group/new/_actions.ts                  (modify: tag 기반 invalidation)

docs/superpowers/specs/
  2026-05-26-cache-phase5-home-tags.md          (new — Sub-PR 5-1)
  2026-05-26-cache-phase5-my-challenges-tags.md (new — Sub-PR 5-2)
  2026-05-26-cache-phase5-group-detail-tags.md  (new — Sub-PR 5-3)

src/lib/db/reads/
  current-challenges-cache.spec.ts       (new — Sub-PR 5-1, unit)
  my-challenges-cache.spec.ts            (new — Sub-PR 5-2, unit)
  group-detail-cache.spec.ts             (new — Sub-PR 5-3, unit)
```

---

## Sub-PR 5-1: /home cache + Suspense 셸

**브랜치:** `feat/cache-phase5-1-home`
**선행 의존:** Phase 4 (PR #103) 머지 완료
**병렬 가능:** Sub-PR 5-2 · 5-3 (단, tag 컨벤션 확정 위해 우선 머지 권장)

### Task 5-1.1: spec 작성

**Files:**

- Create: `docs/superpowers/specs/2026-05-26-cache-phase5-home-tags.md`

- [ ] **Step 1: spec 파일 작성**

본문:

```markdown
---
spec: 2026-05-26-cache-phase5-home-tags
title: /home cache tag 컨벤션 (Phase 5-1)
author: pistachio8
date: 2026-05-26
status: draft
---

## 목표

SNS cache plan v4 §Phase 5 — /home page 의 read 비용을 viewer-keyed private cache 로 절감.
mutation 시 read-your-writes 보장 + 타 viewer SWR.

## 태그 컨벤션

| 함수                      | 디렉티브               | tag                        | 라이프    |
| ------------------------- | ---------------------- | -------------------------- | --------- |
| `fetchCurrentChallenges`  | `'use cache: private'` | `user-${uid}-home-feed`    | `minutes` |
| `fetchMyDisplayName`      | `'use cache: private'` | `user-${uid}-display-name` | `hours`   |
| `hasEverCreatedChallenge` | `'use cache: private'` | `user-${uid}-has-created`  | `days`    |

## 무효화 규칙

| 트리거                               | 호출                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 본인 action_log INSERT (`logAction`) | `updateTag('user-${uid}-home-feed')`                                                            |
| 본인 챌린지 join/leave               | `updateTag('user-${uid}-home-feed')` + 기존 멤버 `revalidateTag('user-${mid}-home-feed','max')` |
| 본인 그룹 생성 (`createGroup`)       | `updateTag('user-${uid}-home-feed')`                                                            |
| 챌린지 status 변경 (start/close)     | 멤버 전원 `revalidateTag('user-${mid}-home-feed','max')`                                        |

`display-name` / `has-created` 는 빈도 ↓ + 라이프 ↑ 라 명시 invalidation 생략.

## RLS 통과

모든 read 가 `'use cache: private'` cookies-bound — viewer 의 RLS 정상.

## 참고

- plan: `docs/superpowers/plans/2026-05-26-cache-phase5-expansion.md`
- 패턴 원본: `2026-05-26-feed-read-decomposition.md` (Phase 4)
- ADR-0019
```

- [ ] **Step 2: validate:docs 통과 확인**

Run: `pnpm validate:docs`
Expected: PASS

### Task 5-1.2: `fetchCurrentChallenges` viewerCached wrapping

**Files:**

- Modify: `src/lib/db/reads/current-challenges.ts`
- Create: `src/lib/db/reads/current-challenges-cache.spec.ts`

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/db/reads/current-challenges-cache.spec.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("next/cache", () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

describe("fetchCurrentChallenges (Phase 5-1 cache)", () => {
  it("uses 'use cache: private' directive with user-keyed tag", async () => {
    const { cacheTag, cacheLife } = await import("next/cache");
    const { fetchCurrentChallenges } = await import("./current-challenges");

    // RLS 가 빈 결과 반환해도 cacheTag 는 호출돼야 함
    await fetchCurrentChallenges("user-abc");

    expect(cacheTag).toHaveBeenCalledWith("user-user-abc-home-feed");
    expect(cacheLife).toHaveBeenCalledWith("minutes");
  });
});
```

- [ ] **Step 2: 테스트 실행 (RED 확인)**

Run: `pnpm test src/lib/db/reads/current-challenges-cache.spec.ts`
Expected: FAIL — `cacheTag` 호출 안 됨.

- [ ] **Step 3: 구현 — inner/outer 분리 패턴 적용**

`src/lib/db/reads/current-challenges.ts` 의 `fetchCurrentChallenges` 함수 본문을 두 함수로 분리:

```ts
// inner — directive 가 활성된 cached 함수
async function fetchCurrentChallengesInner(userId: string): Promise<GroupChallengeView[]> {
  "use cache: private";
  cacheTag(`user-${userId}-home-feed`);
  cacheLife("minutes");

  // (기존 fetchCurrentChallenges body 그대로 옮김)
  const supabase = await createClient();
  // ... 기존 로직 ...
  return groups;
}

// outer — public API 시그니처 유지
export async function fetchCurrentChallenges(userId: string): Promise<GroupChallengeView[]> {
  return fetchCurrentChallengesInner(userId);
}
```

import 추가:

```ts
import { cacheLife, cacheTag } from "next/cache";
```

- [ ] **Step 4: 테스트 실행 (GREEN 확인)**

Run: `pnpm test src/lib/db/reads/current-challenges-cache.spec.ts`
Expected: PASS

- [ ] **Step 5: typecheck**

Run: `pnpm typecheck`
Expected: PASS

### Task 5-1.3: `fetchMyDisplayName` · `hasEverCreatedChallenge` wrapping

**Files:**

- Modify: `src/lib/db/reads/me.ts`
- Modify: `src/lib/db/reads/me.spec.ts`

- [ ] **Step 1: 실패 테스트 추가**

`src/lib/db/reads/me.spec.ts` 에 case 추가:

```ts
it("fetchMyDisplayName uses user-keyed cacheTag + hours life", async () => {
  const { cacheTag, cacheLife } = await import("next/cache");
  const { fetchMyDisplayName } = await import("./me");
  await fetchMyDisplayName("user-abc");
  expect(cacheTag).toHaveBeenCalledWith("user-user-abc-display-name");
  expect(cacheLife).toHaveBeenCalledWith("hours");
});

it("hasEverCreatedChallenge uses user-keyed cacheTag + days life", async () => {
  const { cacheTag, cacheLife } = await import("next/cache");
  const { hasEverCreatedChallenge } = await import("./me");
  await hasEverCreatedChallenge("user-abc");
  expect(cacheTag).toHaveBeenCalledWith("user-user-abc-has-created");
  expect(cacheLife).toHaveBeenCalledWith("days");
});
```

`vi.mock("next/cache", ...)` 가 기존 spec 상단에 없으면 추가.

- [ ] **Step 2: 테스트 실행 (RED 확인)**

Run: `pnpm test src/lib/db/reads/me.spec.ts`
Expected: FAIL

- [ ] **Step 3: 구현 — inner/outer 분리**

`src/lib/db/reads/me.ts`:

```ts
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function fetchMyDisplayNameInner(userId: string): Promise<string | null> {
  "use cache: private";
  cacheTag(`user-${userId}-display-name`);
  cacheLife("hours");

  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  return data?.display_name ?? null;
}

export async function fetchMyDisplayName(userId: string): Promise<string | null> {
  return fetchMyDisplayNameInner(userId);
}

// (readHasEverCreatedChallenge helper 그대로 유지)
export async function readHasEverCreatedChallenge(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  // (기존 body)
}

async function hasEverCreatedChallengeInner(userId: string): Promise<boolean> {
  "use cache: private";
  cacheTag(`user-${userId}-has-created`);
  cacheLife("days");

  const supabase = await createClient();
  return readHasEverCreatedChallenge(supabase, userId);
}

export async function hasEverCreatedChallenge(userId: string): Promise<boolean> {
  return hasEverCreatedChallengeInner(userId);
}
```

- [ ] **Step 4: 테스트 실행 (GREEN 확인)**

Run: `pnpm test src/lib/db/reads/me.spec.ts`
Expected: PASS

### Task 5-1.4: /home page Suspense 셸 분리

**Files:**

- Modify: `src/app/(app)/home/page.tsx`

> 셸 분리 자체는 Phase 1b-2 패턴 그대로. cache 도입의 사이드이펙트가 아니라 cached read 를 `<Suspense>` 안에서 호출하기 위한 필수 작업.

- [ ] **Step 1: 셸 + section 분리**

`src/app/(app)/home/page.tsx`:

```tsx
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { fetchCurrentChallenges } from "@/lib/db/reads/current-challenges";
import { fetchMyDisplayName, hasEverCreatedChallenge } from "@/lib/db/reads/me";
import { HomeGreeting } from "./_components/home-greeting";
import {
  InvitedChallengeBanner,
  type InvitedChallenge,
} from "./_components/invited-challenge-banner";
import { StatsGrid } from "./_components/stats-grid";
import { RunningChallengeList } from "./_components/running-challenge-list";
import { PwaGate } from "./_components/pwa-gate";

export default function HomePage() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeSection />
    </Suspense>
  );
}

function HomeFallback() {
  return (
    <div className="flex flex-col gap-4 p-4" aria-busy="true" aria-label="홈 로딩 중">
      <div className="bg-muted h-12 w-1/2 animate-pulse rounded-2xl" />
      <div className="bg-muted h-24 w-full animate-pulse rounded-2xl" />
      <div className="bg-muted h-40 w-full animate-pulse rounded-2xl" />
    </div>
  );
}

async function HomeSection() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // (기존 HomePage body 그대로 — fetchCurrentChallenges · fetchMyDisplayName · invites 계산 · render JSX)
}
```

`HomeSection` 본문 = 기존 `HomePage` body 그대로 이전 (PwaGate · HomeGreeting · InvitedChallengeBanner · StatsGrid · RunningChallengeList 렌더 포함).

- [ ] **Step 2: build 검증**

Run: `NEXT_BUILD_WORKERS=1 pnpm build`
Expected: `/home` prerender 통과 (셸 static, section dynamic).

### Task 5-1.5: mutation invalidation — `logAction`

**Files:**

- Modify: `src/app/(app)/challenge/[id]/action/_actions.ts`
- Modify: `src/app/(app)/challenge/[id]/action/_actions.spec.ts`

- [ ] **Step 1: 실패 테스트 추가**

`_actions.spec.ts` 의 `vi.mock("next/cache", ...)` 에 `updateTag: vi.fn()` 추가 후 test case:

```ts
it("logAction updates 'user-${uid}-home-feed' tag", async () => {
  const { updateTag } = await import("next/cache");
  // (fixture: 인증된 user, valid input)
  await logAction({ ...inputFixture });
  expect(updateTag).toHaveBeenCalledWith(`user-${fixtureUserId}-home-feed`);
});
```

- [ ] **Step 2: 테스트 실행 (RED 확인)**

Run: `pnpm test src/app/\(app\)/challenge/\[id\]/action/_actions.spec.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

`src/app/(app)/challenge/[id]/action/_actions.ts` Line 3:

```ts
import { revalidatePath, updateTag } from "next/cache";
```

Line 208~210 (action_log INSERT 성공 후) 에 한 줄 추가:

```ts
revalidatePath(`/challenge/${parsed.input.challengeId}`);
revalidatePath(`/challenge/${parsed.input.challengeId}/dashboard`);
updateTag(`user-${user.id}-home-feed`); // Phase 5-1: 본인 verifiedToday 즉시 fresh
```

- [ ] **Step 4: 테스트 실행 (GREEN 확인)**

Run: `pnpm test src/app/\(app\)/challenge/\[id\]/action/_actions.spec.ts`
Expected: PASS

### Task 5-1.6: 통합 검증 + 커밋

- [ ] **Step 1: 전체 검증**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:docs
NEXT_BUILD_WORKERS=1 pnpm build
```

Expected: 모두 PASS

- [ ] **Step 2: 수동 smoke (로컬 dev)**

`pnpm dev` 후 모바일 viewport 에서:

1. `/home` 진입 → 셸 fallback 즉시 → 데이터 stream
2. `/challenge/[id]/action` 에서 인증 완료 → `/home` 복귀 → "오늘 인증 완료" stats 즉시 반영
3. 새 챌린지 생성 → `/home` 반영 (cacheLife minutes 라 자연 수렴)

- [ ] **Step 3: 커밋**

```bash
git add docs/superpowers/specs/2026-05-26-cache-phase5-home-tags.md \
        src/lib/db/reads/current-challenges.ts \
        src/lib/db/reads/me.ts \
        src/lib/db/reads/current-challenges-cache.spec.ts \
        src/lib/db/reads/me.spec.ts \
        src/app/\(app\)/home/page.tsx \
        src/app/\(app\)/challenge/\[id\]/action/_actions.ts \
        src/app/\(app\)/challenge/\[id\]/action/_actions.spec.ts
git commit -m "feat(cache): /home read viewerCached + Suspense 셸 (Phase 5-1)

- fetchCurrentChallenges · fetchMyDisplayName · hasEverCreatedChallenge 에
  viewerCached pattern 적용 (user-keyed tag, life: minutes/hours/days)
- /home page 를 Suspense 셸 + HomeSection async 자식으로 분리
- logAction 에 updateTag('user-\${uid}-home-feed') 추가 — verifiedToday read-your-writes
- spec: docs/superpowers/specs/2026-05-26-cache-phase5-home-tags.md"
```

- [ ] **Step 4: PR 생성 (사용자 확인 후)**

`base: develop`, title: `feat(cache): /home read viewerCached + Suspense 셸 (Phase 5-1)`

### Sub-PR 5-1 검증 게이트

- 자동: typecheck · lint · test · validate:docs · `NEXT_BUILD_WORKERS=1 pnpm build`
- 수동: 모바일 viewport `/home` smoke + action 인증 → home stats 즉시 반영
- 머지 후 상태: working improvement — /home read 캐시됨, action 본인 read-your-writes
- 롤백: revert PR. cacheLife minutes 라 stale 영향 최대 1분

---

## Sub-PR 5-2: /me/challenges cache

**브랜치:** `feat/cache-phase5-2-my-challenges`
**선행 의존:** Sub-PR 5-1 머지 (tag 컨벤션 안정화)

### Task 5-2.1: spec 작성

**Files:**

- Create: `docs/superpowers/specs/2026-05-26-cache-phase5-my-challenges-tags.md`

- [ ] **Step 1: spec 파일 작성**

```markdown
---
spec: 2026-05-26-cache-phase5-my-challenges-tags
title: /me/challenges cache tag 컨벤션 (Phase 5-2)
author: pistachio8
date: 2026-05-26
status: draft
---

## 태그 컨벤션

| 함수                | 디렉티브               | tag                         | 라이프    |
| ------------------- | ---------------------- | --------------------------- | --------- |
| `fetchMyChallenges` | `'use cache: private'` | `user-${uid}-my-challenges` | `minutes` |

## 무효화 규칙

| 트리거                          | 호출                                                         |
| ------------------------------- | ------------------------------------------------------------ |
| 본인 join/leave                 | `updateTag('user-${uid}-my-challenges')`                     |
| 챌린지 status 변경 (close)      | 멤버 전원 `revalidateTag('user-${mid}-my-challenges','max')` |
| 챌린지 생성 (`createChallenge`) | owner 본인 `updateTag('user-${ownerUid}-my-challenges')`     |

## 참고

- plan: `2026-05-26-cache-phase5-expansion.md`
- ADR-0019
```

### Task 5-2.2: `fetchMyChallenges` viewerCached wrapping

**Files:**

- Modify: `src/lib/db/reads/my-challenges.ts`
- Create: `src/lib/db/reads/my-challenges-cache.spec.ts`

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/db/reads/my-challenges-cache.spec.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));

describe("fetchMyChallenges (Phase 5-2 cache)", () => {
  it("uses user-keyed cacheTag + minutes life", async () => {
    const { cacheTag, cacheLife } = await import("next/cache");
    const { fetchMyChallenges } = await import("./my-challenges");
    await fetchMyChallenges("user-xyz");
    expect(cacheTag).toHaveBeenCalledWith("user-user-xyz-my-challenges");
    expect(cacheLife).toHaveBeenCalledWith("minutes");
  });
});
```

- [ ] **Step 2: 테스트 실행 (RED 확인)**

Run: `pnpm test src/lib/db/reads/my-challenges-cache.spec.ts`
Expected: FAIL

- [ ] **Step 3: 구현 — inner/outer 분리**

`src/lib/db/reads/my-challenges.ts`:

```ts
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ChallengeStatus } from "./active-challenge";

// (기존 MyChallengeItem · MyChallenges · deriveCounts 유지)

async function fetchMyChallengesInner(userId: string): Promise<MyChallenges> {
  "use cache: private";
  cacheTag(`user-${userId}-my-challenges`);
  cacheLife("minutes");

  // (기존 fetchMyChallenges body 그대로)
  const supabase = await createClient();
  // ... 기존 로직 ...
  return { owner, member };
}

export async function fetchMyChallenges(userId: string): Promise<MyChallenges> {
  return fetchMyChallengesInner(userId);
}
```

- [ ] **Step 4: 테스트 실행 (GREEN 확인)**

Run: `pnpm test src/lib/db/reads/my-challenges-cache.spec.ts`
Expected: PASS

### Task 5-2.3: /me/challenges page Suspense 셸 분리

**Files:**

- Modify: `src/app/(app)/me/challenges/page.tsx`

- [ ] **Step 1: 셸 + section 분리**

```tsx
import { Suspense } from "react";
import Link from "next/link";
import { Plus, Trophy } from "lucide-react";
import { requireUser } from "@/lib/auth/require-user";
import { fetchMyChallenges, deriveCounts } from "@/lib/db/reads/my-challenges";
import { EmptyState } from "@/components/ui/empty-state";
import { ManageCardList } from "./_components/manage-card-list";
import { ChallengeLimitChart } from "./_components/challenge-limit-chart";

const OWNER_LIMIT = 5;

export default function MyChallengesPage() {
  return (
    <Suspense fallback={<MyChallengesFallback />}>
      <MyChallengesSection />
    </Suspense>
  );
}

function MyChallengesFallback() {
  return (
    <div className="flex flex-col gap-4 p-4" aria-busy="true" aria-label="챌린지 관리 로딩 중">
      <div className="bg-muted h-8 w-1/3 animate-pulse rounded-2xl" />
      <div className="bg-muted h-32 w-full animate-pulse rounded-2xl" />
      <div className="bg-muted h-40 w-full animate-pulse rounded-2xl" />
    </div>
  );
}

async function MyChallengesSection() {
  // (기존 MyChallengesPage body 그대로)
}
```

- [ ] **Step 2: build 검증**

Run: `NEXT_BUILD_WORKERS=1 pnpm build`
Expected: `/me/challenges` prerender 통과.

### Task 5-2.4: mutation invalidation — `acceptInvite` · `leaveChallenge`

**Files:**

- Modify: `src/app/(app)/challenge/[id]/_actions.ts`
- Modify: `src/app/(app)/challenge/[id]/_actions.spec.ts`

> 본 PR 범위: `my-challenges` tag 의 owner-only updateTag 만 추가. cross-viewer 처리는 Sub-PR 5-4 (cleanup) 에서 일괄.

- [ ] **Step 1: 실패 테스트 추가**

`_actions.spec.ts` 에 `vi.mock("next/cache", ...)` 에 `updateTag: vi.fn()` 추가 후:

```ts
it("acceptInvite updates 'user-${uid}-my-challenges' tag", async () => {
  const { updateTag } = await import("next/cache");
  await acceptInvite({ challengeId: cidFixture });
  expect(updateTag).toHaveBeenCalledWith(`user-${userFixture.id}-my-challenges`);
});

it("leaveChallenge updates 'user-${uid}-my-challenges' tag", async () => {
  const { updateTag } = await import("next/cache");
  await leaveChallenge({ challengeId: cidFixture });
  expect(updateTag).toHaveBeenCalledWith(`user-${userFixture.id}-my-challenges`);
});
```

- [ ] **Step 2: 테스트 실행 (RED 확인)**

Run: `pnpm test src/app/\(app\)/challenge/\[id\]/_actions.spec.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

`src/app/(app)/challenge/[id]/_actions.ts` 의 `acceptInvite` · `leaveChallenge` 의 mutation 성공 분기에 1줄씩 추가 (기존 `revalidatePath` 유지):

```ts
updateTag(`user-${user.id}-my-challenges`);
```

import 에 `updateTag` 추가.

- [ ] **Step 4: 테스트 실행 (GREEN 확인)**

Run: `pnpm test src/app/\(app\)/challenge/\[id\]/_actions.spec.ts`
Expected: PASS

### Task 5-2.5: 통합 검증 + 커밋

- [ ] **Step 1: 전체 검증**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:docs
NEXT_BUILD_WORKERS=1 pnpm build
```

Expected: PASS

- [ ] **Step 2: 수동 smoke**

`/me/challenges` 진입 → 셸 → 데이터. invite 수락 → `/me/challenges` 복귀 → 참여 목록에 즉시 추가.

- [ ] **Step 3: 커밋 + PR**

```bash
git commit -m "feat(cache): /me/challenges viewerCached + Suspense 셸 (Phase 5-2)

- fetchMyChallenges 에 viewerCached (user-keyed, minutes life)
- /me/challenges Suspense 셸 분리
- acceptInvite · leaveChallenge 에 updateTag('user-\${uid}-my-challenges')
- spec: docs/superpowers/specs/2026-05-26-cache-phase5-my-challenges-tags.md"
```

### Sub-PR 5-2 검증 게이트

- 자동: typecheck · lint · test · validate:docs · build
- 수동: `/me/challenges` smoke + invite 수락 시 즉시 반영
- 머지 후 상태: working improvement
- 롤백: revert PR

---

## Sub-PR 5-3: /group/[id] cache

**브랜치:** `feat/cache-phase5-3-group-detail`
**선행 의존:** Sub-PR 5-2 머지

### Task 5-3.1: spec 작성

**Files:**

- Create: `docs/superpowers/specs/2026-05-26-cache-phase5-group-detail-tags.md`

- [ ] **Step 1: spec 파일 작성**

```markdown
---
spec: 2026-05-26-cache-phase5-group-detail-tags
title: /group/[id] cache tag 컨벤션 (Phase 5-3)
author: pistachio8
date: 2026-05-26
status: draft
---

## 태그 컨벤션

| 함수               | 디렉티브               | primary tag                | secondary tag  | 라이프    |
| ------------------ | ---------------------- | -------------------------- | -------------- | --------- |
| `fetchGroupDetail` | `'use cache: private'` | `user-${uid}-group-${gid}` | `group-${gid}` | `minutes` |

## 무효화 규칙

| 트리거                              | 호출                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| 본인 그룹 정보 변경 (이름·계좌)     | `updateTag('user-${uid}-group-${gid}')` + `revalidateTag('group-${gid}','max')` (타 멤버 SWR) |
| 멤버 추가/제거 (`addMember`/`kick`) | `revalidateTag('group-${gid}','max')` + 영향 멤버 `updateTag('user-${mid}-group-${gid}')`     |
| 챌린지 생성/종료                    | `revalidateTag('group-${gid}','max')` (group challenges 목록 변경)                            |

`fetchGroupDetail` 은 viewer-keyed (private cache) — RLS 가 비멤버 차단해도 cache 레벨에서 viewer 분리해 안전.
secondary tag `group-${gid}` 는 cross-viewer 일괄 SWR 용.

## 참고

- plan: `2026-05-26-cache-phase5-expansion.md`
- ADR-0019
```

### Task 5-3.2: `fetchGroupDetail` viewerCached wrapping

**Files:**

- Modify: `src/lib/db/reads/group-detail.ts`
- Create: `src/lib/db/reads/group-detail-cache.spec.ts`

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/db/reads/group-detail-cache.spec.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "viewer-1" } } }) },
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
}));

describe("fetchGroupDetail (Phase 5-3 cache)", () => {
  it("uses primary + secondary cacheTag with minutes life", async () => {
    const { cacheTag, cacheLife } = await import("next/cache");
    const { fetchGroupDetail } = await import("./group-detail");
    await fetchGroupDetail("group-abc");
    expect(cacheTag).toHaveBeenCalledWith("user-viewer-1-group-group-abc", "group-group-abc");
    expect(cacheLife).toHaveBeenCalledWith("minutes");
  });
});
```

> 주의: `fetchGroupDetail` 시그니처는 `(groupId)` 단일 인자 유지. viewer 식별은 outer 가 `auth.getUser()` 호출 후 inner 에 inject.

- [ ] **Step 2: 테스트 실행 (RED 확인)**

Run: `pnpm test src/lib/db/reads/group-detail-cache.spec.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

`src/lib/db/reads/group-detail.ts`:

```ts
import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// (type 정의 유지)

async function fetchGroupDetailInner(
  groupId: string,
  viewerId: string,
): Promise<GroupDetailView | null> {
  "use cache: private";
  cacheTag(`user-${viewerId}-group-${groupId}`, `group-${groupId}`);
  cacheLife("minutes");

  const supabase = await createClient();
  // (기존 fetchGroupDetail body 그대로)
  // ...
  return detail;
}

export async function fetchGroupDetail(groupId: string): Promise<GroupDetailView | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return fetchGroupDetailInner(groupId, user.id);
}
```

- [ ] **Step 4: 테스트 실행 (GREEN 확인)**

Run: `pnpm test src/lib/db/reads/group-detail-cache.spec.ts`
Expected: PASS

### Task 5-3.3: mutation invalidation — `updateGroup` · 멤버 변경

**Files:**

- Modify: `src/app/(app)/group/[id]/_actions.ts`
- Modify: `src/app/(app)/group/[id]/_actions.spec.ts`

- [ ] **Step 1: 실패 테스트 추가**

`_actions.spec.ts` 의 `vi.mock("next/cache", ...)` 에 `updateTag`, `revalidateTag` 추가 후 액션별로:

```ts
it("updateGroupName invalidates group + viewer tags", async () => {
  const { updateTag, revalidateTag } = await import("next/cache");
  await updateGroupName({ groupId: gidFixture, name: "new" });
  expect(updateTag).toHaveBeenCalledWith(`user-${ownerUid}-group-${gidFixture}`);
  expect(revalidateTag).toHaveBeenCalledWith(`group-${gidFixture}`, "max");
});
```

- [ ] **Step 2: 테스트 실행 (RED 확인)**

Run: `pnpm test src/app/\(app\)/group/\[id\]/_actions.spec.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

`src/app/(app)/group/[id]/_actions.ts` import:

```ts
import { revalidatePath, revalidateTag, updateTag } from "next/cache";
```

각 mutation 성공 분기에 2줄 추가 (기존 `revalidatePath("/", "layout")` 유지):

```ts
updateTag(`user-${user.id}-group-${groupId}`);
revalidateTag(`group-${groupId}`, "max");
```

대상 액션: `updateGroupName` · `updateGroupAccount` · 멤버 추가/제거 액션.

- [ ] **Step 4: 테스트 실행 (GREEN 확인)**

Run: `pnpm test src/app/\(app\)/group/\[id\]/_actions.spec.ts`
Expected: PASS

### Task 5-3.4: 통합 검증 + 커밋

- [ ] **Step 1: 전체 검증**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:docs
NEXT_BUILD_WORKERS=1 pnpm build
```

- [ ] **Step 2: 수동 smoke**

`/group/[id]` 진입 → owner 가 이름 변경 → 멤버 세션에서도 `minutes` 내 반영. 본인 즉시 fresh.

- [ ] **Step 3: 커밋 + PR**

```bash
git commit -m "feat(cache): /group/[id] viewerCached + tag invalidation (Phase 5-3)

- fetchGroupDetail 에 viewerCached (primary user-keyed + secondary group-keyed)
- updateGroupName · updateGroupAccount · 멤버 변경에 updateTag + revalidateTag('max')
- spec: docs/superpowers/specs/2026-05-26-cache-phase5-group-detail-tags.md"
```

### Sub-PR 5-3 검증 게이트

- 자동: typecheck · lint · test · validate:docs · build
- 수동: `/group/[id]` smoke + 그룹 정보 변경 시 본인 즉시 / 멤버 SWR
- 머지 후 상태: working improvement
- 롤백: revert PR

---

## Sub-PR 5-4 (선택): mutation invalidation cleanup

**브랜치:** `chore/cache-phase5-4-mutation-cleanup`
**선행 의존:** 5-1·5-2·5-3 모두 머지

광범위 `revalidatePath("/", "layout")` 가 잔존하는 경로에서 Phase 5 tag 기반 명시 invalidation 으로 점진 치환.

대상 (현재 grep 결과):

- `src/app/(app)/group/new/_actions.ts:91` — `createGroup`
- `src/app/(app)/group/[id]/_actions.ts:84,139` — 멤버 leave / 그룹 disband
- `src/app/(app)/challenge/[id]/_actions.ts:316,363,379,408` — startChallenge · closeChallenge 등

각 경로별로 affected user(s) 의 `home-feed` · `my-challenges` · `group-${gid}` tag 만 명시 호출. 본 PR 은 회귀 위험이 크므로 5-3 머지 후 별도 진행 (또는 후속 plan 분리).

> Phase 5 의 core value 는 5-1·5-2·5-3 에서 이미 달성. 5-4 는 path-level 무효화의 잔여 비용 제거가 목적.

---

## 검증 (공통)

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:docs
NEXT_BUILD_WORKERS=1 pnpm build
```

수동 확인:

- [ ] Sub-PR 5-1: 모바일 viewport `/home` smoke + action 인증 → home stats 즉시 반영
- [ ] Sub-PR 5-2: `/me/challenges` smoke + invite 수락 시 즉시 반영
- [ ] Sub-PR 5-3: `/group/[id]` smoke + 그룹 정보 변경 시 본인 즉시 / 멤버 SWR

## 리스크 / 미해결

| 리스크                                                                                      | 등급 | 대응                                                                                    |
| ------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------- |
| `'use cache: private'` v16.x 마이너에서 API/동작 변경                                       | 중   | ADR-0021 inline 패턴 그대로 — minor pin (`16.2.x`) 유지 + AGENTS.md changelog 룰        |
| `home-feed` invalidation 누락된 mutation 경로 잔존 (e.g., closeChallenge)                   | 중   | cacheLife `minutes` 가 자연 수렴 보장. Sub-PR 5-4 에서 일괄 마무리                      |
| /home · /me/challenges 통합 테스트 부재 (cookies mock 필요)                                 | 낮음 | unit 레벨에서 cacheTag 호출 검증으로 충분. Phase 4 spec §미해결 follow-up 과 동일 한계  |
| `fetchGroupDetail` 의 secondary tag `group-${gid}` 가 viewer-keyed cache 내부에서 작동 검증 | 중   | Next.js docs 의 `cacheTag` 가변 인자 의미 확인 + Vercel Preview 에서 멤버 SWR 동작 실측 |
| Suspense 셸 도입으로 기존 `/home` · `/me/challenges` 의 SSR 동작 변경                       | 중   | Phase 1b-2 동일 패턴 — 이미 다른 페이지에서 검증됨                                      |
| Sub-PR 5-4 의 광범위 `revalidatePath` 제거 시 회귀                                          | 중   | 5-4 를 별도 plan 으로 분리하거나 surface 단위로 잘게 나누어 진행                        |

## 참고

- plan v4: `docs/superpowers/plans/2026-05-26-sns-cache-strategy-blueprint.md` §Phase 5
- spec Phase 4: `docs/superpowers/specs/2026-05-26-feed-read-decomposition.md`
- spec Phase 3: `docs/superpowers/specs/2026-05-26-kudos-cache-tags.md`
- ADR-0019: `docs/adr/0019-cache-components-and-service-role-policy.md`
- ADR-0020: `docs/adr/0020-visibility-version-trigger.md`
- ADR-0021: `docs/adr/0021-private-cache-inline-pattern.md` (inline directive 강제)
- Next.js docs: `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache-private.md`, `04-functions/updateTag.md`, `04-functions/cacheLife.md`
