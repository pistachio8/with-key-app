---
plan: 2026-05-21-push-subscription-state-sync
title: Push Subscription State Sync
author: pistachio8
date: 2026-05-21
status: draft
---

## 목표

- **G1**: `push-settings.tsx` 의 `ensureSubscription` 이 `pushManager.getSubscription()` 으로 브라우저 실제 구독을 진실 원천으로 사용, server `push_subscriptions` row 와 항상 silent 동기화.
  - Stale state 우회 차단을 위해 **(a)** `if (subscribed) return true` early-return 제거 + **(b)** 호출 분기 `if (turningOn && !subscribed)` 를 `if (turningOn)` 으로 변경. `syncBrowserSubscription` 이 idempotent(reuse) 라 매 ON 클릭 안전.
- **G2**: 신규 가입자 기본값을 OFF 로 변경.
  - **(a)** `notification-prefs.ts` 의 `DEFAULT_PREFS` 를 `{start:false, deadline:false}` (UI fallback 정합) + **(b)** `users.notification_prefs` column default 를 `'{"start":false,"deadline":false}'::jsonb` 으로 migration. 기존 row 는 ALTER COLUMN DEFAULT 특성상 영향 없음.
- **G3**: 호출처 1곳 교체로 dead code 된 `subscribeToPush` 와 관련 spec 정리.

PRD §6.2/6.3 (시작·마감 푸시 AC). 운영 환경에서 `notification_prefs.start=true` ∧ `push_subscriptions=∅` 정합 깨짐 상태가 코드 흐름상 생성 가능함을 확인 — 본 plan 으로 invariant 복원.

## 영향 범위

- 변경 경로:
  - `src/lib/push/subscribe.ts` — `subscribeToPush` 제거, `syncBrowserSubscription` 신규
  - `src/lib/push/subscribe.spec.ts` — `subscribeToPush` describe 제거, `syncBrowserSubscription` describe 4 케이스 추가
  - `src/app/(app)/me/_components/push-settings.tsx` — import 교체, 분기 변경, ensureSubscription 재설계
  - `src/app/(app)/me/_components/push-settings.spec.tsx` — stale subscribed 케이스 추가, 분기 변경 검증
  - `src/lib/db/reads/notification-prefs.ts` — `DEFAULT_PREFS = {start:false, deadline:false}`
  - `supabase/migrations/0031_notification_prefs_default_off.sql` — 신규 (column default 변경)
  - `docs/adr/0013-notification-prefs-default-off.md` — 신규 (가드레일 §4: migration → ADR)
- 데이터/RLS 영향:
  - migration 1건 — `users.notification_prefs` column default 만 변경. 기존 row 데이터·RLS·인덱스 무변경. 신규 INSERT 부터 OFF.
- 외부 서비스: Web Push (브라우저 PushManager · iOS APNs) — API 호출 흐름 동일, idempotent reuse 만 추가.
- 재사용 후보:
  - `registerPushSubscription` Server Action (`me/_actions.ts`) — 그대로. upsert `onConflict:"endpoint"` 멱등.
  - `urlBase64ToUint8Array` 유틸 — 기존 함수 재사용.

## 작업 단계

1. **(RED) `src/lib/push/subscribe.spec.ts` 갱신** — 검증: `pnpm test src/lib/push/subscribe.spec.ts` 신규 케이스 실패 확인
   - 기존 `describe("subscribeToPush", ...)` 블록 제거
   - 신규 `describe("syncBrowserSubscription", ...)`:
     - 기존 sub 있음 → `subscribe()` 미호출, endpoint/keys 반환
     - 기존 sub 없음 → `subscribe()` 호출
     - incomplete endpoint/keys → throw `subscription_incomplete`
     - `!isPushSupported()` → throw `push_unsupported`
2. **(GREEN) `src/lib/push/subscribe.ts`** — 검증: 위 spec pass + `pnpm typecheck`
   - `subscribeToPush` export 제거
   - `syncBrowserSubscription(vapidPublicKey)` 추가:
     - `serviceWorker.ready` → `pushManager.getSubscription()` → 있으면 reuse, 없으면 `subscribe({userVisibleOnly,applicationServerKey})`
     - `toJSON()` validation → endpoint/keys 누락 시 throw
3. **(RED) `push-settings.spec.tsx` 갱신** — 검증: `pnpm test push-settings` 신규 케이스 실패 확인
   - `vi.mock("@/lib/push/subscribe", ...)` 에 `syncBrowserSubscription` mock 추가, `subscribeToPush` 제거
   - 기존 케이스 갱신: `subscribeToPush` → `syncBrowserSubscription`
   - 신규 케이스: **stale `initialSubscribedEndpoint != null` ∧ 토글 OFF→ON → `syncBrowserSubscription` 호출됨** (early-return + 분기 우회 둘 다 풀림 검증)
   - 신규 케이스: 권한 거부 throw → catch → prefs 롤백 + errorMsg
4. **(GREEN) `push-settings.tsx` ensureSubscription 재설계** — 검증: 위 spec pass
   - import: `subscribeToPush` → `syncBrowserSubscription`
   - `ensureSubscription` 내부:
     - `if (subscribed) return true` 제거
     - `await subscribeToPush(vapidPublicKey)` → `await syncBrowserSubscription(vapidPublicKey)`
   - `handlePrefChange` 분기:
     - `if (turningOn && !subscribed)` → `if (turningOn)` 변경
5. **`src/lib/db/reads/notification-prefs.ts`** — 검증: 기존 spec 또는 push-settings spec 으로 간접 검증
   - `DEFAULT_PREFS = {start:false, deadline:false}`
6. **`supabase/migrations/0031_notification_prefs_default_off.sql`** — 검증: `pnpm supabase db reset` (로컬) 후 `\d users` 또는 information_schema 로 default 변경 확인
   - `ALTER TABLE users ALTER COLUMN notification_prefs SET DEFAULT '{"start":false,"deadline":false}'::jsonb;`
   - down 스크립트 없음 (POC 단방향 정책)
7. **`docs/adr/0013-notification-prefs-default-off.md`** — `pnpm new adr notification-prefs-default-off` 로 scaffold 후 본문 작성
   - 컨텍스트: 정합 깨짐(prefs.true ∧ row=∅) + 신규 가입자 함정
   - 결정: column default OFF + DEFAULT_PREFS OFF
   - 결과: 신규 가입자 명시적 ON 시점에 iOS 권한 프롬프트 발생, 기존 사용자 무영향
   - 트레이드오프: 기존 가입자가 "처음 가입 시 자동 ON" 경험을 잃지만, 그건 정합 깨짐의 원인이었음

## 검증

```bash
pnpm typecheck
pnpm lint
pnpm test
```

migration 검증 (로컬):

```bash
pnpm supabase db reset
psql $LOCAL_DB_URL -c "SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='notification_prefs';"
```

수동 확인 항목:

- [ ] 모바일 viewport (DevTools iPhone) 에서 /me 토글 OFF→ON 동작
- [ ] stale state 시뮬레이션 — `initialSubscribedEndpoint` 가 있는 상태로 진입해 토글 OFF→ON → server row 생성 확인
- [ ] 신규 가입 시뮬레이션 (마이그레이션 적용 후 새 row INSERT) → `notification_prefs` 가 OFF 로 박힘 확인
- [ ] 기존 사용자 row 변경 없음 확인 (운영 데이터로 spot check)

## 리스크 / 미해결

- **`getSubscription` stale endpoint cycle**: 브라우저 sub 객체가 stale(서버 cleanup 후 잔존) 상태면 `syncBrowserSubscription` 이 reuse → register → 다음 dispatch 시 410 → cleanup → 다음 토글 시 같은 stale 반환 cycle 가능. 자연 해소 경로: iOS 시스템 알림 권한 토글 / PWA 재설치 / 명시 `unsubscribe()`. 후속 PR 에서 force-refresh 옵션 검토.
- **migration 적용 순서**: 0030 까지 production 적용된 상태로 가정. 본 0031 이 단순 column default 변경이라 데이터 손상 없음 (ALTER COLUMN DEFAULT 는 future row 만 영향). down 없음 (POC 정책) — 롤백 필요 시 0032 추가 migration 으로 처리.
- **stash 충돌 가능성**: 본 작업 종료 후 `fix/home-empty-state-no-challenges` 로 돌아가 `git stash pop` 시 `src/app/(app)/home/page.tsx` 가 develop fast-forward 로 변경됐으므로 충돌 가능. 해당 시점 사용자 판단으로 conflict 해소.
- **후속 (Out-of-scope)**:
  - **B3** `dispatchStartNotification` 의 actor 제외 — PRD §6 재확인 후 별도 PR
  - **B4** 권한 거부 시 iOS 설정 안내 UX 강화 — 별도 PR
  - **end-to-end 검증** — 친구가 새 챌린지에서 자연 인증 시 `notification_sent` 이벤트로 자동 확인
  - **isPushSupported 강화** — iOS standalone 검사 추가
  - **dropSubscription 분기 정리** — `if (!anyOn && subscribed)` → `if (!anyOn)` (zombie row 방지)
