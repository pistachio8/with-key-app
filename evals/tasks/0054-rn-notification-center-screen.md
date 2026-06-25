---
Task: EVAL-0054
Track: port
Kind: migration
Status: blocked
Blocked-by: [task:EVAL-0053] — 수신 핸들러가 완성돼야 알림 내역을 로컬에 저장할 수 있다(핸들러 콜백에서 저장).
Depends-on: [task:EVAL-0053] — 알림 수신 핸들러 선행(착수 불가 게이트).
Parent: docs/migration/00-rn-conversion-plan.md
---

# EVAL-0054: RN 알림 센터 화면 — IDB 알림 스토어를 AsyncStorage 로 포팅

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0054` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: A6 푸시·알림 (docs/migration/01-rn-mvp-prd.md §5.A A6) / POC PRD §6 알림센터 (`notifications` 라우트) — TS SoT 없음, AT eval 흡수(05 §2 D10)
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-phase6-notifications` (WP4 — 알림 센터 화면 RN 포팅)

## Goal

PWA 의 `/notifications` 화면(IndexedDB 기반 알림 카테고리 탭)을 RN `/(app)/(tabs)/notifications.tsx` 화면으로 포팅한다. `StoredNotification` 레코드를 `@react-native-async-storage/async-storage`(또는 `expo-sqlite`)에 저장하고, 카테고리 탭 4개(전체·리마인더·친구 인증·벌금)를 RN 화면으로 렌더한다. 알림 탭 시 `targetUrl` 로 Expo Router 이동한다. Bottom Tabs 에 `notifications` 탭을 추가한다(lazy 추가 — 04 §5.1).

## Source Files to Inspect

- `docs/PRD.md` §6.2 (알림 카테고리 4종·StoredNotification type·IDB 설계)
- `apps/web/src/lib/notifications/store.ts` — StoredNotification interface·listNotifications·markAllRead·markRead·unreadCount (포팅 소스)
- `apps/web/src/app/(app)/notifications/page.tsx` — 알림 센터 라우트 UI(포팅 소스)
- `apps/mobile/src/app/(app)/(tabs)/_layout.tsx` — Bottom Tabs(notifications 탭 추가 위치)
- `apps/mobile/src/capabilities/` — EVAL-0053 결과물(push-notification/notification-handler.ts 신설 예정 경로)
- `docs/migration/03-rn-migration-rules.md` §11 (IndexedDB→AsyncStorage 매핑)

## Target Files

- `apps/mobile/src/capabilities/` — push-notification/notification-store.ts 신설: AsyncStorage 기반 StoredNotification CRUD
- `apps/mobile/src/app/(app)/(tabs)/_layout.tsx` — notifications 탭 추가
- `apps/mobile/src/app/(app)/(tabs)/` — notifications.tsx 신설: 알림 센터 화면(카테고리 탭 4개·카드 목록·탭→이동)

## Requirements

- `@react-native-async-storage/async-storage` 또는 `expo-sqlite` 로 `StoredNotification` 저장·조회 구현.
- 저장 키: `notifications` JSON 배열 (또는 SQLite `notifications` 테이블).
- 알림 수신 시(`addNotificationReceivedListener` 콜백에서) `save(notification)` 호출.
- 알림 센터 화면: 카테고리 탭 4개(전체·리마인더·친구 인증·벌금) + `FlatList` 카드 렌더.
- 카드 탭 → `router.push(targetUrl)` + `markRead(id)`.
- 화면 진입 시 `markAllRead()` 또는 "전체 읽음" CTA.
- Bottom Tabs `_layout.tsx` 에 `notifications` 탭 추가(04 §5.1 lazy 생성 리듬).
- 미읽음 배지 카운트(`unreadCount`)를 탭 아이콘에 표시.

## Non-goals

- 알림 설정 on/off(notification_prefs) — EVAL-0055 범위
- 서버 notification 테이블 도입(POC는 클라이언트 스토어 유지, 00 plan §4)
- PWA `/notifications` 화면 수정
- Android/iOS 별도 알림 채널 UI

## Acceptance Criteria

| 기준 | 검증 방법 |
|---|---|
| notification-store.ts 단위 테스트 | `pnpm test -- "src/capabilities/push-notification/notification-store"` green |
| 카테고리 탭 4개 렌더 | 컴포넌트 단위 테스트(jest-expo) 또는 수동 확인 |
| 탭 이동 후 markRead 호출 | 단위 테스트: router.push + markRead 호출 확인 |
| Bottom Tabs 에 notifications 추가 | `apps/mobile/src/app/(app)/(tabs)/_layout.tsx` Tabs.Screen name="notifications" 존재 |
| 미읽음 배지 표시 | 단위 테스트: unreadCount > 0 시 배지 렌더 |
| TypeScript 이상 없음 | `pnpm -r typecheck` |
| ESLint 이상 없음 | `pnpm -r lint` |
| harness 추적성 | `pnpm harness:check` |

## Verification Commands

```bash
pnpm -r typecheck && pnpm -r lint
pnpm test -- "src/capabilities/push-notification/notification-store"
pnpm test -- "src/app/\\(app\\)/\\(tabs\\)/notifications"
pnpm harness:check
pnpm validate:docs
```

## Expected Output Summary

notification-store.ts 스토리지 선택(AsyncStorage vs SQLite) 근거, 카테고리 탭 구현 방식, 수신 핸들러 연결 방식, Bottom Tabs 탭 추가, 미읽음 배지, 기존 PWA 알림 센터와의 구조 차이를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? No (capabilities/push-notification 확장).
2. Did this task introduce a new naming convention? notification-store.ts 파일명. drift-reports 노트.
3. Did this task introduce a new dependency? 가능성 있음 — @react-native-async-storage/async-storage 또는 expo-sqlite. drift-reports 노트.
4. Did this task change verification commands? No.
5. Did this task reveal that the current harness instructions are outdated? 판단 필요.
6. Should any `.agents/` document be updated? → yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- notification-store.ts CRUD + 알림 센터 화면 + Bottom Tabs 탭 추가 + 단위 테스트 green + `pnpm harness:check` 통과.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages 로 분할.
