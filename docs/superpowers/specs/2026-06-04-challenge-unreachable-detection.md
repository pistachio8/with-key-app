---
spec: 2026-06-04-challenge-unreachable-detection
title: Challenge Unreachable Detection
author: pistachio8
date: 2026-06-04
status: draft
---

## Summary

1주(7일)짜리 "매일 인증" 챌린지에서 사용자가 인증을 멈춰도 **챌린지 실패가 감지되지 않던** 문제를 고친다.

원인은 로직 버그가 아니라 모델의 시간 의미였다. 주 단위 누적 모델(spec 2026-06-02-weekly-penalty-accrual)은 **끝난 주(elapsed week)만** 정산한다(`confirmedPenalty` → `elapsedWeeks`). 1주짜리 챌린지는 주가 하나뿐이고 그 주는 `end_at` 이 지나야 elapsed 가 되므로, 진행 중에는 — 이미 목표 달성이 수학적으로 불가능해도 — "위험(at-risk)"으로만 보였다. 현황판 링은 "N번 더 채우면 0원"이라며 회복 가능한 척했다.

이 spec 은 "회복 불가(unreachable)"라는 파생 표시 상태를 추가하고(확정 누적 회계는 불변), 인증을 멈춘 give-up 케이스를 위해 일 경계 푸시 통지를 추가한다. 정산 SoT(`confirmedPenalty`)는 그대로 둔다 — 표시·통지만 바꾼다.

## Why

- 매일 인증(goal_count=7·duration_days=7) 챌린지를 1회만 인증하고 방치한 dogfood 참가자(b088ae54)가 "실패가 안 잡힌다"고 보고. 실측: day6 기준 done 1·남은 2일이라 목표 7 달성 불가지만 화면은 "6번 더 채우면 0원".
- give-up(인증 중단)은 제출이 없어 결과 모달로 못 잡는다 — unreachability 는 **시간(일 경계)**으로 결정되지 제출로 결정되지 않는다(`shortfall = goal − done` 은 인증할수록 줄어듦). 따라서 제출 트리거 모달은 구조적으로 give-up 을 감지할 수 없다.
- 기존 §10-D "실패" 모달(action-result-dialog 의 `failed` variant)은 #35 결정 대기로 dormant dead code 였고, "오늘 인증 실패"(일 단위) 프레이밍이라 주 단위 모델과 맞지 않았다.
- 확정 누적(`confirmedPenalty`)은 단조 증가·끝난 주 한정 불변식과 ADR-0030(조기 종료 시 미완 주 미부과)을 깨면 안 된다 — 표시 전용으로 분리해 회계를 보존.

## Impact Scope

### 변경 경로

- 수정:
  - `src/lib/challenge/weekly.ts` — `CurrentWeekStatus.unreachable` 필드, `currentWeekStatus`·`buildWeekChips` 반영, `unreachableParticipants` 헬퍼(순수) 추가
  - `src/app/(app)/challenge/[id]/_components/week-ring.tsx` — unreachable 카피·색
  - `src/app/(app)/challenge/[id]/action/_components/action-result-dialog.tsx` — dormant `failed` variant/`FailedBody` 제거
  - `src/lib/analytics/track.ts` · `src/lib/analytics/schema.ts` — `notification_sent.type` 에 `goal_unreachable` + 선택 `week` prop
  - `src/lib/push/dispatch.ts` — `dispatchGoalUnreachableNotification` 추가
  - `src/app/api/cron/deadline-push/route.ts` — running 챌린지 unreachable 스캔·통지
  - `docs/PRD.md §9.1` — `notification_sent` 행 동기화

### src/ 영향

표시(현황판 링·주차 칩) + 일 경계 푸시. 확정 누적 금액(`confirmedPenalty`·`computeAccruedPot`·홈 "내 벌금")은 **무변경**.

### Supabase / RLS / migration 영향

없음. dedup 은 기존 `events` 테이블(`notification_sent`)을 props 매칭으로 재사용 — 새 컬럼·테이블·migration 없음.

### 외부 서비스

Web Push — 기존 `deadline` 옵트인 키 재사용, payload.type 은 알림센터 분류용 기존 `penalty_added`(category `penalty`) 재사용. send.ts·SW 불변.

## Design

### C1. unreachable 판정 (표시 SoT)

`currentWeekStatus` 에 `unreachable = shortfall > 0 && daysLeftInWeek < shortfall` 추가. penalty 무관(0원 챌린지도 "달성 불가" 판정). `imminent`(`daysLeftInWeek <= shortfall`, penalty 게이팅)의 **진부분집합**이다.

- `imminent`: 무여유(남은 가능일 == 부족분 포함) — 회복 가능성 희박하나 이론상 가능.
- `unreachable`: 회복 불가(남은 가능일 < 부족분) — 수학적으로 달성 불가.

**왜 `<` (strict)**: 남은 가능일 == 부족분이면 남은 날을 모두 채워 달성 가능 → 아직 실패 아님.

### C2. 표시 (회계 불변)

- WeekRing: unreachable 이면 헤드라인 "이번 주 목표 달성 불가", 금액선 "종료 시 +N 확정"(기존 "이대로면 +N" 대체), 링 stroke warn 색. 금액선은 `atRiskAmount > 0` 게이팅(0원 챌린지는 카피만).
- buildWeekChips: 진행 중인 주라도 unreachable 이면 칩 상태 `missed`(경고색). 동일 규칙을 칩 루프에서 인라인 계산.
- `confirmedPenalty`/`computeAccruedPot`/`potTotal`/홈 "내 벌금"은 **그대로 끝난 주만** — 진행 중 1주 챌린지는 여전히 0(end_at 경과 시 정산이 확정).

**왜 표시만**: 단조 불변식과 ADR-0030(조기 종료 미완 주 미부과) 보존. unreachable 주를 즉시 회계 산입하면 조기 종료가 미완 주를 부과하게 되어 ADR 충돌.

### C3. give-up 통지 (일 경계 푸시)

`deadline-push` cron(매일 09:00 KST)에 스캔 추가: `status='active' AND end_at > now AND start_at IS NOT NULL` 인 running 챌린지의 참가자별 `currentWeekStatus.unreachable` 을 `unreachableParticipants`(순수)로 산출 → `dispatchGoalUnreachableNotification`.

- dedup: `events(notification_sent · user_id · props{type:'goal_unreachable', challengeId, week})` 1건이라도 있으면 skip → **(challenge,user,week) 당 정확히 1회**. cron 단일 실행이라 race 없음.
- 0 인증 참가자(done 0)도 잡으려 `participantIds` 를 순회(로그 0건이면 byUser 에 없음).
- 옵트인 `deadline` 키 재사용, 분석 type `goal_unreachable`(+ `week`).

### C4. dead code 제거

action-result-dialog 의 `failed` variant·`FailedBody`·전용 props·orphan(`handleViewDashboard`·`Card` import) 제거. 나머지 3 variant(completed/first-success/goal-reached) 불변. action-form 은 `failed` 를 set 한 적 없어 무영향.

## Alternatives Considered

1. **즉시 회계 산입(unreachable 주를 confirmedPenalty 에 포함)** — 진행 중 "모인 벌금"이 즉시 오르나 단조 불변식·ADR-0030 충돌(ADR 개정 필요). 표시만으로 사용자 요구(실패 가시화) 충족되므로 회계 불변 채택.
2. **제출 시점 `failed` 모달 연결(#35)** — give-up(인증 중단)은 제출이 없어 구조적으로 못 잡음. 모달 제거 + 푸시로 대체.
3. **푸시 없이 대시보드 on-read 만** — 사용자가 상세를 안 열면 give-up 실패를 능동 통지 못 함. 일 경계 푸시 추가.

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:docs
```

### 시나리오

- currentWeekStatus: 7일·주7회·done1·남은2일 → unreachable=true / shortfall==daysLeft 경계 → false / 0원 챌린지 달성불가 → unreachable=true·atRiskAmount=0.
- buildWeekChips: 진행 주 회복불가 → `missed`, 회복가능 → `current`.
- unreachableParticipants: 회복불가 참가자만 반환, 로그 0건 참가자 포함, over/closed 면 빈 배열.
- WeekRing(jsdom): unreachable 카피 "이번 주 목표 달성 불가" + "종료 시 +3,000원 확정", "이대로면"·"더 채우면" 미표시.
- dispatchGoalUnreachableNotification: events dedup skip / deadline 옵트인 off skip / 발송+track(type=goal_unreachable,week).
- cron route: running 회복불가 참가자 통지·`unreachableNotified` 집계 / running 없으면 0.

## Rollout

PR 머지 후 production 배포 시 cron 이 다음 09:00 KST 스캔부터 통지. dogfood 기간 b088ae54 류 케이스로 카피·통지 확인. confirmedPenalty 회계 무변경이라 기존 정산 회귀 위험 없음.

### 롤백

표시·통지 추가가 전부라 PR revert 1회로 원복(데이터·스키마 마이그레이션 없음). dedup 이벤트는 무해하게 잔존.

## Out of scope

- **Problem B (auto-close cron 운영)**: 별도 트랙. `closed_at` 이 한 번도 안 찍히고 만기 챌린지가 active 로 남는 현상은 코드(이미 main 에 존재)가 아니라 prod cron firing/권한 진단 영역. 만기 후에도 home/상세는 `phase==='over'` on-read 로 실패를 표시하므로 비차단.
- action-form 의 `goalReached`(누적 vs goalCount)가 다주 챌린지에서 주차 단위와 어긋날 소지 — 별도 이슈.

## 용어집

- **unreachable(회복 불가)**: 남은 가능일 < 이번 주 부족분 → 이번 주 목표 달성이 수학적으로 불가능한 상태.
- **imminent(무여유)**: 남은 가능일 ≤ 부족분 → 매일 채워야 겨우 달성 가능한 상태(unreachable 의 상위 집합).
- **elapsed week(끝난 주)**: cutoff 일차까지 완전히 진행된 주 — 확정 누적(`confirmedPenalty`)의 대상.
- **give-up**: 사용자가 인증을 중단해 제출 이벤트가 더 없는 상태 — 제출 트리거 모달로는 감지 불가.
