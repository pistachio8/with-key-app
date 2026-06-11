# ADR-0036: ADR-0024 admin hydrate read 의 RN 계약 — feed 는 BFF, invite 는 RPC, signed URL 900s

**Date**: 2026-06-11
**Status**: accepted
**Deciders**: pistachio8
**Supplements (in part)**: [ADR-0024](0024-admin-cache-after-layer1-visibility.md) — web 의 admin hydrate + public cache 결정은 그대로 유효하다. 본 ADR 은 그 위에 RN(React Native) 노출 계약을 추가하고, ADR-0024 의 조항 2개(signed URL TTL 결합 · admin read 범위)만 개정한다.
**Resolves**: [00-rn-conversion-plan §13.4 D-4](../migration/00-rn-conversion-plan.md) — admin hydrate read 의 RN 계약(BFF vs RLS 재설계 + signed URL 수명).

## Context

[00 plan §13.3](../migration/00-rn-conversion-plan.md) read 매트릭스에서 service-role(`adminClient`) 의존 read 는 6개다 — feed 계열 5개(`challenge-feed.ts` 오케스트레이터 + hydrate 4종: `action-log-hydrate` · `photo-signed-url` · `kudos-counts` · `kudos-viewer`)와, 성격이 다른 `invite.ts`(비로그인 초대 미리보기) 1개. RN client 는 service-role 을 가질 수 없으므로(03 §3) 이 6개의 RN 계약을 Phase 3(read 패리티) 전에 결정해야 한다.

결정에 앞서 확인한 사실:

- **web 의 admin 전환(ADR-0024)은 권한 문제가 아니라 Next.js 한정 병리의 fix 였다.** `"use cache: private"` 의 implicit cookie key thrash → `/auth/v1/token` 429 폭발이 원인이었고, RLS 자체는 멤버 직접 읽기를 전부 허용한다 — `al_select_member`(action_logs) · `kudos_select_member`(kudos) · `ap_select_group_member`(storage.objects, `0011_storage_action_photos.sql`). 즉 **RN client 가 자기 토큰으로 signed URL 생성 포함 피드 전체를 직접 읽는 것이 권한상 가능**하다. RN 은 client 싱글톤 + TanStack Query 라 web 의 폭발 패턴이 재현되지 않는다.
- **BFF 는 제거가 아니라 호스트 이전이 로드맵이다.** [04 §5 A8](../migration/04-rn-architecture.md) Hybrid(BFF = `apps/web` Next API + Bearer)는 확정이고, 장기적으로 BFF 를 별도 백엔드 서버로 이전하는 것을 고려 중이다. 서버 레이어 자체는 유지된다.
- **signed URL TTL(600s)은 `cacheLife(expire 600)` 와 같은 값으로 결합**돼 있다(`photo-signed-url.ts`). ADR-0024 가 수용한 엣지 — stale 경계 직전에 캐시가 서빙한 URL 은 잔여 수명이 0 에 가까울 수 있음 — 가 그대로 남아 있다. RN 에선 추가 문제가 생긴다: `expo-image` 는 URL 문자열이 캐시 키라서, URL 이 10분마다 회전하면 같은 사진을 매번 재다운로드한다(모바일 데이터 비용 + 피드 체감 속도 저하).
- **`invite.ts` 는 로그인 전 딥링크 진입에서 호출**된다. `invites` RLS 가 오너 SELECT 전용이라 web 도 admin 으로 우회 중이다. 초대 딥링크 자동수락 PoC 는 Phase 1 완료 조건(D-8)인데, BFF read endpoint 정비는 Phase 3 작업이다 — preview 를 BFF 에 걸면 Phase 1 이 Phase 3 산출물에 역의존한다.

## Decision

**feed 계열 5개는 BFF 단일 endpoint 로 노출하고, invite preview 는 SECURITY DEFINER RPC 로 전환하며, signed URL TTL 은 900s 로 올린다.** 세부 규칙:

### 1. feed 계열 5개 — BFF `GET /api/feed` (Bearer)

- RN 은 `Authorization: Bearer <Supabase access token>` 으로 `apps/web` Next API route 를 호출하고, route 는 token 검증 후 `fetchChallengeFeed(challengeId, viewerId)` 를 호출해 `FeedItemView[]` 를 반환한다.
- **계약은 transport-중립으로 정의한다** — 본 ADR 이 고정하는 것은 "Next route" 가 아니라 HTTP 계약이다: `GET /api/feed?challengeId=` + Bearer + 응답 = `FeedItemView[]` zod 스키마(`packages/domain` 배치). 추후 BFF 를 별도 백엔드 서버로 이전할 때 같은 계약을 재구현하고 mobile 은 base URL 만 교체한다. 핸들러 로직(`fetchChallengeFeed`)은 `lib/db/reads` 의 함수 합성으로 유지하고 Next 의존(`"use cache"` 디렉티브)은 hydrate 함수 내부에 가둔다.
- **ADR-0024 의 callsite 계약은 그대로 유지된다** — BFF route 는 admin hydrate read 를 직접 import 하지 않고 `fetchChallengeFeed`(Layer 1 내장)만 호출한다. "admin hydrate read 의 production callsite 는 `challenge-feed.ts` 로 제한" 조항과 callsite audit(`rg`) 규칙은 변경 없음.

### 2. Layer 1 — Bearer 경로에서도 RLS 필수 (admin 대체 금지)

- **Layer 1(`listVisibleActionLogIds`)은 Bearer 경로에서도 반드시 RLS user 권한으로 실행한다.** "BFF 에서 token 검증했으니 전부 admin 으로 읽는다" 식 우회는 금지 — 그 순간 비멤버 데이터 방어선이 RLS 에서 BFF 코드로 격하되고 ADR-0024 의 안전 논리("admin 은 Layer 1 통과 후에만")가 무너진다. 현재 Layer 1 은 cookie 세션 client 기반이라 Bearer 요청에서 그대로 동작하지 않으므로, **token 기반 RLS client 로 Layer 1 을 실행하는 경로**가 필요하다.
- **cookie 기반 private cache(`"use cache: private"`)는 Bearer 경로에 적용하지 않는다** — cookie 가 없어 작동 전제가 깨져 있고, RN 측 캐싱은 TanStack Query 가 담당한다. hydrate 단계의 public cache(cookie 무관)는 web 과 그대로 공유된다.
- 함수 구현 모양(client 주입 파라미터 vs Bearer 전용 변형)은 EVAL-0016 구현에서 정한다 — 본 ADR 은 위 두 원칙만 고정한다.

### 3. signed URL — TTL 900s + "캐시 expire + 300s 버퍼" 규칙

- `SIGNED_TTL_SECONDS` 600 → **900**. 서버 캐시는 `cacheLife(expire 600)` 유지. **규칙: signed URL TTL ≥ 서버 캐시 expire + 300s** — 캐시가 만료 직전에 서빙한 URL 도 최소 300s 잔여 수명을 보장한다(ADR-0024 가 수용했던 엣지를 계약 차원에서 제거, 느린 모바일 회선의 로드 중 만료 위험 해소).
- **mobile 은 `expo-image` 의 `cacheKey` 에 `actionLogId` 를 고정**한다 — URL 은 "다운로드 자격증명"으로 강등되고 회전해도 재다운로드가 없다. 장기 TTL(24h+)로 푸는 것은 가드레일("사진 URL 노출 → 외부 인덱싱·스크래핑 위험")과 충돌해 기각.
- **전제: action log 당 사진은 불변**(`0011_storage_action_photos.sql` — "uploaded photo objects are immutable in v1", UPDATE 정책 없음). 사진 교체/수정 mutation 이 도입되면 cacheKey 전략이 깨지므로 본 조항을 재검토한다.

### 4. invite preview — SECURITY DEFINER RPC `get_invite_preview(token)`

- anon 호출 가능한 SECURITY DEFINER RPC 로 전환한다. `search_path` 고정, 반환 필드는 현행 `fetchInvitePreview` 와 동일한 최소 필드(`InvitePreview` shape), token 미발견 시 null 동등 동작.
- **왜 BFF 가 아닌가**: 초대 딥링크 자동수락 PoC 는 Phase 1 완료 조건(D-8)이고 `accept_invite` 는 이미 RPC 직접이다 — preview 도 RPC 면 초대 플로우 전체가 Phase 1 에서 Supabase-only 로 완결된다. 부수 효과로 BFF 는 **Bearer 인증 endpoint 만 있는 표면**으로 유지된다(비인증 endpoint 클래스 신설 회피). token 열거 공격 표면은 BFF 안과 동일하며 방어는 token 엔트로피다.
- **web 도 같은 RPC 로 전환**한다 → admin read 는 6개 → 5개(feed 계열만)로 축소된다.

### 5. 가드레일 개정 — Route Handler 조항

- AGENTS.md · QUALITY_GATE.md 의 "Route Handler(`src/app/api/*`)는 외부 콜백 전용" 을 "**외부 콜백 + RN BFF(Bearer 인증) 전용**" 으로 개정한다(본 ADR 과 같은 PR).
- **PWA(web) 클라이언트는 BFF endpoint 호출 금지** — web 은 RSC + Server Action 유지. BFF 는 RN 전용 표면이다. 이 한 줄이 없으면 web 컴포넌트가 `fetch` 로 BFF 를 소비하기 시작해 "RSC + server fetch 기본" 아키텍처가 무너진다.

## Alternatives Considered

### 1. feed 를 RN direct RLS 로 재설계 (PostgREST embed + `createSignedUrls` batch)

- **Pros**: 권한상 가능(RLS 정책 3종 존재). 읽기가 Supabase 만으로 동작 — BFF 무관.
- **Cons**: 피드 조립 로직(Layer 1 gate → hydrate 합성 → kudos 집계)이 mobile client 에 박힌다. 앱스토어 배포 주기 때문에 client 에 박힌 로직은 서버 회수 비용이 가장 크다. web–RN 조립 이원화로 패리티 snapshot(EVAL-0016 AC)이 비싸지고 drift 위험. 모바일 RTT 2~3회 vs BFF 1회.
- **Why not**: BFF 는 제거가 아니라 호스트 이전이 로드맵이라 "서버 없는 읽기"의 이득이 없다. transport-중립 계약으로 BFF 를 정의하면 이전 비용이 URL 교체 수준으로 떨어진다. 단, 권한상 가능하다는 사실은 cutover 후 재검토의 근거로 남긴다.

### 2. signed URL 장기 TTL (24h~7d) 로 재다운로드 문제 해결

- **Pros**: 상수 1개 변경으로 단순. URL 회전 빈도 자체가 줄어든다.
- **Cons**: URL 유출 시 노출 창이 24h~7d — "사진 URL 노출 → 외부 인덱싱·스크래핑 위험" 가드레일과 충돌. 회전 시 재다운로드는 빈도만 줄 뿐 여전히 발생.
- **Why not**: `expo-image` `cacheKey` 분리가 노출 창을 늘리지 않고 재다운로드를 0 으로 만든다. 오프라인 재열람도 디스크 캐시로 해결된다(오프라인 첫 로드 보장은 POC 범위 밖).

### 3. invite preview 를 BFF 비인증 endpoint 로 노출

- **Pros**: `fetchInvitePreview` 재사용, migration 없음.
- **Cons**: BFF 에 비인증 endpoint 클래스 신설. 초대 플로우가 두 백엔드(BFF preview + RPC accept)에 걸침. Phase 1(딥링크 PoC)이 Phase 3(BFF read 정비) 산출물에 역의존.
- **Why not**: Phase 순서가 결정적이다. RPC 면 Phase 1 에서 Supabase-only 로 완결되고, migration 비용은 본 ADR 이 spec-required 기록을 겸하므로 상쇄된다.

### 4. ADR-0024 를 supersede

- **Pros**: RN 계약을 단일 문서로 통합.
- **Cons**: web/PWA 의 admin hydrate + public cache 는 Next 병리(429 폭발) fix 로 여전히 유효하다 — 폐기할 근거가 없다.
- **Why not**: 바뀌는 것은 TTL 결합(600→900 + 버퍼 규칙)과 admin read 범위(6→5)뿐. supplement 로 개정 지점만 명시하는 것이 정확한 기록이다.

## Consequences

### 긍정적

- RN read 패리티(Phase 3, EVAL-0016)의 설계 기준이 고정된다 — feed 는 BFF 계약 소비, invite 는 RPC, 나머지 15개는 RN-safe(RLS) 직접.
- web–RN 피드 패리티 snapshot 이 같은 서버 함수(`fetchChallengeFeed`) 기준이라 거의 공짜.
- BFF 호스트 이전 시 mobile 재배포 없이 base URL 교체로 끝나는 계약 구조.
- 피드 이미지가 URL 회전과 무관하게 mobile 디스크 캐시를 유지 — 재다운로드 0, ADR-0024 의 stale 경계 엣지도 제거.
- 초대 플로우(preview + accept)가 Phase 1 에서 Supabase-only 로 완결. admin read 표면 6 → 5.

### 부정적 / 비용

- BFF read 경로가 생기면서 Route Handler 가드레일에 예외가 추가된다 — "PWA 호출 금지" 조항과 리뷰로 방어한다.
- Layer 1 의 Bearer 경로(token 기반 RLS client)는 신규 구현이 필요하다 — cookie 경로와 이원화되는 동안 두 경로의 동작 일치를 테스트로 보장해야 한다.
- `get_invite_preview` RPC 는 anon 호출 가능 표면이다 — token 엔트로피가 유일한 방어이므로 token 생성 로직 변경 시 본 ADR 을 함께 검토해야 한다.
- 사진 불변 전제가 깨지는 기능(사진 교체)이 들어오면 `cacheKey=actionLogId` 전략 재검토 필요.

### 후속 영향

- [00-rn-conversion-plan §13.4](../migration/00-rn-conversion-plan.md) D-4 행에 본 ADR 링크 추가(본 PR).
- AGENTS.md · QUALITY_GATE.md Route Handler 조항 개정(본 PR).
- EVAL-0016(G7 read model contract) unblock — Blocked-by 의 D-4 미결 조건 해소. 구현 시 본 ADR §2 의 Layer 1 Bearer 경로 모양을 확정한다.
- `get_invite_preview` migration + web `fetchInvitePreview` 전환은 구현 task 에서 수행(별도 PR, spec-required 근거는 본 ADR).
- `photo-signed-url.ts` `SIGNED_TTL_SECONDS` 600 → 900 은 구현 task 에서 수행 — ADR-0024 의 "cacheLife == TTL" 서술은 본 ADR 의 버퍼 규칙으로 대체된 것으로 본다.
