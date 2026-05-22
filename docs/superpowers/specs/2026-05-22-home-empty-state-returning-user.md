---
spec: 2026-05-22-home-empty-state-returning-user
title: Home Empty State Returning User
author: pistachio8
date: 2026-05-22
status: accepted
---

## Summary

홈 화면에서 진행 중인 챌린지가 0건일 때 노출되는 EmptyState의 description 카피를, "챌린지를 한 번이라도 만들어본 사용자"와 "한 번도 만들어본 적 없는 사용자"로 분기한다.

현재는 두 코호트 모두에게 `"친구들과 함께 첫 챌린지를 만들어보세요"` 를 노출하는데, returning user에게 **"첫"** 이라는 한정어가 사실과 어긋난다. returning user에게는 `"친구들과 함께 챌린지를 만들어보세요"` (단순히 "첫"만 제거) 를 노출한다.

판정 기준은 **"현재 시점에 내가 owner인 그룹의 `challenges` 테이블에 row가 1건 이상 존재하는가"** 이다. 즉 **row 존재 기반**(state-based)이지 이벤트 이력 기반(event-based)이 아니다. status 필터는 적용하지 않아 `pending`/`accepted`/`active`/`closed` 어느 상태든 카운트한다.

이 정의의 알려진 trade-off는 본문 §Design "C1 — Known False Negatives" 와 §Alternatives Considered "Alt-E" 에 정리한다.

## Why

- 현재 EmptyState 카피 `"친구들과 함께 첫 챌린지를 만들어보세요"` — 챌린지를 한 차례 마무리하거나 다시 빈 상태로 돌아온 사용자에게도 "첫"이 그대로 노출되어 사실과 맞지 않는다.
- POC dogfood 기간 중 챌린지 라이프사이클 한 바퀴를 도는 사용자가 늘어남에 따라(같은 그룹에서 챌린지 closed → 다음 챌린지 생성 전 빈 상태), 이 위화감이 실제 노출 빈도를 갖는다.
- 카피 분기 자체는 single ternary로 매우 작지만, 분기 신호를 어디서 어떻게 얻을지 — `challenges` 테이블에 `created_by`/`host_id` 컬럼이 없고, `deleteChallenge`가 row를 hard delete하며, `events.challenge_created` 는 분석 테이블이라 SoT 신뢰성이 낮다 — 가 비자명하다. 트레이드오프를 spec으로 합의한다.
- 머지 후 동일 분기를 다른 카피(예: 챌린지 새로 만들기 CTA 카피, 권유 알림 카피)에서도 재사용할 가능성이 있어, 판정 기준의 SoT(Single Source of Truth)를 한 곳에 둔다.

## Impact Scope

### 변경 경로

- 신규:
  - 본 spec — `docs/superpowers/specs/2026-05-22-home-empty-state-returning-user.md`
- 수정:
  - `src/lib/db/reads/me.ts` — `hasEverCreatedChallenge(userId): Promise<boolean>` 추가
  - `src/app/(app)/home/page.tsx` — 빈 상태 분기 안에서 추가 fetch + description ternary
- 신규 테스트:
  - `src/lib/db/reads/me.spec.ts` (신설) — `hasEverCreatedChallenge` 단위 테스트

### src/ 영향

- `src/lib/db/reads/me.ts` — 함수 추가만, 기존 `fetchMyDisplayName` 동작 영향 없음
- `src/app/(app)/home/page.tsx` — 빈 상태 분기에서만 1 추가 호출(최대 2 supabase 쿼리), `hasAnyChallenge === true` 경로는 변경 없음

### Supabase / RLS / migration 영향

- migration 없음.
- RLS 변경 없음 — `groups_select_member`(`is_group_member(id)` 체크) + `challenges_select_member` (`is_group_member(group_id)` 체크). owner는 그룹 생성 시 `create_group_with_owner` RPC(0017)가 `group_members`에 `role='owner'` row를 자동 INSERT하므로 항상 멤버이며, app 코드에 owner self-leave 흐름이 없어(`leaveChallenge`는 챌린지 한정, group leave 액션 없음) RLS는 정상 통과.

### 외부 서비스

없음.

## Design

### C1. 판정 함수 — `hasEverCreatedChallenge`

위치: `src/lib/db/reads/me.ts`.

시그니처:

```ts
// src/lib/db/reads/me.ts
export async function hasEverCreatedChallenge(userId: string): Promise<boolean>;
```

정의: **이 사용자가 owner인 그룹**(`groups.owner_id = userId`) 중 한 곳에서 challenge row가 1건 이상 **현재 시점에 존재**하면 `true`. 어느 status든 카운트한다.

판정 알고리즘 (2 쿼리, EXISTS 형태):

```ts
// 1) 내가 owner인 그룹 id 목록.
const { data: ownedGroups, error: groupsErr } = await supabase
  .from("groups")
  .select("id")
  .eq("owner_id", userId);

if (groupsErr) return false; // fail-safe: §C1-Error 참조
if (!ownedGroups || ownedGroups.length === 0) return false;

// 2) 그 그룹들에서 challenge row 1건이라도 있는지.
const { data: anyChallenge, error: chErr } = await supabase
  .from("challenges")
  .select("id")
  .in(
    "group_id",
    ownedGroups.map((g) => g.id),
  )
  .limit(1);

if (chErr) return false;
return (anyChallenge?.length ?? 0) > 0;
```

설계 결정 — 왜:

- **status 필터 없음**: 사용자 표현 "한번이라도 생성한 기록"의 사실적 해석은 "row가 INSERT되어 현재까지 남아있음". `endChallenge`(`closed`)도 row가 남으므로 자연스럽게 카운트된다.
- **`disbanded_at` 필터 없음, 그러나 사실상 무관**: `0030_groups_owner_delete_policy` 이후 그룹 해체는 **hard delete** (challenge 0건 + member 1건 조건). `disbanded_at` 컬럼은 코드 5곳에서 읽기 필터로만 쓰이고 update path가 없다(deprecated 방향). 그룹이 사라지면 `ownedGroups` 자체가 비어 자연스럽게 false → 의도와 일치.
- **owner 양도 가정 없음**: `groups` UPDATE RLS의 `with check`가 `owner_id = auth.uid()` 라서 양도 불가능 = `owner_id`는 사실상 immutable. 단순 동치 비교로 충분.
- **2-step 쿼리**: nested filter (`groups!inner(owner_id)`) 보다 직관성이 높고, owner 그룹 0건일 때 두 번째 쿼리를 skip해 round-trip 절약.
- **`select("id").limit(1)`** (EXISTS 패턴): `count: "exact"` + `head: true` 조합은 전체 카운트를 계산해 `.limit(1)` 이 무의미. EXISTS-style limit(1) 이 PostgreSQL 의미와 일치하고 비용도 낮다.

### C1 — Error 핸들링 (fail-safe 방향)

supabase 에러(네트워크/RLS 충돌 등) 발생 시 `false` 반환 → "**첫** 챌린지를 만들어보세요" 카피 노출. 이는 returning user에게 잘못된 카피를 줄 수는 있으나 신규 사용자에겐 정상 카피라 **invariant-safe**. 카피는 행동 변화를 일으키지 않는 부수 정보(CTA 동작 동일)라서 throw로 페이지 전체를 깨는 것보다 silent fail이 적절. console.error 로 관찰성은 확보.

### C1 — Known False Negatives (의도된 트레이드오프)

다음 세 경우는 사용자가 "만든 적 있다"고 인지하지만 본 구현은 `false`를 반환해 "**첫**" 카피가 다시 노출된다. 본 spec은 이 동작을 **수용** 한다.

1. **챌린지를 만들고 deleteChallenge로 지운 경우** — `src/app/(app)/challenge/[id]/_actions.ts:288-300` 의 `deleteChallenge` 는 admin client로 row를 hard delete한다. row가 없으면 카운트도 0.
2. **챌린지를 만들고 deleteChallenge → deleteGroup으로 그룹까지 정리한 경우** — `deleteGroup` (`src/app/(app)/group/[id]/_actions.ts:85-`) 는 challenge 0건 + member 1건 조건일 때 groups row를 hard delete. owned group 자체가 사라지므로 false.
3. **사용자가 자기 그룹을 만들지 않고 친구 그룹의 챌린지에 참여만 한 경우** — 본 spec은 "owner = 생성자" 정의를 채택했으므로 의도된 동작(grilling Q1 참조). "첫 챌린지를 만들어보세요"가 본인 입장에서는 사실.

trade-off 수용 근거:

- `deleteChallenge` 는 사용자의 **명시적** 의사("이 챌린지를 없던 일로 한다"). 카운트에서 빠지는 것이 의미상 일관적인 측면도 있다.
- `events.challenge_created` 를 SoT로 쓰면 row hard delete에 면역이지만 events SELECT는 RLS상 service_role 전용이라 `adminClient` 가 필요 → 보안 표면 ↑. `track()` 호출이 `void track(...)` fire-and-forget이라 lossy(누락 가능).
- POC dogfood에서 노출 빈도가 잡히면 그때 Alt-B(캐시 컬럼) 또는 Alt-E(events SoT)로 승격.

### C2. page.tsx 분기

위치: `src/app/(app)/home/page.tsx`.

빈 상태 진입 시(즉 `!hasAnyChallenge`)에만 `hasEverCreatedChallenge`를 호출하고, description prop을 ternary로 분기.

```tsx
// src/app/(app)/home/page.tsx — 빈 상태 분기 발췌
const hasEverCreated = hasAnyChallenge ? false : await hasEverCreatedChallenge(user.id);
const emptyDescription = hasEverCreated
  ? "친구들과 함께 챌린지를 만들어보세요"
  : "친구들과 함께 첫 챌린지를 만들어보세요";

// ... 기존 JSX 의 EmptyState description prop 에 emptyDescription 사용
```

`hasAnyChallenge ? false : await ...` 단락 평가로 진행 중 챌린지가 있는 사용자에게는 두 번째 쿼리가 절대 실행되지 않게 한다.

설계 결정 — 왜:

- **fetch는 빈 상태에서만**: 진행 중 챌린지가 있는 사용자는 EmptyState가 렌더되지 않아 데이터가 절대 쓰이지 않는다. 분기 외부 `Promise.all`에 끼우는 건 불필요한 round-trip.
- **단일 ternary로 인라인**: 카피 두 줄 분기에 헬퍼 함수를 만들지 않는다 — Karpathy §2 단순함.
- **title / CTA 카피 변경 없음**: title `"아직 진행 중인 챌린지가 없어요"` 는 "진행 중인"이라는 한정어로 이미 양 코호트 모두에 자연스럽다. CTA `"챌린지 만들기"` 도 동일.
- **AnalyticsEvent 추가 없음**: 카피 변형 노출 자체는 별도 이벤트가 아니다. PRD §9.1 이벤트 표 1:1 원칙을 유지.

### 인접 시스템 정보 (참고)

- **`0029_one_active_challenge_per_group`**: `challenges_one_open_per_group` partial unique index 가 그룹당 `pending`|`accepted`|`active` 1개만 허용. 본 spec의 카운트에는 영향 없음(우리는 EXISTS만 보고 status 무관). 다만 사용자가 pending 챌린지를 정리 안 하면 같은 그룹에서 새 챌린지 생성 자체가 막힘(sqlstate 23505 → "conflict") — 이건 별개 흐름.
- **pending 자동 expire 없음**: 시스템에 pending 챌린지를 timeout으로 자동 만료/삭제하는 메커니즘은 없다. 사용자가 `sign_and_maybe_activate` 로 전원 sign 완료(→active) 하거나 `deleteChallenge` 로 명시적으로 지우거나 둘 중 하나. pending에 머문 상태로 빈 상태에 진입할 수 없다.

## Alternatives Considered

### Alt-A. 판정 기준을 "참여한 적 있음"(`challenge_participants`에 row 존재)으로 정의

- 친구가 만든 챌린지에 sign만 한 사용자도 "첫" 제외 대상이 되어, UX 의도("이미 챌린지를 해본 사람")에 가깝다.
- 채택하지 않은 이유: 사용자가 "**생성**"이라는 단어를 명시했고, 카피 주어 "만들어보세요"의 행위 주체와 일치하지 않는다. 참여만 한 사람에겐 그 빈 상태가 진짜로 "본인의 첫 챌린지 생성"이라 "첫" 노출이 옳다.

### Alt-B. `users` 테이블에 `challenges_created_count` 캐시 컬럼 추가

- 매번 쿼리 없이 즉시 판정 가능. row hard delete에 면역 (트리거가 INSERT 시점에만 카운트 증가).
- 채택하지 않은 이유: POC 범위 초과. migration · trigger · 회복 정합성 작업 필요. 현재 쿼리는 인덱스(`groups(owner_id)` 자동, `challenges_one_open_per_group` 0029, `idx_challenges_group_status` 0001) 통한 EXISTS로 ms 단위라 캐시 정당화 어렵다.

### Alt-C. `Promise.all`에 항상 끼워 넣기

- 코드가 단순하고 latency 영향 없음(parallel).
- 채택하지 않은 이유: 진행 중 챌린지가 있는 사용자에겐 이 데이터가 절대 쓰이지 않는다. 불필요한 supabase round-trip. POC라도 "필요할 때만 가져온다" 원칙 유지.

### Alt-D. 카피 전면 재작성 — `"다시 챌린지를 만들어보세요"` 등

- "친구들과 함께"를 빼면 returning user에게 더 자연스러울 수 있다(그룹은 이미 있을 가능성이 높으니까).
- 채택하지 않은 이유: 사용자가 "**'첫'이라는 단어를 제외**"라고 명시했다. 최소 변경 원칙(Karpathy §3 외과적 수정)을 따른다.

### Alt-E. `events.challenge_created` 이벤트 이력을 SoT로 사용

- `events` 테이블의 `name = 'challenge_created' AND user_id = me` 로 카운트하면 challenge row hard delete에 면역. C1-Known-False-Negatives 1·2번이 해소.
- 채택하지 않은 이유:
  1. `events` 테이블 SELECT는 RLS상 service_role 전용 (0002_rls.sql:231) → RSC에서 `adminClient()` 호출이 필요해 **보안 표면 증가**. 도메인 결정에 service_role 사용은 부적절.
  2. `src/lib/analytics/track.ts:111` 의 `void track(...)` 호출은 **fire-and-forget** 이라 누락 가능 (네트워크/스키마 에러 시 console.error만 남고 row 미삽입). 분석 테이블의 신뢰성을 도메인 SoT 수준으로 가정하기 어렵다.
  3. PRD §9.1 이벤트 표를 도메인 의사결정에 결합하면 이벤트 스키마 변경이 도메인 로직을 깨는 결합 발생.
- dogfood에서 "챌린지 만들고 지운 사용자에게 '첫'이 다시 노출되어 거슬렸다"는 신호가 잡히면 그때 Alt-B(캐시 컬럼, ADR 동반)로 승격을 우선 검토.

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test -- src/lib/db/reads/me.spec.ts
pnpm test
pnpm dev   # 모바일 viewport(375x812) 수동 확인
```

### 시나리오

#### 단위 — `hasEverCreatedChallenge`

1. **owner인 그룹이 0건** → `false` 반환. 두 번째 쿼리는 호출되지 않아야 한다(`ownedGroups.length === 0` 가드).
2. **owner인 그룹은 있지만 challenge row 0건** → `false`.
3. **owner인 그룹에서 challenge 1건+** (status `pending` 1건만 있어도) → `true`.
4. **첫 번째 쿼리 에러** → `false` (fail-safe).
5. **두 번째 쿼리 에러** → `false` (fail-safe).

#### 통합 — 홈 빈 상태 카피 분기 (수동)

S1. 신규 가입 직후 사용자(그룹 0개) → 홈 빈 상태에 `"친구들과 함께 첫 챌린지를 만들어보세요"`.

S2. 그룹은 만들었지만 챌린지를 아직 한 번도 안 만든 사용자 → `"... 첫 챌린지를 ..."` (그룹 owner이긴 하지만 challenge 0건).

S3. 챌린지를 만들어 closed까지 완주 → 같은 그룹에서 빈 상태로 돌아옴 → `"친구들과 함께 챌린지를 만들어보세요"`.

S4 (트레이드오프). 챌린지를 만들었다가 `deleteChallenge` 로 지움 → `challenges` row 없음 → `false` → `"... 첫 챌린지를 ..."` 다시 노출. **C1-Known-False-Negatives #1 — 의도된 동작**.

S5 (트레이드오프). 챌린지 `deleteChallenge` 후 그룹까지 `deleteGroup` → `ownedGroups` 0건 → `false` → `"... 첫 챌린지를 ..."`. **C1-Known-False-Negatives #2 — 의도된 동작**.

S6. 친구가 만든 챌린지에 sign만 했고 본인은 어떤 그룹의 owner도 아님 → 본인이 owner인 그룹 0건 → `false` → `"... 첫 챌린지를 ..."` (Alt-A 거절 근거와 일관).

S7. 진행 중 챌린지 1건+ 보유 → EmptyState 자체가 렌더되지 않음. `hasEverCreatedChallenge` 호출되지 않아야 한다(단락 평가 검증 — 통합 테스트 또는 서버 로그로 확인).

## Rollout

1. 본 spec 머지.
2. 구현 PR — read 함수 + unit test + page.tsx 분기 + 본 spec status를 `accepted` 로 업데이트, 단일 commit.
3. dogfood Week 2 중 빈 상태 진입 사용자 대상 수동 확인 — 특히 S4/S5 시나리오의 노출 빈도와 위화감 청취.
4. dogfood 신호에 따라 Alt-B(캐시 컬럼) 또는 Alt-E(events SoT) 승격을 별도 ADR로 논의.
5. 별도 데이터 수집/이벤트 없음 — 카피 미세 변경이고 운영 지표 영향 없는 것이 의도.

### 롤백

`page.tsx` 의 ternary 한 줄과 `me.ts` 함수 추가만 되돌리면 됨. 1 commit revert. spec 자체는 history로 남김.

## Out of scope

- **deleteChallenge로 지운 row의 이력 추적** — C1-Known-False-Negatives #1, Alt-E 참조. dogfood 신호 후 별도 ADR.
- **챌린지 라이프사이클 E2E 테스트** — 별도 후속 이슈로 분리. 본 PR은 unit + 수동 검증.
- **카피 i18n / 다국어** — 현재 앱이 한국어 단일 언어라 SoT 분리 불필요.
- **`users` 테이블에 행위 이력 캐시 컬럼 추가** — Alt-B 참조. 운영 신호 후 재논의.
- **다른 EmptyState 분기(`me/challenges` 페이지 등)** — 본 spec 범위는 홈(`src/app/(app)/home/page.tsx`) 한 곳에 한정.
- **AnalyticsEvent 추가** — PRD §9.1 변경 없음.

## 용어집

- **EmptyState**: 빈 상태 UI 컴포넌트(`src/components/ui/empty-state.tsx`) — 아이콘·title·description·action 4 prop 구조.
- **EXISTS 패턴**: SQL의 `EXISTS (SELECT 1 ... LIMIT 1)` 와 의미가 같은 supabase-js 표현. `.select("id").limit(1)` 로 1건 존재 여부만 확인.
- **fail-safe**: 에러 발생 시 안전한 기본값으로 떨어뜨려 페이지 전체가 깨지지 않게 하는 방식. 본 spec에서는 supabase 에러 시 `false` 반환 = 신규 사용자 카피 노출.
- **fire-and-forget**: 호출 결과를 기다리지 않는 비동기 호출. `void track(...)` 처럼 promise를 await 하지 않아 실패해도 호출자에게 영향 없음. 단 누락 가능.
- **hard delete**: 데이터베이스에서 row 자체를 물리적으로 삭제. soft delete(컬럼 표시만)와 대비.
- **owner**: `groups.owner_id` 가 가리키는 그룹의 단일 소유자. RLS UPDATE 정책상 양도 불가능(immutable).
- **returning user**: 본 spec에서 "현재 시점에 내가 owner인 그룹의 `challenges` 테이블에 row가 1건 이상 존재하는 사용자".
- **RLS(Row Level Security)**: Postgres 행 단위 접근 제어. Supabase에서 모든 테이블 ON.
- **RPC(Remote Procedure Call)**: 본 문서에서는 Supabase Postgres 함수(`public.create_challenge` 등) 호출.
- **SoT(Single Source of Truth)**: 중복 정의 없이 한 곳을 기준으로 삼는 원본. 본 spec에서는 "생성 여부 판정"의 SoT를 `challenges` row 존재로 채택.
