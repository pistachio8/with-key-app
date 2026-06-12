# ADR-0037: RN read model 계약 — view-model SoT 추출 · Bearer Layer 1 변형 · query key 규칙

**Date**: 2026-06-12
**Status**: accepted
**Deciders**: pistachio8
**Implements**: [ADR-0036](0036-rn-admin-hydrate-bff-contract.md) §2 가 EVAL-0016 으로 미룬 "Layer 1 Bearer 경로 함수 모양" 확정 + [00 plan §13.3](../migration/00-rn-conversion-plan.md) read 매트릭스의 계약화.
**Task**: [EVAL-0016](../../evals/tasks/0016-rn-read-model-contract.md) (G7 read model contract).

## Context

RN 화면(G8+)이 데이터를 소비하기 전에 read 계약을 고정해야 한다. 문제 세 가지:

1. **view-model 타입이 web read 모듈에 인라인**돼 있어 RN 이 타입을 쓰려면 `apps/web`(Next 의존)을 import 해야 했다 — 계약 경계에 `cookies()`·`@supabase/ssr`·`next/cache` 가 샌다.
2. ADR-0036 §2 는 "Bearer 경로에서도 Layer 1 은 RLS user 권한"만 고정하고 **함수 구현 모양(client 주입 vs Bearer 전용 변형)은 EVAL-0016 에 위임**했다. 추가 제약: Next 공식 문서상 `use cache: private` 은 Route Handler 에서 사용 불가(`use-cache-private.md` "not available in Route Handlers") — 기존 Layer 1(`listVisibleActionLogIds`)을 BFF 에서 그대로 부를 수 없다.
3. RN 의 client cache(TanStack Query 예정, spec 확정 전)는 query key·invalidation 규칙이 없으면 web 의 cacheTag 체계와 대응이 끊긴다(03 §12).

## Decision

**view-model 계약의 SoT 를 `@withkey/domain` `read-contracts/` 로 추출하고, Bearer Layer 1 은 "명시 client 주입" 변형으로 고정하며, mobile query key 는 라이브러리 비의존 factory 로 규칙화한다.** 세부:

### 1. 계약 분류 매트릭스 (00 §13.3 의 21개 read → RN 계약)

| 분류                       | read 모듈                                                                                                                                                                                                                                                            | RN 소비 방식                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **BFF** (1 endpoint)       | `challenge-feed` + admin hydrate 4종(`action-log-hydrate` · `photo-signed-url` · `kudos-counts` · `kudos-viewer`)                                                                                                                                                    | `GET /api/feed?challengeId=` + Bearer → `FeedItemView[]`(zod). admin hydrate 는 **mobile 직접 호출 금지** |
| **RPC direct** (예정)      | `invite`                                                                                                                                                                                                                                                             | `get_invite_preview(token)` SECURITY DEFINER RPC — migration·web 전환은 ADR-0036 §4 후속 task(별도 PR)    |
| **RN-safe(RLS) direct** 13 | `current-challenges` · `challenge-detail` · `group-detail` · `my-challenges` · `recap` · `challenge-photos` · `me` · `my-groups` · `notification-prefs` · `pledge` · `owner-groups-for-challenge-form` · `active-challenge`(deprecated) · `unread-kudos`(deprecated) | mobile read service 가 viewer 토큰 supabase-js 로 직접 read. RLS 가 인가 경계                             |
| **web 전용** 2             | `list-visible-action-log-ids`(BFF/web 내부 Layer 1) · `visibility-version`(Next cache tag 전용)                                                                                                                                                                      | mobile 비노출 — feed BFF 내부에서만 사용                                                                  |

- `active-challenge` 는 web 에서도 deprecated(`fetchCurrentChallenges` 위임) — RN 은 `fetchCurrentChallenges` 결과에서 파생하고 별도 service 를 만들지 않는다. `unread-kudos` 는 호출자 없음(D-9 정리 대상) — 미포팅.
- 매트릭스 이후 추가된 read 2종: `point-balance`(RN-safe RLS — `point_ledger_select_self_or_group`) · `phash-duplicates`(서버 전용 verify 입력, service-role — mobile 비노출). 해당 화면 포팅 task 에서 같은 규칙으로 계약화한다.
- Web Push 구독 read(`notification-prefs` 의 `fetchActiveSubscriptionEndpoint`)는 RN 미포팅 — push 모델이 `device_push_tokens` 로 교체(D-2).

### 2. view-model 계약 SoT = `packages/domain/src/read-contracts/`

- 화면 view-model 타입(`GroupChallengeView` · `ChallengeDetailView` · `GroupDetailView` · `RecapView` · `RecapPhotoView` · `MyChallenges` · `PledgeView` · `MyGroupSummary` 등)을 domain 으로 추출하고, **web read 모듈은 re-export 로 소비**한다(추출 소스 — 호출처 무영향). transport 경계가 있는 계약만 zod 스키마 동반: `feedItemViewSchema`/`feedResponseSchema`(BFF 응답) · `invitePreviewSchema`(RPC 응답).
- **계약은 JSON 직렬화 안전 필드만** 갖는다. web `ChallengeMemberView.doneByWeek`(`ReadonlyMap` — dashboard 칩·링용)는 서버 전용으로 계약에서 제외하고, web 타입은 `계약 & { doneByWeek }` 확장으로 정의한다. **왜**: BFF/스냅샷 비교가 JSON 경계라 Map 류는 계약이 될 수 없다.
- domain 은 순수 유지 — read-contracts 에 네트워크/클라이언트 코드 금지(04 A2).

### 3. Layer 1 Bearer 변형 = 명시 client 주입 (Bearer 전용 함수 신설 아님)

- `readVisibleActionLogIds(supabase, challengeId)` 를 Layer 1 쿼리 본체로 추출 — cookie 경로(`listVisibleActionLogIds` 의 `use cache: private` inner)와 Bearer 경로가 **같은 쿼리 본체**를 공유해 두 경로의 동작 일치를 구조로 보장한다(ADR-0036 의 "이원화 동안 동작 일치" 비용 절감).
- BFF 는 `createBearerClient(accessToken)`(`src/lib/supabase/bearer.ts` — publishable key + `Authorization: Bearer`, 요청당 새 인스턴스) 로 token 기반 RLS user client 를 만들고, `fetchChallengeFeedForViewerClient(viewerClient, challengeId, viewerId)` 를 호출한다. Layer 1 은 **비캐시**(private cache 는 Route Handler 불가 + RN 캐싱은 TanStack Query 소관), hydrate 단계의 public `use cache` 는 web 과 공유.
- ADR-0024 의 callsite 계약 유지 — admin hydrate read 의 production callsite 는 여전히 `challenge-feed.ts` 뿐이고, BFF route 는 feed 오케스트레이터만 import 한다.

### 4. mobile read service 배치 + query key 규칙

- read service 는 `apps/mobile/src/features/<domain>/api/<domain>-reads.ts`, query key 는 같은 폴더 `keys.ts` 의 **`<domain>Keys` factory** (`["challenge","detail",id]` 식 `[도메인, ...스코프]` 계층). TanStack Query 채택은 spec 확정 대상(03 §0.3)이라 **라이브러리 비의존 상수 factory 만** 두고, invalidation 기대값(어떤 mutation 후 어떤 key 를 invalidate)은 각 keys.ts 주석에 고정한다. key 에 viewerId 를 넣지 않는다 — client cache 는 계정 단위, 세션 교체 시 `queryClient.clear()`.
- BFF 전송은 `services/api/bff-client.ts`(Bearer, base URL = `EXPO_PUBLIC_BFF_BASE_URL` override ?? universal link 도메인) — BFF 호스트 이전 시 env 교체로 끝(ADR-0036 transport-중립).

### 5. 보존 eval = 공유 fixture 결정론 스냅샷

- `evals/fixtures/read-contracts/{home,challenge-detail,recap,me,group,feed}.ts` 에 rows·NOW·EXPECTED 를 고정하고, web(`apps/web/.../read-contract-parity.spec.ts` — vitest)과 RN(`apps/mobile/.../​*-reads.spec.ts` — jest)이 **같은 EXPECTED 를 비교**한다(02 §5.2 read 계약 = 결정론 스냅샷, pass^k=100%). 시간 의존은 fake timer 로 고정.

## Alternatives Considered

### 1. 조립(assembly) 함수까지 domain 으로 추출해 web·RN 이 공유

- **Pros**: 패리티가 구조적으로 보장 — 스냅샷 eval 이 사실상 불필요.
- **Cons**: EVAL-0016 Target("packages/domain — 순수 view-model 타입만") 위반. domain 에 row shape(snake_case DB 형)·조립 로직이 유입돼 패키지 성격이 흐려진다.
- **Why not**: 02 §5.2 가 read 계약 보존을 "스냅샷 비교"로 설계한 이유가 이 중복을 전제 — 조립 중복은 fixture 스냅샷이 잡는다. 조립 공유는 G8 이후 중복이 실제로 아프면 별도 결정.

### 2. Layer 1 Bearer 전용 함수를 별도 신설 (쿼리 본체 비공유)

- **Pros**: cookie 경로 파일을 안 건드림.
- **Cons**: 같은 visibility 쿼리가 두 곳 — RLS gate 쿼리가 갈라지면 한쪽만 고치는 사고가 인가 경계에서 발생.
- **Why not**: ADR-0036 이 명시한 "두 경로 동작 일치" 비용이 가장 큰 리스크라 본체 공유가 정답.

### 3. RN-safe read 도 전부 BFF 로 노출 (read 단일 표면)

- **Pros**: mobile 에 supabase 쿼리가 없어 계약 표면 최소.
- **Cons**: RLS 로 충분한 read 까지 서버 왕복·BFF 부하 추가. ADR-0036 §1 의 결정(feed 만 BFF) 번복.
- **Why not**: ADR-0036 Consequences("나머지 15개는 RN-safe(RLS) 직접")와 정합 유지.

## Consequences

### 긍정적

- G8(read-only 화면)은 `@withkey/domain` 타입 + `features/*/api` read service 만 소비 — RSC 함수 복사 금지가 구조로 강제된다.
- 계약 경계에서 Next 의존(`cookies()`·`@supabase/ssr`·`next/cache`) 제거 — domain·mobile 은 Next 없이 컴파일.
- service-role 표면 불변 — mobile 번들에 admin client/secret 경로 없음(검증: `rg "SUPABASE_SECRET|adminClient" apps/mobile` 0건).
- web↔RN view-model 이 같은 fixture EXPECTED 로 묶여 조립 drift 가 결정론으로 잡힌다.

### 부정적 / 비용

- RN-safe read 의 조립 로직이 web/mobile 에 중복 — 스냅샷 eval 이 방어선이지만 fixture 가 안 덮는 경로는 리뷰로 방어: 에러 폴백, 그리고 **SQL 필터/정렬 drift**(mock builder 가 `eq`/`in`/`or` 등 필터를 무시하고 테이블 전체 rows 를 돌려주므로 필터 누락은 스냅샷이 못 잡는다). feed 는 fixture 가 zod 계약 통과만 검증(값 조립은 서버 함수 단일 소유라 web 실행 비교 불요). 중복이 아프면 대안 1 재검토.
- BFF Layer 1 은 비캐시라 피드 요청마다 visibility 쿼리 1회 — RN 측 TanStack Query staleTime 으로 흡수 예정.
- `evals/fixtures/read-contracts/*` 는 계약 변경 시 web·mobile spec 과 함께 갱신해야 한다(한쪽만 고치면 보존 eval 이 깨진다 — 의도된 마찰).

### 후속 영향

- `get_invite_preview` RPC migration + web 전환, `photo-signed-url` TTL 600→900(ADR-0036 §3) — 별도 task.
- TanStack Query·Zustand 채택 spec(03 §0.3) 확정 시 keys.ts factory 를 그대로 queryKey 로 사용.
- 00 plan §13.3 매트릭스는 freeze 문서라 수정하지 않는다 — 본 ADR §1 표가 RN 계약 뷰.

## 용어집

- **BFF**: Backend for Frontend — RN ↔ Supabase 사이 보안 경계 서버(현재 apps/web Next API route)
- **Layer 1 (visibility gate)**: 피드에서 viewer 가 볼 수 있는 action_log ID 를 RLS 로 거르는 단계 — 인가 경계라 admin 으로 대체 금지
- **RLS**: Row Level Security — Postgres 행 단위 접근 제어
- **view-model**: 화면이 그대로 렌더하는 read 결과 shape(DB row 가 아니라 조립된 형태)
