---
plan: 2026-05-28-dashboard-feed-admin-cache-hydrate
title: Dashboard Feed Admin Cache Hydrate — 토큰 폭발/이미지 미표시 fix
author: pistachio8
date: 2026-05-28
status: draft
---

# Dashboard Feed Admin Cache Hydrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PWA에서 challenge dashboard 진입(특히 cold start · BG/FG 토글) 시 피드 이미지가 미표시되는 회귀를 잡고, 피드 hydrate 단계의 Supabase Auth token endpoint 폭발을 제거한다.

**Architecture:** Layer 1 `listVisibleActionLogIds(challengeId, viewerId)` 는 기존처럼 RLS 적용 user client + `"use cache: private"` 로 visibility decision 을 담당한다. Layer 1이 반환한 ID만 Layer 2/3 hydrate 함수에 넘기며, 이 hydrate 함수들은 request cookies 를 읽지 않는 `adminClient()` + public `"use cache"` 로 전환한다. 단, viewer-agnostic cached inner 함수는 cache key 에 `viewerId` 가 들어가지 않도록 inner signature 에서 제거하고, viewer-specific 함수는 `viewerId` 를 SQL filter · cached function argument · cacheTag 에 모두 포함한다.

**Tech Stack:** Next.js 16.2 Cache Components (`"use cache"` · `"use cache: private"` · `cacheTag` · `cacheLife`) · React 19 RSC · Supabase RLS · Supabase service-role `adminClient()` · Vitest integration tests.

---

## 목표

PWA에서 challenge dashboard 진입(특히 cold start · BG/FG 토글) 시 피드 이미지가 미표시되는 회귀를 잡는다. 근본 원인은 한 RSC 요청 안에서 `"use cache: private"` 자식 read 들이 N×4개 supabase server client 를 동시 생성하고 그 client 들이 동시에 `/auth/v1/token` 을 호출 → Supabase Auth IP rate limit (429) → 후속 storage `createSignedUrl` 400 → `photoSignedUrl = null` 로 떨어지는 자가-증식 폭발 루프. 4개 자식 read 를 `adminClient()` + `"use cache"` (public) 로 전환해 cookies() 의존성과 token endpoint 호출을 제거하고, viewer-agnostic read 는 cached inner 함수의 argument 에서 `viewerId` 를 제거해 viewer 간 server cache 공유가 실제로 일어나게 한다.

## 영향 범위

- 변경 경로:
  - `src/lib/db/reads/photo-signed-url.ts`
  - `src/lib/db/reads/action-log-hydrate.ts`
  - `src/lib/db/reads/kudos-counts.ts`
  - `src/lib/db/reads/kudos-viewer.ts`
  - `src/lib/db/reads/challenge-feed.ts` (주석/contract 갱신)
  - 신규 unit spec — 변경 대상 4개 read 는 현재 단위 spec 이 **없다**(`photo-signed-url` · `action-log-hydrate` · `kudos-counts` · `kudos-viewer` 모두 spec 부재). cacheTag/adminClient 사용을 검증할 신규 unit spec(예: `src/lib/db/reads/dashboard-feed-admin-cache.spec.ts`)을 추가한다.
  - `tests/integration/reads/challenge-feed.spec.ts` (**실재 — 회귀 영향 큼**, 아래 §test harness 충돌 참조)
  - `tests/integration/setup.ts` · `tests/integration/test-context.ts` (**mock harness 재설계 필요** — admin 전환 시 `vi.mock("@/lib/supabase/server")` 가 4개 read 를 더 이상 가로채지 못함)
  - `docs/adr/0024-admin-cache-after-layer1-visibility.md` (신규 ADR — 다음 번호는 0024. **ADR-0021 `private-cache-inline-pattern` 을 부분 보완**: hydrate 단계 read 는 `"use cache: private"` inline 대신 admin + public `"use cache"` 로 전환한다는 예외를 신설)
  - `AGENTS.md` §Cache Components 본문 보강
  - (참고 — 변경 없음) `src/lib/db/reads/list-visible-action-log-ids.ts`: layer 1 RLS gate 로 user client + `"use cache: private"` 그대로 유지.
- 데이터/RLS 영향: 스키마/RLS 변경 없음. `adminClient()` 가 RLS 를 우회하므로 read 함수 body 에서 viewer-specific 조건(`kudos-viewer`)을 SQL filter 로 명시 강제. visibility decision 은 layer 1(`listVisibleActionLogIds`)에 위임. public cache tag 는 접근 제어 수단이 아니므로, 접근 제어는 반드시 (a) layer 1 호출 경계와 (b) viewer-specific SQL filter 로만 판단한다.
- 외부 서비스: Supabase Auth · Storage. token endpoint POST 수 감소, storage signed URL 정상화.
- 재사용 후보: 기존 `src/lib/supabase/admin.ts` `adminClient()` 그대로 — 이미 `autoRefreshToken: false`, `persistSession: false`, module-level singleton.

## 근거 / 배경 (요약)

Vercel 로그(2026-05-28 00:53, 01:25) 에서 `POST /auth/v1/token ×22 → 429`, 직후 `POST /storage/v1/object/sign/... → 400` 패턴 반복. 코드 추적:

- `src/lib/db/reads/challenge-feed.ts:55-77` — 피드 N개 아이템을 `Promise.all`로 병렬 처리, 각 아이템 안에서 다시 3개 read 를 또 `Promise.all`.
- `src/lib/db/reads/{photo-signed-url,action-log-hydrate,kudos-counts,kudos-viewer}.ts` — 모두 `"use cache: private"` 안에서 `await createClient()` 로 새 supabase server client 생성. supabase-js 가 첫 호출 시 cookie 의 access_token 을 validation/refresh 하면서 token endpoint 호출.
- `src/lib/supabase/middleware.ts` 의 `auth.getUser()` 가 매 요청마다 token refresh 시도 → `sb-*` cookie rewrite → `"use cache: private"` 의 implicit cookie 의존 key 가 매번 달라짐 → **항상 cache miss → 매번 N×4 client 폭발 재발**. BG/FG 즉시 토글에서도 재현되는 이유.

`src/lib/db/reads/kudos-counts.ts:9-15` 주석이 현 구조의 제약을 정확히 적어둠 — `"use cache"` (public) 는 cookies() 호출을 금지(cacheComponents throw). 따라서 admin 전환 = cookies 의존 제거 = `"use cache"` 가능. 이 경로가 fix 의 핵심.

Mutation 측 호환성: `src/app/(app)/challenge/[id]/_actions.ts:66-68, 79-81` 의 kudos toggle invalidate 호출은 이미 `updateTag('kudos-counts-${alid}')` · `revalidateTag('kudos-counts-${alid}', 'max')` 로 viewer-agnostic tag 이름을 사용 → kudos-counts tag 를 viewer-agnostic 으로 좁혀도 호출처 수정 불필요. action-log-hydrate · photo-signed-url 은 mutation 측 invalidate 호출 자체가 없어(visibility-version trigger 와 TTL 만료 의존) tag rename 자유.

## 기술 검토 보완점 (2026-05-28)

- **cache key 모순 수정 필요**: Next.js `"use cache"` 는 serializable argument 전체로 cache key 를 만든다(`node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md`). 따라서 `photo-signed-url` · `action-log-hydrate` 의 public cached inner 함수가 `viewerId` 를 계속 인자로 받으면 tag 를 viewer-agnostic 으로 바꿔도 cache entry 는 viewer 별로 갈라져 cross-viewer sharing 이 일어나지 않는다. exported wrapper signature 는 호환을 위해 유지하되, cached inner 함수는 각각 `fetchSigned(photoPath)` · `fetchHydrate(actionLogId)` 처럼 `viewerId` 를 받지 않아야 한다.
- **admin read 는 authorization gate 가 아님**: `adminClient()` 전환 후 `getActionLogHydrate(actionLogId)` · `getActionLogPhotoSignedUrl(photoPath)` · `getKudosCountsForLog(actionLogId)` 는 단독 호출 시 RLS 보호가 없다. production callsite 는 `fetchChallengeFeed` 내부의 `listVisibleActionLogIds` 이후로 제한하고, PR 검증에 callsite audit 을 포함한다. 임의 RSC 에서 직접 import 하는 것은 ADR/AGENTS 위반으로 다룬다.
- **viewer-specific public cache 조건 명확화**: `kudos-viewer` 는 public `"use cache"` 를 쓰더라도 viewer-specific data 이다. `viewerId` 는 cached function argument, `cacheTag('user-${viewerId}-kudos-${actionLogId}')`, `.eq('user_id', viewerId)` 세 곳에 모두 남아야 한다. tag 는 invalidation 용도일 뿐 cache partition 을 보장하는 주된 장치는 function argument 다.
- **Next compiler 검증 추가**: `typecheck`/`lint`/Vitest 는 `"use cache"` 직렬화·runtime API 위반을 충분히 잡지 못한다. public cache directive 전환 후 `pnpm build` 를 자동 검증 게이트에 포함한다.

### develop 최신 정합성 확인 (2026-05-28)

본 plan 은 `origin/develop` HEAD(`9192937`) 기준이며 working tree 도 동일. 단, 세션 시작(`1d7e1ef`) 이후 plan 가정에 직결되는 2개 파일이 develop 에서 변경되어 아래를 반영했다.

- **`src/lib/supabase/auth.ts` (ADR-0023)**: `getAuthedUser` 가 `supabase.auth.getUser()`(GoTrue `/auth/v1/user` 네트워크 호출) → `supabase.auth.getClaims()`(JWKS 캐시로 JWT **로컬 검증**) 로 교체됨. 즉 **getAuthedUser 는 더 이상 token/user 네트워크 호출을 (정상 경로에서) 유발하지 않는다.** 따라서 아래 "남는 user-client" 카운트에서 getAuthedUser 는 token POST 유발원에서 제외한다. (단 createClient 자체는 호출하므로 client 객체는 1개 생성.)
- **`src/lib/db/reads/challenge-detail.ts`**: `error` 를 `null` 로 fold 하지 않고 **throw** 로 surface 하도록 바뀜(주석에 "429 카스케이드"를 명시적 동기로 언급). 함의: detail 단계에서 429 가 나면 dashboard 는 "이미지 미표시"가 아니라 **에러 바운더리로 페이지 전체가 깨진다.** 즉 본 fix 는 이미지뿐 아니라 detail 단계 페이지 크래시도 같이 줄인다. 동시에 `fetchChallengeDetail` 도 token 폭발의 잔여 유발원 중 하나임을 확정한다.
- **컨텍스트**: ADR-0021(`private-cache-inline-pattern`) · 0022(`auth-getuser-standardization`) · 0023(`auth-getclaims-replace-getuser`) 가 이미 머지됨. 본 plan 은 이 auth/cache 표준화 라인의 **연장**이며, 신규 ADR-0024 는 0021 의 inline private-cache 정책에 "hydrate 단계 admin+public cache 예외"를 추가하는 형태다.

### 추가 기술 검토 (2026-05-28, 코드 재확인)

- **[CRITICAL] integration mock harness 충돌**: `tests/integration/setup.ts` 의 `vi.mock("@/lib/supabase/server")` + `tests/integration/test-context.ts` 의 AsyncLocalStorage 가 **4개 자식 read 의 `createClient()` 호출을 가로채 RLS 적용 viewer client 를 주입**하는 것이 현재 integration RLS 검증의 핵심 메커니즘이다 (test-context.ts 주석이 정확히 그 4개 함수를 열거). admin 전환 시 이 4개는 `@/lib/supabase/admin.adminClient()` 를 부르므로 server mock 을 우회한다. 결과: (a) layer 1(`listVisibleActionLogIds`)만 mock 으로 RLS 적용되어 비멤버 빈 결과는 여전히 성립하지만, (b) "멤버가 본문/사진/kudos 를 본다" 류 검증은 admin 으로 실 DB 에 직접 붙거나 깨진다. 대응 필요: ①`@/lib/supabase/admin` 도 integration setup 에서 mock 하여 bound client(또는 secret client)를 반환하도록 추가하고, ②`test-context.ts` 주석/구현을 admin 전환에 맞게 갱신하고, ③`tests/integration/reads/challenge-feed.spec.ts` 가 새 harness 에서 기존 RLS 의미(비멤버 빈 결과 · viewer 별 kudos 구분)를 유지하는지 재확인한다. 이 작업은 별도 단계로 분리한다.
- **fix 후 남는 token-POST 유발원 = 최대 3 (getAuthedUser 제외)**: dashboard 진입 시 `createClient()` 를 만드는 곳은 `getAuthedUser` + `fetchChallengeDetail` + `getVisibilityVersion` + `listVisibleActionLogIds` 4개지만, `getAuthedUser` 는 ADR-0023 `getClaims()` 로 JWT 로컬 검증이라 정상 경로에서 token/user 네트워크 호출이 없다. 따라서 access_token 만료/thrash 시 `/auth/v1/token` refresh 를 유발할 수 있는 곳은 **`fetchChallengeDetail` · `getVisibilityVersion` · `listVisibleActionLogIds` 3개** 다. 성공 기준은 "**hydrate 자식 read 에서 0회, 잔여는 이 3개 계층에서만, 합계 ≤3~4회**". (더 줄이려면 `createClient()` 자체를 `React.cache` 로 dedup 하거나 이 3개도 getClaims/admin 으로 보내는 별도 작업 필요 — 본 plan scope 밖, follow-up.)
- **signed URL viewer-agnostic 공유의 잔여 TTL**: 기존엔 tag 가 `user-${viewerId}-photo-${path}` 라 viewer 별로 fresh URL 을 받았다. viewer-agnostic 공유로 바뀌면 "먼저 생성한 viewer 기준" TTL 을 공유한다. `cacheLife(stale 540 / revalidate 480 / expire 600)` 이고 signed URL TTL 600s 이므로, 두 번째 viewer 가 stale 경계(생성 후 ~540s) 근처에 받으면 잔여 수명이 짧아질 수 있다. 이미지 로드는 수 초 내라 실무상 무해하나, expire(600) 직전 stale 반환 가능성을 줄이려면 `expire` 를 signed URL TTL 보다 충분히 낮게(예: signed TTL 900s + cache expire 600s) 두는 옵션을 검토한다.
- **`adminClient()` 가 `"use cache"` 내부에서 `process.env.SUPABASE_SECRET_KEY` 접근**: adminClient 는 module-level lazy singleton 이라 첫 호출만 env 를 읽고 이후 재사용한다. 비-public env 의 server-runtime 접근이 public `"use cache"` 함수 내부에서 허용되는지는 `pnpm build` 게이트로 확정한다(빌드 시 inline 시도/누수 여부 포함). 누수 위험은 없으나(server-only import) Next 컴파일러 제약 가능성만 build 로 검증.
- **layer 1 cookie thrash 잔존**: `listVisibleActionLogIds`(`fetchListInner`)는 user client 유지라 cookie thrash 로 매 요청 cache miss → 1 token POST 가 남는다. 1회라 429 임계 아래이므로 수용. 단 본 fix 가 "layer 1 의 thrash 까지 없애는 것"은 아님을 명확히 한다.
- **RLS visibility gate 실재 확인됨**: `supabase/migrations/0002_rls.sql` 에 `al_select_member`(action_logs SELECT) · `kudos_select_member`(kudos SELECT) 정책 존재. layer 1 의 비멤버 차단 전제가 성립한다. ADR 에 "admin hydrate read 의 안전성은 `al_select_member` 가 layer 1 에서 비멤버 ID 를 거른다는 사실에 의존한다"를 명시한다.

## 작업 단계

0. **RLS gate 전제 확인**: `supabase/migrations/0002_rls.sql` 의 `al_select_member`(action_logs) · `kudos_select_member`(kudos) 정책을 읽어, layer 1(`listVisibleActionLogIds`)이 비멤버에게 빈 ID 리스트를 반환함을 확인한다. 이 사실이 admin hydrate read 의 안전성 전제다. — 검증: 정책 본문을 ADR 에 인용.
1. **Next cache 문서 재확인**: 구현 직전 `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md`, `use-cache-private.md`, `cacheTag.md`, `cacheLife.md`, `cacheComponents.md` 를 확인한다. 확인 포인트: public `"use cache"` 는 `cookies()`/`headers()` 접근 금지, cache key 는 function ID + serializable arguments + captured values, `cacheTag` 는 invalidation 용도. — 검증: ADR 또는 PR 본문에 확인한 문서 경로를 남긴다.
2. **ADR 작성**: `pnpm new adr admin-cache-after-layer1-visibility` 로 scaffold 후 결정·근거·대안·롤백 기재. 핵심 contract: _"Layer 1(`listVisibleActionLogIds` 같은 RLS visibility decision) 통과 후 hydrate 단계의 read 는 `adminClient()` + `"use cache"` 허용. viewer-agnostic cached inner 는 viewerId 를 argument 로 받지 않는다. viewer-specific read 는 viewerId 를 SQL filter, cached function argument, cacheTag 에 모두 포함해야 한다."_ — 검증: ADR 파일 존재 · 형식 lint 통과(`pnpm validate:docs`).
3. **AGENTS.md §Cache Components 갱신**: 기존 "service-role / `adminClient` 결과는 user-facing cache 에 저장하지 않는다" 문장을 ADR 링크와 함께 위 contract 로 대체한다. 반드시 "admin hydrate read 는 authorization gate 가 아니며 production callsite 는 Layer 1 이후로 제한한다"는 문장을 포함한다. — 검증: 본 plan 의 read 변경이 가드레일과 일치.
4. **`photo-signed-url.ts` 전환**: `await createClient()` → `adminClient()`, `"use cache: private"` → `"use cache"`, `cacheTag('user-${viewerId}-photo-${photoPath}', 'photo-${photoPath}')` → `cacheTag('photo-${photoPath}')`. exported `getActionLogPhotoSignedUrl(photoPath, _viewerId)` signature 는 호출처 호환 위해 유지하되, cached inner 는 `fetchSigned(photoPath)` 로 바꿔 `viewerId` 가 cache key 에 들어가지 않게 한다. `cacheLife` 는 540 stale / 480 revalidate / 600 expire 유지. — 검증: cacheTag unit spec 에서 `cacheTag('photo-${path}')` 와 `adminClient()` 사용, `createClient()` 미사용을 확인한다.
5. **`action-log-hydrate.ts` 전환**: `fetchHydrate(actionLogId, viewerId)` 를 `fetchHydrate(actionLogId)` 로 바꾸고 `getActionLogHydrate(actionLogId, _viewerId)` wrapper 만 유지한다. `cacheTag('user-${viewerId}-actionlog-${actionLogId}', 'actionlog-${actionLogId}')` → `cacheTag('actionlog-${actionLogId}')`. RLS 우회 OK 조건은 layer 1 통과 ID 만 호출됨이라는 contract 이다. — 검증: cacheTag unit spec + callsite audit.
6. **`kudos-counts.ts` 전환**: `await createClient()` → `adminClient()`, `"use cache: private"` → `"use cache"`. tag 는 이미 `kudos-counts-${actionLogId}` viewer-agnostic 이므로 그대로. 주석의 "private cache 로 두는 이유" 문단 삭제 후 "Layer 1 이후 hydrate 전용 admin read" 근거로 교체한다. — 검증: 기존 kudos toggle invalidation spec 이 `updateTag('kudos-counts-${alid}')` · `revalidateTag('kudos-counts-${alid}', 'max')` 를 계속 통과.
7. **`kudos-viewer.ts` 전환 (가장 주의)**: admin 전환 + `"use cache"` + tag 는 `user-${viewerId}-kudos-${actionLogId}` 유지. cached function signature 는 `actionLogId, viewerId` 둘 다 유지한다(viewerId 가 cache key partition 의 주 장치). `.eq('user_id', viewerId)` filter **반드시 유지**(현재도 있음 — 보존만 확인). — 검증: 아래 8단계 harness 수정 후 integration test 로.
8. **[CRITICAL] integration mock harness 수정**: 4개 read 가 `createClient()` → `adminClient()` 로 바뀌면서 `tests/integration/setup.ts` 의 `vi.mock("@/lib/supabase/server")` 가 더 이상 이들을 가로채지 못한다. (a) `tests/integration/setup.ts` 에 `@/lib/supabase/admin` mock 을 추가해 `adminClient()` 가 테스트용 service-role(또는 bound) client 를 반환하게 한다. (b) `tests/integration/test-context.ts` 의 주석(현재 4개 함수가 `createClient()` 를 부른다고 명시)을 admin 전환에 맞게 갱신한다. (c) `tests/integration/reads/challenge-feed.spec.ts` 가 기존 RLS 의미(비멤버 빈 결과는 layer 1 에서 성립 · viewer 별 kudos 구분은 `.eq('user_id', viewerId)` 로 성립)를 유지하는지 재확인하고, 깨지면 새 harness 에 맞게 수정한다. cross-viewer leak 회귀 케이스(같은 actionLogId 에 owner/other 가 서로 다른 emoji → 각자 자기 것만)를 이 파일에 추가한다. — 검증: `pnpm test:integration` 그린.
9. **callsite audit 추가**: 구현 PR 에서 아래 명령 결과를 확인한다. production 에서 `getActionLogHydrate` · `getActionLogPhotoSignedUrl` · `getKudosCountsForLog` · `getViewerKudosForLog` 직접 호출은 `src/lib/db/reads/challenge-feed.ts` 만 허용한다. tests/spec import 는 허용하되, app route/RSC 에 직접 import 가 생기면 중단한다.

   ```bash
   rg -n 'getActionLogHydrate|getActionLogPhotoSignedUrl|getKudosCountsForLog|getViewerKudosForLog' src tests
   ```

10. **자동 검증 게이트**: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration && pnpm build && pnpm validate:docs` 전부 그린. `pnpm build` 는 Next cache compiler/runtime API 위반(특히 public `"use cache"` 내 `adminClient()` 의 env 접근)을 잡기 위한 필수 게이트다.
11. **수동 PWA 검증**: Preview 배포 후 iPhone PWA 로 (a) 앱 완전 종료 → 재진입 → challenge dashboard 진입 1회, (b) BG↔FG 5회 토글하며 매번 dashboard 진입. Vercel 로그에서 `/auth/v1/token` POST 수 측정 — 검증 기준 아래 §검증 참조.

## 검증

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm build
pnpm validate:docs
```

수동 확인 항목:

- [ ] Preview 배포에서 iPhone PWA 로 cold start 1회 + BG/FG 토글 5회 시나리오 재현.
- [ ] Vercel 로그상 단일 GET `/challenge/[id]/dashboard` 당 `POST /auth/v1/token` 횟수 **22+ → ≤3~4회** 로 감소. 남는 호출은 `fetchChallengeDetail` · `getVisibilityVersion` · `listVisibleActionLogIds` 계층에서만 발생(`getAuthedUser` 는 ADR-0023 getClaims 라 token 무관), hydrate 자식 read(photo/hydrate/kudos-counts/kudos-viewer)에서는 **0회** 여야 한다.
- [ ] dashboard 가 `fetchChallengeDetail` throw(ADR 후속 challenge-detail 변경)로 에러 페이지가 되지 않는지도 함께 확인 — detail 단계 token 압력 감소로 throw 경로가 안 터져야 한다.
- [ ] 같은 로그에서 `over_request_rate_limit` (429) **0회**.
- [ ] 피드 사진 11장(또는 현 데이터 기준 전부) 모두 정상 표시. `photoSignedUrl = null` 케이스 0건(피드에서 사진 있는 row 기준).
- [ ] kudos 토글 후 본인 화면 즉시 갱신, 타 viewer 의 다음 진입에서 새 count 보임(기존 SWR 동작 보존).
- [ ] 홈 (`/home`) · group detail 화면 회귀 없음.

## 리스크 / 미해결

- **RLS 우회 leak 위험**: admin client 는 모든 행을 볼 수 있다. 본 plan 의 4개 read 가 layer 1 (`listVisibleActionLogIds`) 결과 ID 안에서만 호출되는 contract 에 의존. 다른 RSC 가 임의의 `actionLogId` 또는 `photoPath` 로 hydrate/signing 함수를 직접 호출하면 비-멤버 데이터 또는 signed URL 이 노출될 수 있음. ADR 에 이 contract 를 명시하고, 구현 PR 에 callsite audit 결과를 남긴다. follow-up: CI 정적 검사 도입 검토.
- **`kudos-viewer` viewerId filter 누락 회귀 위험**: admin 전환 후 SQL filter 가 RLS 대신 leak 의 유일한 방어선. 또한 `cacheTag` 만으로는 partition 이 되지 않으므로 `viewerId` 는 cached function argument 에도 남아야 한다. 신규 integration spec 으로 회귀 방어막을 짠다.
- **viewer-agnostic cache 공유의 invalidation 정합성**: action-log 편집/삭제 mutation 이 현재 없으므로(POC) 자연 OK 이지만, 향후 본문 편집 기능 추가 시 `revalidateTag('actionlog-${id}')` 호출처를 빠짐없이 잡아야 함 — follow-up plan 필요.
- **Next.js 16 `"use cache"` (public) 동작 의존**: admin 으로 cookies() 제거 후 public cache directive 가 의도대로 cross-viewer 공유 + cacheComponents 가드 통과하는지 `pnpm build` 와 Preview 빌드에서 확인 필요. 가드레일 §Cache Components 가 require 하는 `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md` 재확인.
- **scope 외**: 같은 폭발 패턴이 group detail · home feed 등 다른 화면에서도 잠재. 본 plan 은 dashboard 만 대상. 같은 패턴 발견 시 별도 plan/PR 로 확장 (ADR 의 contract 가 그대로 적용 가능하도록 작성).
