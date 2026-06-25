# ADR-0041: RN Push Token 모델 — Web Push 구독에서 Expo device token으로

**Date**: 2026-06-25
**Status**: proposed <!-- accepted / superseded / deprecated -->
**Deciders**: pistachio8

## Context

현재 with-key PWA(Progressive Web App)의 푸시 알림은 브라우저 Web Push 표준 위에 서 있다. RN(React Native) 전환 시 이 모델이 통째로 무너진다. 이 ADR은 [`docs/migration/00-rn-conversion-plan.md`](../migration/00-rn-conversion-plan.md) §13.4의 decision debt **D-2**(push token 모델)를 닫는다.

선행 migration 문서가 이미 신규 테이블 방향과 권장 shape를 "권장(→ADR)" 상태로 적어 두었다. 본 ADR은 그 권장을 **확정으로 승격**한다.

- [`docs/migration/03-rn-migration-rules.md` §8](../migration/03-rn-migration-rules.md) — "토큰 테이블은 ADR 대상. `device_push_tokens` 신설 권장 shape(`id·user_id·device_id·expo_push_token·platform·app_version·last_seen_at·disabled_at`). user 1명이 여러 기기를 가지므로 `user_id × device_id` 매핑".
- [`docs/migration/04-rn-architecture.md` §7 (A9)](../migration/04-rn-architecture.md) — 동일 shape + "RLS: self만 read/insert/update", "기존 `push_subscriptions`는 cutover까지 web 잔존, dispatch sender가 두 테이블을 조회. **수신자 선정·quiet hours·dedup은 유지하고 sender만 Expo push로 교체**".

### 현재 모델 (Web Push)

브라우저 PushManager가 발급한 3-튜플 구독을 Supabase 테이블에 저장하고, 서버가 `web-push` 라이브러리로 발송하는 구조다.

- **테이블** `push_subscriptions(id, user_id, endpoint UNIQUE, p256dh, auth, created_at)` — `user_id`는 `references users(id) on delete cascade`, RLS(Row Level Security, 행 단위 접근 제어) `ps_all_self`(`user_id = auth.uid()`), `idx_push_sub_user(user_id)` 인덱스. ([`supabase/migrations/0001_init.sql:132`](../../supabase/migrations/0001_init.sql) · [`0002_rls.sql:223`](../../supabase/migrations/0002_rls.sql))
- **구독 토큰** = `{ endpoint, p256dh, auth }` 3-튜플. 브라우저 `PushManager.subscribe()`가 VAPID(Voluntary Application Server Identification) 공개키로 생성. ([`apps/web/src/lib/push/subscribe.ts`](../../apps/web/src/lib/push/subscribe.ts))
- **등록** `registerPushSubscription` Server Action — `upsert(onConflict: "endpoint")`, RLS self-row 쓰기. 해제는 `unregisterPushSubscription`(endpoint로 delete)·`clearMyPushSubscriptions`(user_id로 전체 delete). ([`apps/web/src/app/(app)/me/_actions.ts:24`](<../../apps/web/src/app/(app)/me/_actions.ts>))
- **전송** `sendPush` → `web-push` + VAPID 키 → `webpush.sendNotification({endpoint, keys}, payload, {TTL, urgency})`. ([`apps/web/src/lib/push/send.ts`](../../apps/web/src/lib/push/send.ts) · [`vapid.ts`](../../apps/web/src/lib/push/vapid.ts))
- **무효 토큰 정리** 전송 시 HTTP 404/410 응답 → `endpoint`로 row **하드 삭제**(`cleanupInvalidSubscription`). ([`apps/web/src/lib/push/dispatch.ts:78`](../../apps/web/src/lib/push/dispatch.ts))
- **발송 fan-out** server-only(`adminClient`, service-role) dispatch 8종: start · action-completed · deadline · goal-unreachable · verify-anomaly · kudos-received · owner-start-nudge · new-challenge-created. 모두 `push_subscriptions`를 user당 전체 row 조회 → `Promise.allSettled`로 다중 디바이스 발송. 수신자 선정(`challenge_participants` → `notification_prefs` opt-in)·quiet hours·dedup 로직이 이 레이어에 있다.
- **구독 read** `fetchActiveSubscriptionEndpoint` — `order(created_at desc).limit(1)`로 최신 1건 조회(user당 row는 여러 개 가능)해 "구독됨" 판정. ([`apps/web/src/lib/db/reads/notification-prefs.ts:21`](../../apps/web/src/lib/db/reads/notification-prefs.ts))
- **분석** dispatch는 매 발송마다 `notification_sent` 이벤트(`type`·`outcome`·`suppressed`)를 `track()`으로 기록(PRD §9.1). 토큰 모델과 독립.
- **콜백 자리** `/api/push/route.ts` — 현재 health placeholder.

### RN/Expo와의 비호환

`apps/mobile`은 Expo 앱이다([ADR-0033](./0033-rn-target-architecture.md) RN 타깃 아키텍처 — 모노레포 `apps/web`·`apps/mobile`·`packages/domain`). Expo 네이티브 푸시는 다음이 다르다.

- RN에는 브라우저 `PushManager`·Service Worker·VAPID가 없다. 대신 `expo-notifications`의 `getExpoPushTokenAsync()`가 **단일 문자열 토큰**(`ExponentPushToken[...]`)을 발급한다. 이 토큰은 Expo가 디바이스별 APNs(Apple Push Notification service)·FCM(Firebase Cloud Messaging) 토큰을 추상화한 것이다.
- 즉 `{endpoint, p256dh, auth}` 3-튜플 ↔ `{expo_push_token, platform, device_id}`가 형태부터 호환되지 않는다. (`00-rn-conversion-plan.md:266` — "Expo Notifications는 native credentials와 device/project token 모델을 쓰며 현재 VAPID Web Push table과 호환되지 않는다")
- 전송 경로(`web-push` + VAPID)도 Expo Push Service(APNs/FCM 대행)로 교체해야 한다. ([`00-rn-conversion-plan.md:157`](../migration/00-rn-conversion-plan.md))
- 무효 토큰 신호도 다르다: HTTP 404/410 → Expo receipts의 `DeviceNotRegistered`.

### 왜 Phase 1 전에 필요한가

알림 register 경로·테이블은 인증(auth) 직후 첫 화면 흐름에서 필요하다(`00-rn-conversion-plan.md:383` D-2 트리거). Phase 1(Expo Foundation) 부트스트랩이 이 스키마 위에서 시작하므로, 테이블·register 계약을 먼저 못 박아야 후속 Phase 6(Notifications) 재작업을 막는다. [ADR-0034 §104](./0034-rn-kakao-native-auth.md)·[ADR-0037 §32](./0037-rn-read-model-contract.md)는 이미 push 모델을 "별도 ADR(D-2)에서 `device_push_tokens`로 교체"로 미뤄 두었다.

## Decision

**신규 `device_push_tokens` 테이블 + Expo Push API(APNs/FCM 대행) 전송**을 채택하고, 기존 Web Push 경로는 전송 레이어 provider 추상화 뒤에서 RN 전환 완료까지 한시 공존시킨 뒤 폐기한다. 테이블 shape는 선행 03 §8·04 §7 권장을 확정한다.

세부 규칙:

- **테이블 신설** — `push_subscriptions`를 변형하지 않고 새 테이블 추가. 03/04 권장 shape 확정:
  ```sql
  device_push_tokens
    id              uuid pk default gen_random_uuid()
    user_id         uuid not null references users(id) on delete cascade
    device_id       text not null            -- 기기 식별자(expo-device installation id)
    expo_push_token text not null            -- ExponentPushToken[...]
    platform        text not null check (platform in ('ios','android'))
    app_version     text
    last_seen_at    timestamptz
    disabled_at     timestamptz              -- 무효화 soft-delete (DeviceNotRegistered)
    created_at      timestamptz not null default now()
    unique (user_id, device_id)              -- 기기당 1행(토큰 갱신은 upsert)
    unique (expo_push_token)
  index idx_dpt_user on (user_id)
  RLS dpt_all_self: for all using (user_id = auth.uid()) with check (user_id = auth.uid())
  ```

  - **왜 새 테이블**: `endpoint/p256dh/auth`는 Web Push 전용 의미라 token 모델과 컬럼이 1:1로 안 맞는다. 한 테이블에 두 모델을 섞으면 nullable·분기·RLS가 지저분해진다(03 §8). POC migration은 단방향·append-only(가드레일)라 기존 컬럼 파괴적 교체는 dispatch 8종 + register/unregister/clear 액션 + read 1종을 한 migration에 묶어 회귀 위험이 크다. 03 §8·04 §7도 신설을 권장했다.
  - **무효 토큰 = soft-delete(`disabled_at`)**: 현재 Web Push는 404/410에 endpoint row를 하드 삭제하지만, 신규는 `DeviceNotRegistered`에 `disabled_at` 마킹. 재등록 시 같은 `(user_id, device_id)` upsert로 재활성화. 갱신 이력 추적과 다중 디바이스 정책에 유리.
- **전송 = Expo Push API** `https://exp.host/--/api/v2/push/send`(또는 `expo-server-sdk`). Expo가 iOS=APNs·Android=FCM으로 라우팅. 전송 실패 receipts의 `DeviceNotRegistered`로 무효 토큰 정리.
  - **왜 Expo**: 이미 Expo 앱이라 자연스럽고, APNs 인증서·FCM 서버키 관리를 Expo가 대행. 단일 엔드포인트로 양 플랫폼 통합.
- **register 경로 = RN direct client** — `device_push_tokens` upsert는 RLS self-row라 RN이 Supabase 클라이언트로 직접 쓴다(BFF(Backend for Frontend, RN↔Supabase 보안 경계 서버) 불필요). [ADR-0036](./0036-rn-admin-hydrate-bff-contract.md)이 "Route Handler = RN BFF 전용"으로 표면을 분리했고 `00-rn-conversion-plan.md:336` #21이 "RN direct client"로 분류한 것과 일치 — **PWA 가드레일(쓰기는 Server Action 일원화)의 RN 표면 예외**다. 충돌 키는 `onConflict: "(user_id, device_id)"`.
- **dispatch(발송 fan-out)는 service-role 유지** — 현행대로 server-only(`adminClient`). RN은 발송을 트리거하지 않는다(현재도 cron·Server Action `after()`가 트리거). 이 service-role 경로는 [ADR-0024](./0024-admin-cache-after-layer1-visibility.md) admin hydrate(`challenge-feed.ts` callsite 한정)와 **별개**다 — push dispatch는 그 audit 대상이 아니다.
- **전송 레이어 provider 추상화** — `sendPush`를 `PushProvider` 인터페이스(`WebPushProvider` | `ExpoPushProvider`)로 분리하고, `loadTargets`가 테이블에서 token row를 읽어 provider에 위임한다. 04 §7대로 **dispatch 레벨 로직(수신자 선정·quiet hours·dedup)은 불변, sender만 교체**. 전환기엔 두 테이블·두 provider 공존, RN GA(General Availability, 정식 출시) 후 Web Push 경로(`push_subscriptions`·`web-push`)를 deprecate.
- **범위 밖(불변)**: 알림 센터(IndexedDB local store)·옵트인 prefs·`notification_sent` 분석 이벤트 스키마는 토큰 교체와 무관하게 유지. quiet hours(새벽 2~7시 KST 발송 금지)는 dispatch 레이어(`isQuietHoursKST`)에 있어 provider 교체와 독립적으로 보존. 단 **urgency·TTL은 Web Push 전용 옵션**이라 `ExpoPushProvider`에서 Expo Push 옵션(`priority`·`ttl`)으로 재지정 필요(아래 후속 영향). APNs/FCM credential을 Expo EAS(Expo Application Services)에 등록하는 콘솔 작업은 본 ADR이 강제하나 구현은 Phase 1/6.

## Alternatives Considered

### 1. `push_subscriptions` 컬럼 in-place 교체

- **Pros**: 테이블 1개 유지, read/dispatch 조회 대상 단일. 새 인덱스·RLS 불필요.
- **Cons**: `endpoint UNIQUE`·`p256dh`·`auth`를 token shape로 바꾸는 파괴적 ALTER. POC migration은 단방향이라 롤백 없음. dispatch 8종 + 액션 3종 + read 1종이 한 migration에서 동시에 깨짐. Web/RN 전환기 한 테이블에 두 모델 혼재 → nullable·분기 지저분.
- **Why not**: 회귀 위험이 신규 테이블 대비 크고 전환기 공존 불가. 선행 03 §8·04 §7도 신설을 권장. append-only 정책과 충돌.

### 2. Expo 없이 직접 FCM/APNs

- **Pros**: Expo 서비스 의존 제거, self-host 푸시 인프라 완전 통제.
- **Cons**: APNs 인증서 + FCM 서버키 2벌 관리, 플랫폼별 payload·우선순위 분기 직접 구현, 토큰 갱신·receipt 처리 자체 구축.
- **Why not**: POC 범위 초과. Expo 앱에서 Expo Push API는 거의 0-config다. Web Push 특유의 Apple gateway 제약(send.ts 주석의 `BadWebPushTopic`·deferrable drop)은 네이티브 경로에서 사라진다(단 priority·ttl은 Expo Push 옵션으로 재지정 필요). 후속에서 Expo→직접 전환은 provider 추상화로 가역.

### 3. Web Push 영구 공존 (RN에서도 Web Push 유지)

- **Pros**: 전송 코드 무변경.
- **Cons**: RN에는 Service Worker·PushManager가 없어 기술적으로 불가. WebView 우회는 백그라운드 푸시 미수신.
- **Why not**: 성립하지 않음(브라우저 전용 API 의존).

## Consequences

### 긍정적

- RN이 인증 직후 device token을 self-row로 등록 가능 → Phase 1 알림 register 흐름 unblock.
- Expo가 APNs/FCM credential·라우팅을 대행 → dispatch 분기·인증서 운영 부담 감소.
- provider 추상화로 Web·RN dogfood 전환기 공존, 단일 컷오버 리스크 완화.
- `(user_id, device_id)` 매핑 + `disabled_at` soft-delete로 다중 디바이스·토큰 갱신을 안전하게 처리.

### 부정적 / 비용

- 테이블 2개(`push_subscriptions` + `device_push_tokens`)가 전환기 공존 → dispatch sender가 한시적으로 양쪽을 인지.
- Expo Push Service 의존 추가(가용성·rate limit). self-host 전환 시 재작업.
- APNs 인증서·FCM 프로젝트를 Expo EAS에 등록하는 외부 콘솔 선행 작업(ADR-0034 Kakao 콘솔 작업과 같은 성격).
- `device_id` 획득 방식(expo-device installation id)·앱 재설치 시 orphan 정리 등 운영 세부는 Phase 6 spec.

### 후속 영향

- **migration**: `supabase/migrations/0058_device_push_tokens.sql` 신설 — 위 Decision의 테이블 + `(user_id, device_id)`·`expo_push_token` UNIQUE + `on delete cascade` FK + `idx_dpt_user` + `platform` check + RLS `dpt_all_self`. 번호는 맨 뒤에만 추가(현재 최신 `0057_challenge_montages`). spec-required 경로라 본 ADR이 근거.
- **BE_SCHEMA.md**: §2 테이블 목록·§3 ER·§5.9·§6에 `device_push_tokens` 추가, `push_subscriptions`를 "Web Push 전용 — RN 전환 후 deprecate"로 표기.
- **코드**: `send.ts` provider 분리(`WebPushProvider`/`ExpoPushProvider`) — **urgency·TTL을 Expo `priority`·`ttl`로 재지정**, quiet hours gate(`isQuietHoursKST`)는 dispatch 레이어에 그대로. `dispatch.ts` `loadTargets`가 token row를 provider에 위임. `me/_actions.ts` register/unregister/clear의 Expo token 버전. `notification-prefs.ts` 구독 read 교체. `/api/push/route.ts` 재설계 또는 제거.
- **연관 문서 상태**: [03 §8](../migration/03-rn-migration-rules.md)·[04 §7](../migration/04-rn-architecture.md)의 "권장→ADR" 상태를 본 ADR 링크로 확정. [ADR-0034 §104](./0034-rn-kakao-native-auth.md)·[ADR-0037 §32](./0037-rn-read-model-contract.md)의 "D-2 대상" 링크 연결. [ADR-0033 §99](./0033-rn-target-architecture.md) 미해결 목록에서 D-2 closed 표기. `00-rn-conversion-plan.md` §13.4 D-2 행을 "ADR-0041로 확정"으로, §5 리스크·#21·#236을 본 ADR 참조로 갱신.
- **Phase 6 task**: Notifications 포팅 Agent Task가 본 ADR을 인용(`device_push_tokens` 스키마 + Expo provider + urgency/ttl/quiet-hours AC).
- **PO/사람 게이트**: 본 ADR은 D6 사람 게이트(adr) 대상이라 `proposed` 상태로 둔다. PO 수락 시 Status를 `accepted`로 갱신.

## 용어집

- **APNs**: Apple Push Notification service — iOS 네이티브 푸시 게이트웨이.
- **device_id**: 기기 식별자. RN에서 `expo-device` installation id 등으로 획득. `user_id × device_id`로 다중 디바이스를 구분.
- **device token**: 디바이스별로 푸시 게이트웨이가 발급하는 식별자. Expo는 이를 단일 `ExpoPushToken` 문자열로 추상화.
- **EAS**: Expo Application Services — Expo의 빌드·credential·푸시 관리 클라우드.
- **Expo Push API**: Expo가 제공하는 푸시 전송 엔드포인트. ExpoPushToken을 받아 APNs/FCM으로 라우팅.
- **FCM**: Firebase Cloud Messaging — Android(및 크로스플랫폼) 푸시 게이트웨이.
- **GA**: General Availability — 정식 출시(베타·dogfood 이후 단계).
- **RLS**: Row Level Security — Postgres 행 단위 접근 제어(Supabase).
- **soft-delete**: row를 물리 삭제하지 않고 `disabled_at` 같은 마커로 비활성 표시. 이력 보존·복구에 유리.
- **VAPID**: Voluntary Application Server Identification — Web Push 서버 인증 키 쌍.
- **Web Push**: 브라우저 표준 푸시(Service Worker + PushManager + VAPID). RN에는 없음.
