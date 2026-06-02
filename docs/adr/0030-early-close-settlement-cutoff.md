# ADR-0030: 조기 종료 정산 cutoff (`challenges.closed_at`)

- Status: Accepted
- Date: 2026-06-02
- 관련: spec `docs/superpowers/specs/2026-06-02-weekly-penalty-accrual.md`, ADR-0027(derived-over-autoclose)

## Context

벌금을 주 단위 누적 모델로 재정의하면서(spec C3), "끝난 주만 정산"의 기준일(cutoff)이 필요해졌다.
자연 종료(만기 또는 auto-close)는 `duration_days`까지 전 주가 정산되지만, 운영자가 `end_at` 전에
수동 종료(조기 종료)하면 아직 시작도 안 한 미래 주와 종료 시점에 잘린 부분 주를 charge 하면 안 된다
(사용자 결정: 잔여·중도 주 미부과). 기존 스키마에는 "언제 종료했는가"를 알 수 있는 컬럼이 없었다
(`status='closed'`만 있고 시각 없음).

## Decision

`challenges.closed_at timestamptz null` 컬럼을 추가한다. 종료 경로 둘(`endChallenge` Server Action·
auto-close cron `deadline-push`)이 `status='closed'` 전이와 함께 `closed_at = now()`를 set 한다.

cutoff 산정(`src/lib/challenge/weekly.ts` `cutoffDayIndex`):

- `running`: `todayDayIndex - 1`(완료된 날만)
- `over`(만기·status=active): `duration_days`
- `closed`: `closed_at` 있으면 `min(duration_days, dayIndexOf(closed_at))`, NULL이면 `duration_days`(자연 종료로 폴백)

자연 종료는 `closed_at >= end_at`이라 `min(...)`이 `duration_days`로 수렴해 전 주 정산.
조기 종료는 `closed_at < end_at`이라 종료일까지의 완전히 끝난 주만 정산된다.

## Consequences

- nullable 추가라 기존 행은 NULL → 폴백(`duration_days`)으로 자연 종료처럼 취급. 데이터 backfill 불필요.
- RLS 변경 없음. 기존 UPDATE 정책 경로(admin client·owner 검증)에서 함께 갱신.
- 롤백: 컬럼을 그대로 두면 무해(POC 단방향, drop 안 함). cutoff 로직만 `duration_days` 폴백으로 되돌리면 됨.
