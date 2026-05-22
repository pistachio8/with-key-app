---
plan: 2026-05-22-home-empty-state-returning-user
title: Home Empty State Returning User
author: pistachio8
date: 2026-05-22
status: draft
---

# Home Empty State Returning User Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 화면 EmptyState description 카피를 "내가 owner 인 그룹에 challenge row 가 존재하는 사용자"에게는 `"친구들과 함께 챌린지를 만들어보세요"`(「첫」 제거)로 분기 노출한다.

**Architecture:** `owner-groups-for-challenge-form.ts` 의 3-layer 패턴(pure → `read(supabase, id)` → `fetch(id)`)을 따라 `me.ts` 에 `readHasEverCreatedChallenge` + `hasEverCreatedChallenge` 를 추가한다. `page.tsx` 빈 상태 분기 내부에서만 단락 평가(`hasAnyChallenge ? false : await ...`)로 호출해 진행 중 챌린지가 있는 사용자에게는 절대 추가 쿼리를 보내지 않는다.

**Tech Stack:** Next.js 16 App Router · React 19 RSC · TypeScript · Supabase JS · Vitest (unit) · pnpm.

**Spec:** [`docs/superpowers/specs/2026-05-22-home-empty-state-returning-user.md`](../specs/2026-05-22-home-empty-state-returning-user.md)

**Worktree / Branch:** `/Users/ian/gitlab/with-key-empty-state-returning` · `feat/home-empty-state-returning-user` (base: `develop`)

---

## 영향 범위

- 변경 경로:
  - `src/lib/db/reads/me.ts` (수정 — 함수 2개 추가)
  - `src/lib/db/reads/me.spec.ts` (신설)
  - `src/app/(app)/home/page.tsx` (수정 — 빈 상태 분기 내 ternary)
  - `docs/superpowers/specs/2026-05-22-home-empty-state-returning-user.md` (status: draft → accepted)
- 데이터/RLS 영향: 없음. migration 없음. 기존 RLS(`groups_select_member` · `challenges_select_member`) 그대로 통과.
- 외부 서비스: 없음.
- 재사용 후보:
  - 함수 분리 패턴: `src/lib/db/reads/owner-groups-for-challenge-form.ts` (3-layer)
  - 카피 노출 분기: `src/components/ui/empty-state.tsx` (description prop)

---

## File Structure (사전 결정)

- **`src/lib/db/reads/me.ts`** — server-only. `fetchMyDisplayName` 옆에 `readHasEverCreatedChallenge(supabase, userId): Promise<boolean>` (테스트 가능 read) + `hasEverCreatedChallenge(userId): Promise<boolean>` (top-level convenience, `createClient` 호출). 책임: 현재 사용자 메타데이터 read.
- **`src/lib/db/reads/me.spec.ts`** — 신설. `readHasEverCreatedChallenge` 의 5 시나리오를 fake supabase client 주입으로 검증. 책임: 위 함수 단위 테스트.
- **`src/app/(app)/home/page.tsx`** — RSC. 빈 상태 분기 진입 시에만 `hasEverCreatedChallenge` 호출 후 description prop ternary 분기.
- **spec 파일** — 구현 머지 직후 status 를 `accepted` 로 업데이트.

---

## Task 1: 단위 테스트 작성 (RED)

**Files:**

- Create: `src/lib/db/reads/me.spec.ts`

- [ ] **Step 1.1: 새 테스트 파일 생성**

`src/lib/db/reads/me.spec.ts` 를 신설하고 아래 내용을 그대로 붙여 넣는다. fake supabase client 는 chained builder(`from().select().eq()` · `from().select().in().limit()`)를 최소한으로만 흉내 낸다.

```typescript
// src/lib/db/reads/me.spec.ts
import { describe, expect, it, vi } from "vitest";
import { readHasEverCreatedChallenge } from "./me";

type GroupsResp = { data: { id: string }[] | null; error: unknown };
type ChallengesResp = { data: { id: string }[] | null; error: unknown };

function fakeClient(opts: { groups: GroupsResp; challenges?: ChallengesResp }) {
  // 두 번째 쿼리(`challenges`)가 호출됐는지 추적해 단락 평가 검증에 사용.
  const challengesCalled = vi.fn();

  const groupsBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue(opts.groups),
  };

  const challengesBuilder = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(async () => {
      challengesCalled();
      return opts.challenges ?? { data: [], error: null };
    }),
  };

  const client = {
    from: vi.fn((table: string) => {
      if (table === "groups") return groupsBuilder;
      if (table === "challenges") return challengesBuilder;
      throw new Error(`unexpected table: ${table}`);
    }),
  };

  return { client, challengesCalled };
}

describe("readHasEverCreatedChallenge", () => {
  it("owner 인 그룹이 0건 → false · challenges 쿼리는 호출되지 않는다", async () => {
    const { client, challengesCalled } = fakeClient({
      groups: { data: [], error: null },
    });
    const result = await readHasEverCreatedChallenge(
      client as unknown as Parameters<typeof readHasEverCreatedChallenge>[0],
      "user-1",
    );
    expect(result).toBe(false);
    expect(challengesCalled).not.toHaveBeenCalled();
  });

  it("owner 그룹은 있지만 challenge row 가 0건 → false", async () => {
    const { client } = fakeClient({
      groups: { data: [{ id: "g-1" }], error: null },
      challenges: { data: [], error: null },
    });
    const result = await readHasEverCreatedChallenge(
      client as unknown as Parameters<typeof readHasEverCreatedChallenge>[0],
      "user-1",
    );
    expect(result).toBe(false);
  });

  it("owner 그룹에서 challenge 1건+ 존재 → true (어떤 status 든)", async () => {
    const { client } = fakeClient({
      groups: { data: [{ id: "g-1" }], error: null },
      challenges: { data: [{ id: "c-1" }], error: null },
    });
    const result = await readHasEverCreatedChallenge(
      client as unknown as Parameters<typeof readHasEverCreatedChallenge>[0],
      "user-1",
    );
    expect(result).toBe(true);
  });

  it("groups 쿼리 에러 → false (fail-safe)", async () => {
    const { client, challengesCalled } = fakeClient({
      groups: { data: null, error: { message: "boom" } },
    });
    const result = await readHasEverCreatedChallenge(
      client as unknown as Parameters<typeof readHasEverCreatedChallenge>[0],
      "user-1",
    );
    expect(result).toBe(false);
    expect(challengesCalled).not.toHaveBeenCalled();
  });

  it("challenges 쿼리 에러 → false (fail-safe)", async () => {
    const { client } = fakeClient({
      groups: { data: [{ id: "g-1" }], error: null },
      challenges: { data: null, error: { message: "boom" } },
    });
    const result = await readHasEverCreatedChallenge(
      client as unknown as Parameters<typeof readHasEverCreatedChallenge>[0],
      "user-1",
    );
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 1.2: 실패를 확인**

Run: `pnpm test -- src/lib/db/reads/me.spec.ts`

Expected: 5 tests **FAIL** with module resolution error such as `does not provide an export named 'readHasEverCreatedChallenge'` — `me.ts` 에 아직 해당 export 가 없다.

---

## Task 2: read 함수 구현 (GREEN)

**Files:**

- Modify: `src/lib/db/reads/me.ts`

- [ ] **Step 2.1: `me.ts` 를 아래 내용으로 교체**

기존 `fetchMyDisplayName` 동작을 그대로 유지하면서 `readHasEverCreatedChallenge` + `hasEverCreatedChallenge` 를 추가한다. `owner-groups-for-challenge-form.ts` 의 3-layer 패턴을 그대로 따른다.

```typescript
// src/lib/db/reads/me.ts
import "server-only";
import { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function fetchMyDisplayName(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data.display_name;
}

/**
 * 본 사용자가 owner 인 그룹의 `challenges` 테이블에 row 가 1건 이상
 * 현재 시점에 존재하면 true. status 필터 없음(pending/accepted/active/closed 모두 카운트).
 *
 * 알려진 false negative: `deleteChallenge` 로 row 가 hard delete 된 경우 false.
 * 자세한 트레이드오프는 spec §Design "C1 — Known False Negatives" 참조.
 *
 * supabase 에러 시 false (fail-safe — 신규 사용자 카피로 떨어짐).
 */
export async function readHasEverCreatedChallenge(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data: ownedGroups, error: groupsErr } = await supabase
    .from("groups")
    .select("id")
    .eq("owner_id", userId);

  if (groupsErr) return false;
  if (!ownedGroups || ownedGroups.length === 0) return false;

  const { data: anyChallenge, error: chErr } = await supabase
    .from("challenges")
    .select("id")
    .in(
      "group_id",
      (ownedGroups as { id: string }[]).map((g) => g.id),
    )
    .limit(1);

  if (chErr) return false;
  return (anyChallenge?.length ?? 0) > 0;
}

export async function hasEverCreatedChallenge(userId: string): Promise<boolean> {
  const supabase = await createClient();
  return readHasEverCreatedChallenge(supabase, userId);
}
```

- [ ] **Step 2.2: 테스트 통과 확인**

Run: `pnpm test -- src/lib/db/reads/me.spec.ts`

Expected: 5 tests **PASS**.

- [ ] **Step 2.3: typecheck + lint**

Run: `pnpm typecheck`

Expected: 통과 (에러 없음).

Run: `pnpm lint`

Expected: 통과.

- [ ] **Step 2.4: 커밋**

```bash
git add src/lib/db/reads/me.ts src/lib/db/reads/me.spec.ts
git commit -m "feat(lib/db): hasEverCreatedChallenge read 함수 추가

홈 EmptyState description 분기를 위한 owner-grouped challenge
존재 여부 판정. owner-groups-for-challenge-form 의 3-layer
패턴(pure -> read(supabase,id) -> fetch(id)) 을 따른다.

spec: docs/superpowers/specs/2026-05-22-home-empty-state-returning-user.md"
```

---

## Task 3: 홈 page.tsx 빈 상태 분기

**Files:**

- Modify: `src/app/(app)/home/page.tsx` (line 9 import 한 줄 교체, line 71 다음에 두 줄 추가, line 88 의 description prop 한 줄 교체)

- [ ] **Step 3.1: import 라인 교체**

`page.tsx` line 9 의 `fetchMyDisplayName` import 한 줄을 다음 한 줄로 교체한다.

기존 (line 9):

```typescript
import { fetchMyDisplayName } from "@/lib/db/reads/me";
```

변경 후:

```typescript
import { fetchMyDisplayName, hasEverCreatedChallenge } from "@/lib/db/reads/me";
```

- [ ] **Step 3.2: 빈 상태 카피 분기 변수 추가**

`page.tsx` 의 `const hasAnyChallenge = groups.some((g) => g.challenge !== null);` (line 71) 직후에 아래 두 줄을 추가한다.

```typescript
// 빈 상태 카피 분기 — spec C1 단락 평가로 진행 중 챌린지가 있는 사용자에겐 호출 안 함.
const hasEverCreated = hasAnyChallenge ? false : await hasEverCreatedChallenge(user.id);
const emptyDescription = hasEverCreated
  ? "친구들과 함께 챌린지를 만들어보세요"
  : "친구들과 함께 첫 챌린지를 만들어보세요";
```

- [ ] **Step 3.3: EmptyState description prop 교체**

빈 상태 분기 안의 `EmptyState` (현재 line 85-98) 의 `description` 라인 한 줄을 교체한다.

기존 (line 88):

```tsx
description = "친구들과 함께 첫 챌린지를 만들어보세요";
```

변경 후:

```tsx
description = { emptyDescription };
```

- [ ] **Step 3.4: typecheck + lint**

Run: `pnpm typecheck`

Expected: 통과.

Run: `pnpm lint`

Expected: 통과.

- [ ] **Step 3.5: 전체 vitest 실행 (회귀 확인)**

Run: `pnpm test`

Expected: 전체 통과. `page.tsx` 자체의 단위 테스트는 없으나(RSC 라 컨벤션상 단위 미작성), 기존 spec/test 전체가 깨지지 않았는지 확인.

---

## Task 4: 수동 검증 (모바일 viewport)

**Files:** 변경 없음 (검증만)

- [ ] **Step 4.1: 개발 서버 기동**

Run: `pnpm dev`

브라우저에서 `http://localhost:3000` 접속, Chrome DevTools 의 Device Toolbar 로 **iPhone 14 Pro (390 × 844)** 또는 모바일 viewport 활성화.

- [ ] **Step 4.2: 시나리오 S1 — 신규 사용자**

새 계정(혹은 그룹/챌린지 0건의 기존 계정)으로 로그인 후 홈(`/home`) 진입.

Expected: EmptyState `"아직 진행 중인 챌린지가 없어요"` + `"친구들과 함께 첫 챌린지를 만들어보세요"` (「**첫**」 노출).

- [ ] **Step 4.3: 시나리오 S2 — 그룹만 있고 챌린지 없는 사용자**

그룹 한 곳을 만들고 챌린지는 아직 생성하지 않은 상태로 홈 진입.

Expected: EmptyState 동일. `"... 첫 챌린지를 ..."` (그룹 owner 이지만 challenge row 0건).

- [ ] **Step 4.4: 시나리오 S3 — 챌린지 완주 후 빈 상태**

같은 그룹에서 챌린지 1개를 만들어 `endChallenge` 로 closed 처리 후 홈 진입.

Expected: EmptyState `"친구들과 함께 챌린지를 만들어보세요"` (returning — 「**첫**」 사라짐).

- [ ] **Step 4.5: 시나리오 S7 — 진행 중 챌린지가 있을 때 호출 자체가 안 일어남**

진행 중(active) 챌린지가 있는 상태로 홈 진입.

Expected: EmptyState 가 아예 렌더되지 않음. RSC 서버 로그 / DevTools Network 에서 `groups?owner_id=...` 추가 쿼리가 호출되지 않아야 함 (단락 평가 확인).

- [ ] **Step 4.6: 시나리오 S4 — deleteChallenge 트레이드오프**

챌린지 1개를 만든 직후 `deleteChallenge` 로 즉시 삭제, 홈 진입.

Expected: EmptyState `"... 첫 챌린지를 ..."` 다시 노출. **C1-Known-False-Negatives #1 — 의도된 동작**. spec 의 trade-off 라벨과 일치하는지 확인. dogfood 로그용 메모.

---

## Task 5: spec status 업데이트 + 최종 커밋

**Files:**

- Modify: `docs/superpowers/specs/2026-05-22-home-empty-state-returning-user.md` (frontmatter line 6)

- [ ] **Step 5.1: spec frontmatter status 갱신**

spec 파일 첫 7줄의 frontmatter 중 `status: draft` 한 줄을 `status: accepted` 로 변경.

기존:

```yaml
---
spec: 2026-05-22-home-empty-state-returning-user
title: Home Empty State Returning User
author: pistachio8
date: 2026-05-22
status: draft
---
```

변경 후:

```yaml
---
spec: 2026-05-22-home-empty-state-returning-user
title: Home Empty State Returning User
author: pistachio8
date: 2026-05-22
status: accepted
---
```

- [ ] **Step 5.2: 문서 링크 검증**

Run: `pnpm validate:docs`

Expected: 통과 (spec ↔ plan 상호 링크 깨짐 없음).

- [ ] **Step 5.3: page.tsx · spec 커밋**

```bash
git add src/app/(app)/home/page.tsx docs/superpowers/specs/2026-05-22-home-empty-state-returning-user.md
git commit -m "feat(home): EmptyState returning-user 카피 분기 적용

진행 중 챌린지가 없을 때, 본 사용자가 owner 인 그룹의 challenge
row 가 1건+ 있으면 \"친구들과 함께 챌린지를 만들어보세요\"
(「첫」 제거) 를 노출. 단락 평가로 진행 중 챌린지가 있는
사용자에겐 hasEverCreatedChallenge 호출 자체가 안 일어남.

spec status: draft -> accepted.
ref: docs/superpowers/specs/2026-05-22-home-empty-state-returning-user.md"
```

---

## Task 6: PR 준비

**Files:** 변경 없음

- [ ] **Step 6.1: 베이스(develop) 와 동기화 확인**

Run: `git fetch origin develop && git log --oneline HEAD ^origin/develop | head -10`

Expected: 본 plan 의 commit 2개만 표시되어야 한다 (Task 2 의 feat + Task 5 의 feat).

- [ ] **Step 6.2: 최종 검증 일괄**

Run: `pnpm typecheck && pnpm lint && pnpm test`

Expected: 3 단계 모두 통과.

- [ ] **Step 6.3: PR 생성 (사용자 확인 후)**

PR 베이스는 `develop`. plan template (`.github/pull_request_template.md`) 이 자동 prefill 됨. `git` 계정이 `pistachio8` 인지 확인 후 **사용자 승인** 받아 push & PR 생성.

```bash
git push -u origin feat/home-empty-state-returning-user
gh pr create --base develop --title "feat(home): EmptyState returning-user 카피 분기" --body "$(cat <<'EOF'
## Summary

- 홈 EmptyState description 을 "내가 owner 인 그룹에 challenge row 1건+ 존재" 사용자에게는 "친구들과 함께 챌린지를 만들어보세요" (「첫」 제거) 로 분기
- 진행 중 챌린지가 있는 사용자에게는 추가 쿼리 호출 자체가 일어나지 않음 (단락 평가)

## Spec or ADR

- [docs/superpowers/specs/2026-05-22-home-empty-state-returning-user.md](docs/superpowers/specs/2026-05-22-home-empty-state-returning-user.md) — status: accepted

## 가드레일 체크

- [x] zod / 타입 SoT 영향 없음
- [x] Server Action / RSC 경계 유지 (RSC 안에서 read 함수 호출)
- [x] Supabase migration / RLS 변경 없음
- [x] useEffect + fetch 쓰기 경로 / SWR 미도입

## Verification

### Unit

- [x] pnpm test -- src/lib/db/reads/me.spec.ts — 5 case 통과

### 수동 (모바일 viewport)

- [x] S1 신규 사용자 → 「첫」 노출
- [x] S2 그룹만 있고 챌린지 없음 → 「첫」 노출
- [x] S3 챌린지 closed 후 빈 상태 → 「첫」 사라짐
- [x] S7 진행 중 챌린지 보유 → EmptyState 미렌더, 추가 쿼리 미호출
- [x] S4 deleteChallenge 후 빈 상태 → 「첫」 다시 (의도된 trade-off)

## Rollback

page.tsx 의 ternary 와 me.ts 함수 추가만 되돌리면 됨. 1 commit revert.

EOF
)"
```

---

## 검증 (전체)

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:docs
pnpm dev   # 모바일 viewport 수동 시나리오 S1·S2·S3·S4·S7
```

수동 확인 항목:

- [ ] 모바일 viewport 에서 S1·S2·S3·S7 통과
- [ ] S4 트레이드오프(deleteChallenge 후 「첫」 다시 노출) 가 spec 예상과 일치
- [ ] 진행 중 챌린지가 있는 사용자에 대해 `groups` 추가 쿼리 미발생 (DevTools Network 또는 서버 로그)

---

## 리스크 / 미해결

- **trade-off S4·S5 (deleteChallenge 후 「첫」 재노출)**: spec 에서 의도된 동작으로 수용. dogfood Week 2 신호에 따라 Alt-B(`users` 캐시 컬럼) 또는 Alt-E(`events.challenge_created` SoT) 승격을 별도 ADR 로 논의.
- **`page.tsx` 단위 테스트 부재**: RSC + supabase 호출이라 unit 작성이 무거움. Task 4 수동 시나리오로 대체. 핵심 로직(`readHasEverCreatedChallenge`) 은 unit 으로 검증.
- **scaffold 날짜 (`2026-05-22`)**: KST 기준 21일이지만 scaffold 가 UTC 로 22일을 붙임. spec 파일과 plan 파일 모두 22 로 통일되어 일관성은 유지. rename 이 필요하면 spec ↔ plan 두 파일을 함께.
