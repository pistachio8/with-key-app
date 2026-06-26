---
Task: EVAL-0051
Track: port
Kind: migration
Status: done
Parent: docs/migration/00-rn-conversion-plan.md
---

# EVAL-0051: device_push_tokens ADR + migration + dispatch sender Web Push→Expo 교체

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0051` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: A6 푸시·알림 (docs/migration/01-rn-mvp-prd.md §5.A A6) — TS SoT 없음(Phase 6 Engineering Story 미작성), AT eval 흡수(05 §2 D10)
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-phase6-notifications` (WP1 — 서버측 토큰 모델·dispatch 교체)

## Goal

`device_push_tokens` 신설 ADR 이 docs/adr/ 에 accepted 상태로 작성되고, 대응 Supabase migration(`supabase/migrations/005X_device_push_tokens.sql`)이 작성된다. 기존 `push_subscriptions`(Web Push)는 cutover 까지 web 잔존하고, `apps/web/src/lib/push/dispatch.ts` 의 sender 로직이 `device_push_tokens` 에서 Expo push token 을 조회해 Expo Push Service(`https://exp.host/--/api/v2/push/send`)로 발송하도록 교체된다. 실기기에서 start·deadline·friend_action·kudos_received 발송이 Expo 토큰 대상으로 동작한다.

## Source Files to Inspect

- `docs/migration/00-rn-conversion-plan.md` §13.4 D-2 (push token 모델 ADR 결정 채무)
- `docs/migration/03-rn-migration-rules.md` §8 (Push Notification 규칙·권장 테이블 shape)
- `docs/migration/04-rn-architecture.md` §7 A9 (device_push_tokens 신설·RLS·dispatch 교체 상세)
- `apps/web/src/lib/push/dispatch.ts` — 기존 Web Push sender·loadTargets·safeSend 로직
- `apps/web/src/lib/push/send.ts` — sendPush(endpoint/p256dh/auth→webpush.sendNotification)
- `supabase/migrations/` — 현재 마지막 번호 확인 후 append-only 채번
- `docs/adr/0013-notification-prefs-default-off.md` · `docs/adr/0017-kudos-push-log-dedup-table.md` — 기존 push ADR 패턴
- `packages/domain/src/validators/push.ts` — notificationPrefsSchema(start·deadline·kudos 키)

## Target Files

- `docs/adr/` — 신설 ADR(NNNN-rn-push-token-model.md): device_push_tokens vs push_subscriptions 확장 결정
- `supabase/migrations/` — 신설 migration(005X_device_push_tokens.sql): device_push_tokens DDL + RLS
- `apps/web/src/lib/push/send.ts` — Expo sender(`sendExpoPush`) 추가 또는 교체
- `apps/web/src/lib/push/dispatch.ts` — loadTargets 에 device_push_tokens 조회 분기 추가

## Requirements

- `device_push_tokens` migration: `id·user_id·device_id·expo_push_token·platform(ios|android)·app_version·last_seen_at·disabled_at`. RLS: self read/insert/update.
- 기존 `push_subscriptions`(Web Push)는 삭제하지 않음 — cutover 까지 web 잔존.
- `dispatch.ts` loadTargets: `device_push_tokens` 에서 expo_push_token 추가 조회 → Expo Push Service 발송(기존 Web Push 경로 유지).
- Expo push: `https://exp.host/--/api/v2/push/send` HTTP POST(expo-server-sdk 또는 직접 fetch).
- Quiet Hours · notification_prefs 옵트인 게이팅은 기존 로직 그대로.
- start·deadline·friend_action·kudos_received 4종 실기기 수신 확인(EVAL-0052·0053 완료 후).

## Non-goals

- RN 클라이언트 측 토큰 등록 로직 — EVAL-0052 범위
- Expo 알림 수신 핸들러(foreground/background/killed) — EVAL-0053 범위
- 알림 센터 화면(AsyncStorage) — EVAL-0054 범위
- 알림 설정 화면(notification_prefs RN) — EVAL-0055 범위
- `push_subscriptions` 삭제·마이그레이션 — cutover Phase 8 범위
- EAS 빌드 설정·APNs credentials 발급 — EVAL-0053 선행조건으로 별도 다룸

## Acceptance Criteria

| 기준                    | 검증 방법                                                          |
| ----------------------- | ------------------------------------------------------------------ |
| ADR accepted 상태       | `docs/adr/NNNN-rn-push-token-model.md` 존재 + accepted             |
| migration append-only   | `005X_device_push_tokens.sql` 번호 최대+1                          |
| dispatch Expo 분기      | `pnpm test -- src/lib/push/` green(기존 + Expo sender 단위 테스트) |
| 기존 Web Push 회귀 없음 | 위 test 통과                                                       |
| TypeScript/ESLint       | `pnpm typecheck && pnpm lint`                                      |
| harness 추적성          | `pnpm harness:check`                                               |

## Verification Commands

```bash
pnpm typecheck && pnpm lint
pnpm test -- "src/lib/push/"
pnpm harness:check
pnpm validate:docs
```

## Expected Output Summary

ADR 번호·제목, migration 파일명, dispatch 수정 범위(loadTargets Expo 분기·sendExpoPush 신설), 기존 Web Push 경로 보존 확인을 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. New folder structure? No.
2. New naming convention? sendExpoPush 함수명 신설 — drift-reports 노트.
3. New dependency? expo-server-sdk 또는 직접 fetch — drift-reports 노트.
4. Verification commands changed? No.
5. Harness instructions outdated? 완료 시 판단.
6. `.agents/` update needed? → yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- ADR accepted + migration 파일 신설 + dispatch Expo 발송 경로 + 기존 Web Push 회귀 없음 + `pnpm harness:check` 통과.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages 로 분할.
