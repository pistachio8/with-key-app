---
Task: EVAL-0052
Track: port
Kind: migration
Status: blocked
Blocked-by: [task:EVAL-0051] — device_push_tokens migration + ADR 가 confirmed 되어야 RN 클라이언트가 upsert 할 테이블이 확정된다.
Depends-on: [task:EVAL-0051] — ADR·migration 선행 필요(착수 불가 게이트).
Parent: docs/migration/00-rn-conversion-plan.md
---

# EVAL-0052: Expo 푸시 토큰 등록·해제 RN 클라이언트 + BFF endpoint

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0052` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: A6 푸시·알림 (docs/migration/01-rn-mvp-prd.md §5.A A6) — TS SoT 없음, AT eval 흡수(05 §2 D10)
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-phase6-notifications` (WP2 — RN 클라이언트 토큰 등록)

## Goal

RN 앱(apps/mobile)이 로그인 직후 `Notifications.requestPermissionsAsync()` 로 권한을 요청하고, 허용 시 `Notifications.getExpoPushTokenAsync()` 로 Expo push token 을 획득해 `device_push_tokens` 테이블에 upsert 한다. upsert 는 RN direct client(RLS self-write) 또는 BFF endpoint 로 수행한다(EVAL-0051 ADR 결정에 따름). 로그아웃·앱 재설치 시 토큰 무효화(disabled_at 갱신 또는 delete) 정책이 구현된다. PWA 의 `registerPushSubscription`(Web Push VAPID) 경로는 건드리지 않는다.

## Source Files to Inspect

- `docs/migration/03-rn-migration-rules.md` §8 (Expo Notifications 권장 패턴)
- `docs/migration/04-rn-architecture.md` §7 A9 (device_push_tokens RLS: self read/insert/update)
- `apps/web/src/app/(app)/me/_actions.ts` — registerPushSubscription · unregisterPushSubscription · clearMyPushSubscriptions (포팅 소스 — 13.2 #21·#22·#23 RN direct client 분류)
- `packages/domain/src/validators/push.ts` — notificationPrefsSchema(포팅 재사용)
- `apps/mobile/src/services/api/bff-client.ts` — BFF 호출 패턴(필요 시)
- `apps/mobile/src/services/supabase/` — Supabase client 패턴
- `apps/mobile/src/features/profile/` — me 화면 feature 경로(upsert 호출 위치 후보)

## Target Files

- `apps/mobile/src/capabilities/` — 신설 `push-notification/` 디렉토리: `register-token.ts`(토큰 획득·upsert), `unregister-token.ts`(로그아웃·삭제)
- `apps/mobile/src/app/(app)/_layout.tsx` — 토큰 등록 훅 호출
- `apps/web/src/app/api/` — BFF endpoint 필요 시 `push/route.ts` 신설

## Requirements

- `expo-notifications` 패키지가 `apps/mobile/package.json` 에 추가된다.
- 앱 권한(`app.config.ts` permissions) 에 iOS `NSUserNotificationsUsageDescription` · Android 알림 권한이 선언된다.
- 로그인 완료 후(홈 이동 직전 또는 직후) `Notifications.requestPermissionsAsync()` 1회 호출. 거부 시 조용히 무시(재요청 강요 금지).
- 허용 시 `Notifications.getExpoPushTokenAsync({ projectId })` 로 Expo push token 획득.
- `device_push_tokens` 에 `(user_id, device_id)` 복합 upsert — 동일 기기 재설치 시 토큰 갱신.
- `device_id` 는 `expo-device` `Device.osBuildId` 또는 SecureStore 에 저장된 앱 생성 UUID 사용.
- 로그아웃 시 `disabled_at = NOW()` 갱신 또는 row delete(ADR 결정에 따름).
- 기존 PWA `push_subscriptions` write 경로는 변경하지 않는다.

## Non-goals

- Expo 알림 수신 핸들러(foreground/background/killed 상태 처리) — EVAL-0053 범위
- 알림 센터 화면(notification list) — EVAL-0054 범위
- 알림 설정 on/off UI — EVAL-0055 범위
- EAS 빌드 프로파일 설정·APNs/FCM credentials 발급 — 인프라 선행(EVAL-0053 첨부 이슈)
- 실기기 push 수신 end-to-end — EVAL-0053 완료 후 확인

## Acceptance Criteria

| 기준 | 검증 방법 |
|---|---|
| expo-notifications 설치 | `apps/mobile/package.json` devDependencies/dependencies 확인 |
| iOS/Android 권한 선언 | `app.config.ts` `permissions` 배열 확인 |
| 토큰 획득·upsert 로직 | `pnpm test -- "src/capabilities/push-notification"` (단위 테스트) |
| 로그아웃 시 토큰 무효화 | logout 시나리오 단위 테스트 |
| 기존 Web Push 경로 회귀 없음 | `pnpm -r test -- "src/lib/push/"` green |
| TypeScript 이상 없음 | `pnpm -r typecheck` |
| ESLint 이상 없음 | `pnpm -r lint` |
| harness 추적성 | `pnpm harness:check` |

## Verification Commands

```bash
pnpm -r typecheck && pnpm -r lint
pnpm test -- "src/capabilities/push-notification"
pnpm test -- "src/lib/push/"
pnpm harness:check
pnpm validate:docs
```

## Expected Output Summary

expo-notifications 설치 확인, capability 신설 파일 목록(register-token.ts·unregister-token.ts), upsert 방식(RN direct client vs BFF), device_id 전략(SecureStore UUID 등), 로그아웃 무효화 정책, 기존 Web Push 경로 보존을 한국어로 요약한다. 실기기 end-to-end(EVAL-0053 완료 후)는 별도 후속으로 명시한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? Yes — `capabilities/push-notification/` 신설. drift-reports 노트.
2. Did this task introduce a new naming convention? register-token/unregister-token 파일명 컨벤션. drift-reports 노트.
3. Did this task introduce a new dependency? Yes — expo-notifications. drift-reports 노트.
4. Did this task change verification commands? No.
5. Did this task reveal that the current harness instructions are outdated? 판단 필요.
6. Should any `.agents/` document be updated? → yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- expo-notifications 설치 + 권한 선언 + 토큰 upsert·무효화 단위 테스트 green + `pnpm harness:check` 통과.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages 로 분할.
