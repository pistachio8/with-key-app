---
plan: 2026-05-21-push-subscription-state-sync
title: Push Subscription State Sync
author: pistachio8
date: 2026-05-21
status: draft
---

## 목표

- **G1**: `push-settings.tsx` 의 `ensureSubscription` 이 `pushManager.getSubscription()` 으로 브라우저 실제 구독을 진실 원천으로 사용, server `push_subscriptions` row 와 항상 silent 동기화. `if (subscribed) return true` early-return 제거 + `handlePrefChange` 분기 `if (turningOn && !subscribed)` → `if (turningOn)` 로 stale client state 우회 차단.
- **G2**: 신규 가입자 기본값을 OFF 로 변경.
  - `notification-prefs.ts` 의 `DEFAULT_PREFS` 를 `{start:false, deadline:false}` (UI fallback) + `users.notification_prefs` column default 를 `'{"start":false,"deadline":false}'::jsonb` 으로 migration. 기존 row 는 ALTER COLUMN DEFAULT 특성상 영향 없음.
- **G3**: `subscribeToPush` 제거 (호출처 1곳뿐 → dead code) 및 spec 정리.
- **G4**: G2 의 후속 — 신규 가입자가 OFF 로 시작하면 invite/[token] 안내 문구 "참여하면 바로 알림을 받아요" 가 거짓 약속이 됨. 문구 수정 + accept 직후 서버가 `prefs.start=false` 신호 보내면 toast("설정 열기" 액션) 노출.

PRD §6.2/6.3 (시작·마감 푸시 AC). 운영 환경에서 `notification_prefs.start=true` ∧ `push_subscriptions=∅` 정합 깨짐 상태가 코드 흐름상 생성 가능함을 확인 — 본 plan 으로 invariant 복원 + 신규 가입자 onboarding 가이드 추가.

## 영향 범위

- 변경 경로:
  - `src/lib/push/subscribe.ts` — `subscribeToPush` 제거, `syncBrowserSubscription` 신규
  - `src/lib/push/subscribe.spec.ts` — `subscribeToPush` describe 제거, `syncBrowserSubscription` describe 4 케이스 추가
  - `src/app/(app)/me/_components/push-settings.tsx` — import 교체, 분기 변경, ensureSubscription 재설계
  - `src/app/(app)/me/_components/push-settings.spec.tsx` — stale subscribed 케이스 추가, 분기 변경 검증
  - `src/lib/db/reads/notification-prefs.ts` — `DEFAULT_PREFS = {start:false, deadline:false}`
  - `supabase/migrations/0031_notification_prefs_default_off.sql` — 신규 (column default 변경)
  - `docs/adr/0013-notification-prefs-default-off.md` — 신규 (가드레일 §4: migration → ADR)
  - `src/app/(auth)/invite/[token]/_actions.ts` — `acceptInvite` 응답에 `notifPromptRequired: boolean` 추가 (server-side `fetchNotificationPrefs(user.id).start === false` 체크)
  - `src/app/(auth)/invite/[token]/_actions.spec.ts` — `fetchNotificationPrefs` mock + 케이스 2개 (true/false)
  - `src/app/(auth)/invite/[token]/_components/accept-form.tsx` — 성공 분기에서 `notifPromptRequired:true` 시 toast(action="설정 열기") 노출
  - `src/app/(auth)/invite/[token]/_components/accept-form.spec.tsx` — sonner mock 재구성 + 케이스 2개
  - `src/app/(auth)/invite/[token]/page.tsx:157` — 거짓 약속 문구 수정 ("바로 알림을 받아요" → "알림을 켜두면 받아볼 수 있어요")
- 데이터/RLS 영향:
  - migration 1건 — `users.notification_prefs` column default 만 변경. 기존 row 데이터·RLS·인덱스 무변경.
- 외부 서비스: Web Push (브라우저 PushManager · iOS APNs) — API 호출 흐름 동일.
- 재사용 후보:
  - `registerPushSubscription` Server Action (`me/_actions.ts`) — 그대로. upsert `onConflict:"endpoint"` 멱등.
  - `fetchNotificationPrefs` helper — `acceptInvite` 에서 재사용해 spec mock 간결화.
  - sonner `toast` + Toaster (root layout) — 이미 마운트되어 navigation 후에도 살아남음.

## 작업 단계

1. **(RED) `src/lib/push/subscribe.spec.ts` 갱신** — 검증: `pnpm test src/lib/push/subscribe.spec.ts`
2. **(GREEN) `src/lib/push/subscribe.ts`** — `subscribeToPush` 제거, `syncBrowserSubscription` 신규
3. **(RED) `push-settings.spec.tsx` 갱신** — stale subscribed 케이스, rollback 케이스
4. **(GREEN) `push-settings.tsx` ensureSubscription 재설계** — early-return + 분기 변경
5. **`src/lib/db/reads/notification-prefs.ts`** — `DEFAULT_PREFS` OFF
6. **`supabase/migrations/0031_notification_prefs_default_off.sql`** — column default OFF
7. **`docs/adr/0013-notification-prefs-default-off.md`** — ADR 작성
8. **`src/app/(auth)/invite/[token]/_actions.ts` + spec** — `acceptInvite` 응답에 `notifPromptRequired` 추가, `fetchNotificationPrefs(user.id)` 호출. spec 에 mock + 2 케이스
9. **`src/app/(auth)/invite/[token]/_components/accept-form.tsx` + spec** — toast 분기 추가 (action="설정 열기"). spec 에 sonner mock 재구성 + 2 케이스
10. **`src/app/(auth)/invite/[token]/page.tsx:157`** — 거짓 약속 문구 수정

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
- [ ] stale state 시뮬레이션 — `initialSubscribedEndpoint` 가 있는 상태에서 토글 OFF→ON → server row 생성 확인
- [ ] 신규 가입 시뮬레이션 (마이그레이션 적용 후 새 row INSERT) → `notification_prefs` 가 OFF 로 박힘 확인
- [ ] invite/[token] 진입 → 참여하기 → 다음 페이지에서 "알림을 켜 두면 더 좋아요" toast 노출 확인
- [ ] toast 의 "설정 열기" 클릭 시 /me 로 이동 확인
- [ ] 기존 사용자 (`prefs.start=true` 명시 박힘) 에서는 invite 수락 후 toast 안 뜸 확인

## 리스크 / 미해결

- **`getSubscription` stale endpoint cycle**: 브라우저 sub 객체가 stale 상태면 reuse → register → dispatch 시 410 → cleanup → 다음 토글 시 같은 stale 반환 cycle 가능. 자연 해소 경로: iOS 시스템 알림 권한 토글 / PWA 재설치 / 명시 `unsubscribe()`. 후속 PR 에서 force-refresh 옵션 검토.
- **toast UX**: 다음 페이지 (/pledge 등) 에서 사용자가 서명에 집중하느라 toast 를 놓칠 가능성. duration=10s 로 완화했으나 더 persistent 한 banner UX 는 후속 PR.
- **acceptInvite 의 server-side check 한계**: `prefs.start=false` 만 보고 toast 트리거. 정합 깨짐 상태(`prefs.start=true` ∧ row=∅) 사용자는 toast 안 뜸 — 그들은 본 PR 의 ensureSubscription 재설계로 /me 들렀을 때 자동 회복하지만, /me 까지 가도록 유도하는 추가 신호는 후속.
- **migration 적용 순서**: 0030 까지 production 적용된 상태로 가정. 본 0031 이 단순 column default 변경이라 데이터 손상 없음. down 없음 (POC 정책).
- **stash 충돌 가능성**: 본 작업 종료 후 `fix/home-empty-state-no-challenges` 로 돌아가 `git stash pop` 시 `src/app/(app)/home/page.tsx` 가 develop fast-forward 됐으므로 충돌 가능.
- **후속 (Out-of-scope)**:
  - **B3** `dispatchStartNotification` 의 actor 제외 — PRD §6 재확인 후 별도 PR
  - **B4** 권한 거부 시 iOS 설정 안내 UX 강화 — 별도 PR
  - **isPushSupported 강화** — iOS standalone 검사 추가
  - **dropSubscription 분기 정리** — `if (!anyOn && subscribed)` → `if (!anyOn)` (zombie row 방지)
  - **toast → persistent banner** — invite/수락 직후 /pledge 페이지에 banner 로 변경 검토
  - **정합 깨짐 사용자도 toast** — `notifPromptRequired = prefs.start === false || !hasActiveSubscription` 으로 강화
