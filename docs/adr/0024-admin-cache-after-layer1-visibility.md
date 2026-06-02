# ADR-0024: Layer 1 visibility 통과 후 hydrate read 는 `adminClient()` + public `"use cache"` 를 쓴다 (ADR-0021 일부 보완)

**Date**: 2026-05-28
**Status**: accepted
**Deciders**: pistachio8
**Supplements (in part)**: [ADR-0021](0021-private-cache-inline-pattern.md) — inline `"use cache: private"` 패턴은 그대로 유효하되, **hydrate 단계 read 에 한해** admin + public `"use cache"` 예외를 신설한다. ADR-0019 의 "service-role 결과는 user-facing cache 에 저장 금지" 원칙을 본 ADR 의 contract 범위로 좁힌다.

## Context

`/challenge/[id]/dashboard` 진입(특히 PWA cold start · BG/FG 토글) 시 피드 이미지가 미표시되는 회귀가 보고됐다. Vercel 로그(2026-05-28 00:53, 01:25)에서 `POST /auth/v1/token ×22 → 429 (over_request_rate_limit)`, 직후 `POST /storage/v1/object/sign/... → 400` 패턴이 반복됐다.

근본 원인은 **한 RSC 요청 안에서 hydrate 단계의 `"use cache: private"` 자식 read 들이 viewer 별 N×4개 supabase server client 를 동시 생성**하고, 그 client 들이 동시에 `/auth/v1/token` 을 호출 → Supabase Auth IP rate limit (429) → 후속 storage `createSignedUrl` 400 → `photoSignedUrl = null` 로 떨어지는 자가-증식 폭발 루프다.

- `src/lib/db/reads/challenge-feed.ts` — 피드 N개 아이템을 `Promise.all` 로 병렬 처리, 각 아이템 안에서 다시 photo/counts/viewer-kudos 를 `Promise.all`.
- `src/lib/db/reads/{photo-signed-url,action-log-hydrate,kudos-counts,kudos-viewer}.ts` — 모두 `"use cache: private"` 안에서 `await createClient()` 로 새 supabase server client 생성. supabase-js 가 첫 호출 시 cookie 의 access_token 을 validation/refresh 하며 token endpoint 를 호출.
- `src/lib/supabase/middleware.ts` 의 `auth.getUser()` 가 매 요청 token refresh → `sb-*` cookie rewrite → `"use cache: private"` 의 implicit cookie 의존 key 가 매번 달라짐 → **항상 cache miss → 매번 N×4 client 폭발 재발**. BG/FG 즉시 토글에서도 재현되는 이유다.

`kudos-counts.ts` 주석이 제약을 정확히 적어뒀다 — public `"use cache"` 는 `cookies()` 호출을 금지(cacheComponents throw)하므로, RLS 가 필요한 read 는 private cache 로 둘 수밖에 없었다. **즉 admin 전환 = cookies 의존 제거 = public `"use cache"` 가능** 이 fix 의 핵심이다.

### RLS gate 전제 (admin read 안전성의 근거)

`supabase/migrations/0002_rls.sql` 에 다음 SELECT 정책이 존재한다.

```sql
create policy al_select_member on public.action_logs
  for select using (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_id and public.is_group_member(c.group_id)
    )
  );

create policy kudos_select_member on public.kudos
  for select using (
    exists (
      select 1 from public.action_logs a
      join public.challenges c on c.id = a.challenge_id
      where a.id = action_log_id and public.is_group_member(c.group_id)
    )
  );
```

Layer 1(`listVisibleActionLogIds`)은 RLS 적용 user client 로 `action_logs` 를 select 하므로 `al_select_member` 가 비멤버에게 빈 ID 리스트를 반환한다. **admin hydrate read 의 안전성은 이 사실(layer 1 이 비멤버 ID 를 걸러줌)에 전적으로 의존한다.**

### Next.js cache key 규칙 (viewer-agnostic 공유의 전제)

Next.js 16.2.6 공식 문서(`node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md` §Cache keys)를 재확인했다.

> A cache entry's key is generated using a serialized version of its inputs: Build ID, Function ID, **Serializable arguments**, and **variables referenced from outer scopes (automatically captured and bound as arguments)**.

따라서 public cached inner 함수가 `viewerId` 를 인자(또는 closure 캡처)로 받으면 tag 를 viewer-agnostic 으로 바꿔도 **cache entry 가 viewer 별로 갈라져 cross-viewer 공유가 일어나지 않는다.** viewer-agnostic 데이터는 cached inner signature 에서 `viewerId` 를 반드시 제거해야 한다. 같은 문서 §Good to know — public `"use cache"` 는 cookies/headers 를 cached scope **내부**에서 읽을 수 없고, 밖에서 읽어 인자로 넘겨야 한다.

## Decision

**Layer 1(`listVisibleActionLogIds` 같은 RLS visibility decision)을 통과한 ID 에 대해서만 호출되는 hydrate 단계 read 는 `adminClient()` + public `"use cache"` 를 사용한다.** 세부 규칙:

- **viewer-agnostic hydrate read** (`getActionLogHydrate` · `getActionLogPhotoSignedUrl` · `getKudosCountsForLog`): cached inner 함수는 `viewerId` 를 **인자로 받지 않는다**. cache key 는 `actionLogId` / `photoPath` 만으로 구성되어 모든 viewer 가 동일 entry 를 공유한다. exported wrapper signature 의 `viewerId`(있다면)는 호출처 호환을 위해 유지하되 cached inner 로 전달하지 않는다.
- **viewer-specific read** (`getViewerKudosForLog`): public `"use cache"` 를 쓰더라도 viewer 별 데이터다. `viewerId` 를 (a) cached function argument, (b) `cacheTag('user-${viewerId}-kudos-${actionLogId}')`, (c) `.eq('user_id', viewerId)` SQL filter **세 곳 모두**에 포함한다. cache partition 의 주 장치는 function argument 이고, tag 는 invalidation 용도, SQL filter 는 admin 전환 후 leak 의 유일한 방어선이다.
- **admin read 는 authorization gate 가 아니다.** `adminClient()` 는 RLS 를 우회하므로 단독 호출 시 비멤버 데이터/ signed URL 이 노출될 수 있다. 따라서 이 read 들의 production callsite 는 `src/lib/db/reads/challenge-feed.ts`(layer 1 이후) 로 제한한다. 임의 RSC/route 에서 직접 import 하는 것은 본 ADR 위반으로 다루며, PR 검증에 callsite audit(`rg`)을 포함한다.
- **접근 제어는 (a) layer 1 호출 경계와 (b) viewer-specific SQL filter 로만** 판단한다. public cache tag 는 접근 제어 수단이 아니다.
- layer 1(`listVisibleActionLogIds` · `getVisibilityVersion`)은 RLS gate 이므로 user client + `"use cache: private"` 를 **그대로 유지**한다. 본 ADR 은 hydrate 단계만 admin 으로 전환한다.

## Alternatives Considered

### 1. `createClient()` 자체를 `React.cache` 로 dedup 해 client 폭발만 줄인다

- **Pros**: read 의 RLS 보호를 그대로 유지. admin 전환 없이 token POST 수만 감소.
- **Cons**: `"use cache: private"` 함수는 자체 캐시 scope 라 outer `React.cache` client 를 closure 캡처할 수 없다(직렬화 불가, ADR-0021). 또 cookie thrash 로 매 요청 cache miss 는 그대로라 근본 원인(implicit cookie key) 미해결.
- **Why not**: private cache + cookie 의존이 남는 한 BG/FG 토글 재현이 반복된다. token endpoint 의존 자체를 끊어야 한다.

### 2. middleware 의 cookie rewrite/`getUser` 를 손봐 cache key 안정화

- **Pros**: private cache 를 유지하면서 cache hit 율을 올릴 수 있음.
- **Cons**: 인증 백본(`middleware.ts`)을 건드리는 고위험 변경. ADR-0022/0023 의 auth 표준화 라인과 충돌 가능. POC 범위 초과.
- **Why not**: 본 plan scope 밖. hydrate read 의 admin 전환이 더 작고 외과적이다.

### 3. service-role 결과 캐시 전면 금지(ADR-0019 원칙)를 그대로 유지

- **Pros**: viewer boundary 오염 위험 0. 단순.
- **Cons**: 폭발 원인을 못 고친다. ADR-0019 의 금지 근거(RLS 우회 결과 캐시 → viewer 오염)는 "캐시가 곧 접근 제어"일 때 성립하는데, 본 설계는 접근 제어를 layer 1 + SQL filter 로 분리하므로 그 위험이 해소된다.
- **Why not**: 금지의 전제가 본 설계에선 성립하지 않는다. 그래서 ADR-0019 원칙을 폐기하지 않고 "layer 1 이후 hydrate" 범위로 좁히는 예외를 둔다.

## Consequences

### 긍정적

- hydrate 자식 read 4종에서 `/auth/v1/token` POST 0회 → dashboard 진입당 token POST 22+ → ≤3~4회(layer 1 계층 잔여)로 감소. 429 카스케이드 해소 → signed URL 정상화 → 피드 이미지 표시 복구.
- viewer-agnostic hydrate/photo/counts 는 cross-viewer 로 server cache 를 실제 공유(이전엔 viewerId 가 key 에 섞여 viewer 별 중복 캐시).
- `fetchChallengeDetail`(ADR-0023 후속 변경으로 error throw) 의 token 압력도 함께 줄어 detail 단계 페이지 크래시 위험 감소.

### 부정적 / 비용

- admin read 의 안전성이 "layer 1 이 비멤버 ID 를 거른다"는 **런타임 contract 에 의존**한다. 임의 callsite 가 생기면 leak. 가드레일 문서 + callsite audit + 신규 integration leak 회귀 spec 으로 방어한다.
- viewer-agnostic signed URL 공유는 "먼저 생성한 viewer 기준" TTL 을 공유한다. `cacheLife(expire 600)` == signed URL TTL(600s) 이라 두 번째 viewer 가 stale 경계 근처에 받으면 잔여 수명이 짧아질 수 있다(이미지 로드는 수 초라 실무상 무해).
- action-log 본문 편집/삭제 mutation 이 추가되면 `revalidateTag('actionlog-${id}')` 호출처를 빠짐없이 잡아야 한다(현재 POC 엔 해당 mutation 없음 → 자연 OK).

### 후속 영향

- `src/lib/db/reads/{photo-signed-url,action-log-hydrate,kudos-counts,kudos-viewer}.ts` 를 admin + public cache 로 전환(본 PR).
- `AGENTS.md §Cache Components` 의 "service-role 결과 캐시 금지" 조항을 본 ADR contract 로 보강(본 PR).
- `tests/integration/setup.ts` 에 `@/lib/supabase/admin` mock 추가, `tests/integration/test-context.ts` 주석 갱신, `tests/integration/reads/challenge-feed.spec.ts` 에 cross-viewer leak 회귀 케이스 추가(본 PR).
- follow-up: 같은 폭발 패턴이 group detail · home feed 에 잠재. 본 contract 를 그대로 적용 가능하도록 별 plan/PR 로 확장. callsite 정적 검사(CI)도입 검토.
