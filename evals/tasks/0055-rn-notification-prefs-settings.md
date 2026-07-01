---
Task: EVAL-0055
Track: port
Kind: migration
Status: in_progress
Blocked-by: [task:EVAL-0052] — 토큰 등록 capability 가 완성돼야 알림 설정 화면에서 prefs 변경→재등록·해제 흐름을 구현할 수 있다. (RESOLVED 2026-06-30: EVAL-0052 done — PR#291 머지)
Depends-on: [task:EVAL-0052] — 토큰 등록 capability 선행(착수 불가 게이트). (RESOLVED 2026-06-30: EVAL-0052 done)
Parent: docs/migration/00-rn-conversion-plan.md
---

# EVAL-0055: RN 알림 설정 화면 — notification_prefs 포팅 + 권한 요청 UX

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0055` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: A6 푸시·알림 (docs/migration/01-rn-mvp-prd.md §5.A A6) / POC PRD §6.3 AC-6 (알림 종류별 on/off) / PRD §6.3 AC-7 (권한 요청 모달) — TS SoT 없음, AT eval 흡수(05 §2 D10)
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-phase6-notifications` (WP5 — 알림 설정 화면 RN 포팅)

## Goal

PWA 의 `/me` 화면 내 `push-settings.tsx`(notification_prefs·등록·해제)를 RN `/(app)/(tabs)/me.tsx` 화면의 알림 설정 섹션으로 포팅한다. `updateNotificationPrefs`(13.2 #24 RN direct client)가 Supabase `users.notification_prefs` 를 업데이트하고, 알림 ON 토글 시 권한이 없으면 `Notifications.requestPermissionsAsync()` 를 재호출한다. POC PRD §6.3 AC-6(종류별 on/off)과 AC-7(권한 요청 모달)을 RN 에서 충족한다.

## Source Files to Inspect

- `docs/PRD.md` §6.3 AC-6(알림 종류별 on/off)·AC-7(권한 요청 1회 모달)
- `apps/web/src/app/(app)/me/_actions.ts` — updateNotificationPrefs(#24 RN direct client)·registerPushSubscription(#21)·unregisterPushSubscription(#22)·clearMyPushSubscriptions(#23)
- `apps/web/src/app/(app)/me/_components/push-settings.tsx` — 기존 푸시 설정 UI(포팅 소스)
- `apps/web/src/app/(app)/me/_components/notification-card.tsx` — 알림 설정 카드 UI(포팅 소스)
- `packages/domain/src/validators/push.ts` — notificationPrefsSchema(start·deadline·kudos 3키)
- `apps/mobile/src/app/(app)/(tabs)/me.tsx` — 프로필 화면(설정 섹션 추가 위치)
- `apps/mobile/src/capabilities/` — EVAL-0052 결과물(push-notification/register-token.ts 신설 예정 경로)
- `docs/migration/00-rn-conversion-plan.md` §13.2 #21·#22·#23·#24 (RN direct client 분류)

## Target Files

- `apps/mobile/src/features/profile/` — notification-prefs.ts 신설(updateNotificationPrefs Supabase direct), NotificationSettingsSection.tsx 신설(토글 3개 + 권한 상태 표시)
- `apps/mobile/src/app/(app)/(tabs)/me.tsx` — NotificationSettingsSection 삽입

## Requirements

- `notificationPrefsSchema`(start·deadline·kudos) 3종 토글 UI.
- 토글 변경 시 Supabase `users.notification_prefs` 직접 update(RLS self-row).
- 알림 전체 ON 토글 시: 권한 미허용이면 `Notifications.requestPermissionsAsync()` 재호출. 거부 시 설정 앱 안내 딥링크(`Linking.openSettings()`).
- 알림 전체 OFF 토글 시: `device_push_tokens.disabled_at = NOW()` 또는 EVAL-0052 `unregister-token.ts` 호출.
- POC PRD §6.3 AC-7: 첫 권한 요청은 EVAL-0052 로그인 직후 1회. 설정 화면에서의 재요청은 거부 후 안내만.
- 기존 PWA `push_subscriptions` write 경로(`registerPushSubscription`·`unregisterPushSubscription`)는 변경하지 않는다.
- `notificationPrefsSchema` 는 domain 패키지에서 재사용 — 신규 정의 금지.

## Non-goals

- 알림 수신 핸들러·수신 화면 — EVAL-0053·0054 범위
- 새 알림 종류(start·deadline·kudos 외 추가) — PRD AC 신설 금지
- PWA me 화면 수정
- Kakao 알림톡 설정 — POC 범위 외(PRD §6.3 AC-1)

## Acceptance Criteria

| 기준                           | 검증 방법                                                              |
| ------------------------------ | ---------------------------------------------------------------------- |
| notification_prefs 3종 토글 UI | `pnpm test -- "src/features/profile/NotificationSettingsSection"`      |
| Supabase update(RLS self-row)  | `pnpm test -- "src/features/profile/notification-prefs"` (단위 테스트) |
| 권한 미허용 시 재요청 흐름     | 단위 테스트: requestPermissionsAsync mock 반환 값별 분기 확인          |
| 거부 시 설정 앱 안내           | Linking.openSettings 호출 확인(mock)                                   |
| 알림 OFF 시 토큰 무효화        | unregister-token.ts 호출 확인(mock)                                    |
| domain validator 재사용        | import from @withkey/domain 확인                                       |
| TypeScript 이상 없음           | `pnpm -r typecheck`                                                    |
| ESLint 이상 없음               | `pnpm -r lint`                                                         |
| harness 추적성                 | `pnpm harness:check`                                                   |

## Verification Commands

```bash
pnpm -r typecheck && pnpm -r lint
pnpm test -- "src/features/profile"
pnpm harness:check
pnpm validate:docs
```

## Expected Output Summary

NotificationSettingsSection 컴포넌트 구조(3종 토글·권한 재요청·거부 안내), updateNotificationPrefs RN direct client 구현, 알림 OFF 토큰 무효화 연결, domain validator 재사용 확인, 기존 PWA 경로 보존을 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? No (features/profile 기존 경로 확장).
2. Did this task introduce a new naming convention? NotificationSettingsSection.tsx. drift-reports 노트.
3. Did this task introduce a new dependency? 없음.
4. Did this task change verification commands? No.
5. Did this task reveal that the current harness instructions are outdated? 판단 필요.
6. Should any `.agents/` document be updated? → yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- 3종 토글 UI + prefs update + 권한 재요청 + 토큰 무효화 단위 테스트 green + `pnpm harness:check` 통과.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages 로 분할.
