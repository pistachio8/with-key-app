# Spec: 친구 인증 완료 푸시 재설계

- **Date:** 2026-05-29
- **Author:** pistachio8
- **Status:** Accepted
- **관련 PRD:** §6.2 / §6.4 / §9.1
- **관련 plan:** docs/superpowers/plans/2026-05-29-friend-completion-push.md

## 문제

친구에게 가는 푸시가 "인증 화면 진입(mount)" 시점에 "{name}님이 운동을 시작했어요!"로 발송되고, 정작 사진 인증 **완료** 시에는 그룹원 푸시가 없었다. PRD §6.4가 정의한 `friend_action`(인증 완료) 푸시가 미구현이었고, `meal`(식단) 등 비-운동 활동에도 "운동" 문구가 노출됐다.

## 결정

1. 트리거를 인증 화면 진입(`markActionStarted`) → 사진 제출 완료(`submitActionLog` 성공 후 `after()`)로 이동.
2. `action_started` 분석 이벤트와 1일 1회 idempotency는 진입 시점에 유지(분석 dedupe). 푸시 dispatch만 분리.
3. 완료 푸시는 매 제출마다 발송하되, 그 날 첫 인증(`todayWasNewDay`)/재제출 문구를 분기. 활동 종류별 title.
4. `notification_sent.type`·`notification_opened.type` enum에 `friend_action` 추가.
5. 옵트인 게이팅은 기존 `notification_prefs.start` 키 재사용(신규 키·DB migration 불필요). 알림센터 분류는 `category:"friend_action"` 유지. → 게이팅 축과 분류 축은 독립.

## Analytics 변경 (PRD §9.1 동기화)

- `notification_sent.props.type`: `start | deadline | kudos_received` → `start | deadline | friend_action | kudos_received`
- `notification_opened.props.type`: `start | deadline` → `start | deadline | friend_action`
- 완료 푸시의 `notification_sent`는 게이팅 키(`start`)와 무관하게 `type:"friend_action"`으로 기록(dispatch의 `trackType` 분리).

## 대안 (기각)

- **활동 중립 단일 문구**: 단순하지만 식단/요가 등에서 정보량 부족. 활동별 분기 채택.
- **신규 `friend_action` prefs 키 추가**: zod SoT 변경 + 기존 user row JSONB 기본값 마이그레이션 필요. POC 범위 초과 → `start` 재사용.
- **제출당이 아닌 1일 1회 발송**: "쟤 했네 나도" 사회적 압박 효과 약화. 재제출 문구 분기로 스팸감 완화하며 매 제출 발송 채택.

## 범위 밖

- `/api/push/opened` 라우트 부재(기존 죽은 경로) — 별도 이슈.
