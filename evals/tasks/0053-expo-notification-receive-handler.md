---
Task: EVAL-0053
Track: port
Kind: migration
Status: in_progress
Blocked-by: [task:EVAL-0052] — 토큰 등록이 완료되고 APNs/FCM credentials 가 준비돼야 실기기 수신 테스트가 유효하다. (RESOLVED 2026-06-30: EVAL-0052 done — PR#291 머지. APNs/FCM credentials 발급은 본 태스크 실기기 검증 셋업 범위)
Depends-on: [task:EVAL-0052] — 토큰 등록 capability 선행(착수 불가 게이트). (RESOLVED 2026-06-30: EVAL-0052 done)
Parent: docs/migration/00-rn-conversion-plan.md
---

# EVAL-0053: Expo 알림 수신 핸들러 — foreground/background/killed 상태 실기기 검증

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0053` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: A6 푸시·알림 (docs/migration/01-rn-mvp-prd.md §5.A A6) — TS SoT 없음, AT eval 흡수(05 §2 D10)
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-phase6-notifications` (WP3 — 수신 핸들러·딥링크 이동)

## Goal

RN 앱(apps/mobile)에서 Expo 알림이 foreground(앱 활성), background(홈 화면/다른 앱), killed(앱 종료) 세 상태 모두에서 수신된다. 알림 탭 시 `payload.targetUrl`(예: `/challenge/[id]`, `/challenge/[id]/action`)을 Expo Router 딥링크로 변환해 해당 화면으로 이동한다. PWA 의 Service Worker push handler(`public/service-worker.js`) 와 IndexedDB 적재는 건드리지 않는다.

## Source Files to Inspect

- `docs/migration/03-rn-migration-rules.md` §8 (Expo Notifications 상태별 처리·딥링크 규칙)
- `docs/migration/04-rn-architecture.md` §3 (Expo Router navigation·딥링크), §7 A9
- `docs/PRD.md` §6 (알림 카테고리·type·targetUrl 형식)
- `apps/web/public/service-worker.js` — Web Push handler·IDB 적재 로직(포팅 소스, 읽기 전용)
- `apps/web/src/lib/notifications/store.ts` — StoredNotification type·IDB 구조(포팅 소스)
- `apps/web/src/lib/push/send.ts` — PushPayload type(title·body·type·category·targetUrl·challengeId)
- `apps/mobile/src/app/(app)/_layout.tsx` — 앱 셸 레이아웃(핸들러 등록 위치 후보)
- `apps/mobile/src/capabilities/` — EVAL-0052 결과물(push-notification capability 신설 예정 경로)

## Target Files

- `apps/mobile/src/capabilities/` — push-notification/notification-handler.ts 신설(foreground/response 핸들러·딥링크 변환) — EVAL-0052 결과물 디렉토리에 추가
- `apps/mobile/src/app/(app)/_layout.tsx` — `Notifications.addNotificationReceivedListener` · `addNotificationResponseReceivedListener` 등록
- `apps/mobile/app.config.ts` — 알림 채널 설정(Android `notification.icon`·`color`·채널 ID 등)

## Requirements

- foreground: `Notifications.addNotificationReceivedListener` + `setNotificationHandler` 로 인앱 배너 표시.
- background/killed: OS 트레이 표시 → 탭 시 앱 열림.
- response listener: `data.targetUrl` → Expo Router `router.push` 변환(00 plan §10 route map).
- Quiet Hours 억제는 서버 dispatch 에서 처리 — 클라이언트 재구현 불필요.
- Android 알림 채널(`setNotificationChannelAsync`) 설정.
- start·deadline·friend_action·kudos_received 4종 실기기 수신 확인.

## Non-goals

- 알림 내역을 RN 로컬 저장소(AsyncStorage)에 저장하는 알림 센터 로직 — EVAL-0054 범위
- 알림 설정 on/off UI(notification_prefs) — EVAL-0055 범위
- PWA Service Worker·IndexedDB 수정 — 웹 경로 보존
- EAS Build production 배포·App Store 심사 — Phase 8 범위

## Acceptance Criteria

| 기준                                           | 검증 방법                                            |
| ---------------------------------------------- | ---------------------------------------------------- |
| foreground 핸들러                              | \_layout.tsx addNotificationReceivedListener 존재    |
| response 핸들러(탭→딥링크)                     | 단위 테스트: targetUrl → router path 변환(jest-expo) |
| Android 채널                                   | setNotificationChannelAsync 호출 확인                |
| start·deadline·friend_action·kudos 실기기 수신 | 4종 실기기 수동 확인(EVAL-0052 환경 전제)            |
| TypeScript/ESLint                              | `pnpm -r typecheck && pnpm -r lint`                  |
| harness 추적성                                 | `pnpm harness:check`                                 |

## Verification Commands

```bash
pnpm -r typecheck && pnpm -r lint
pnpm test -- "src/capabilities/push-notification"
pnpm harness:check
pnpm validate:docs
# 실기기(수동): EAS dev build → start/deadline/friend_action/kudos_received 4종 수신 확인
```

## Expected Output Summary

핸들러 등록 위치, foreground/background/killed 처리 방식, targetUrl→Expo Router 변환 로직, Android 채널 설정, 실기기 4종 수신 결과를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. New folder structure? No.
2. New naming convention? notification-handler.ts 파일명 — drift-reports 노트.
3. New dependency? 없음(expo-notifications EVAL-0052에서 도입).
4. Verification commands changed? 실기기 수동 단계 추가 — drift-reports 노트.
5. Harness instructions outdated? 완료 시 판단.
6. `.agents/` update needed? → yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- foreground/background/killed 핸들러 코드 완성 + 4종 push 실기기 수신 성공 + `pnpm harness:check` 통과.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages 로 분할.
