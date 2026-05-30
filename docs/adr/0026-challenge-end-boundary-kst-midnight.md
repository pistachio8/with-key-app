# ADR-0026 — 챌린지 종료 경계를 KST 자정으로 정렬

- **Status**: Accepted
- **Date**: 2026-05-30
- **Deciders**: pistachio8

## Context

챌린지의 "일차"를 다루는 코드는 두 가지 서로 다른 시간 기준을 섞어 쓰고 있었다.

- **진행 일수**(`currentDay`·인증 달성 카운트·`verifiedDays`): `src/lib/challenge/done-days.ts` 의 `toKstDayKey`(`Intl.DateTimeFormat` `timeZone='Asia/Seoul'`) + `dayIndexOf` 로 **KST(Asia/Seoul) 자정 기준 캘린더 일자**. 활성화된 KST 날짜가 1일차, 매일 00:00 KST 에 +1.
- **인증 가능 window 와 D-N 카운트다운**: `end_at = now() + make_interval(days => duration_days)` — 즉 **활성화(서명 완료) 시각으로부터 24시간 배수**. KST 자정에 정렬되지 않음.

이 불일치는 관측 가능한 문제를 만든다. 7일 챌린지가 KST 05-01 20:00 에 활성화되면 `end_at = 05-08 20:00 KST`:

- **05-07(KST)**: 진행 일수는 7일차(마지막 날)인데 D-N 배지는 `ceil((05-08 20:00 − now)/24h)` = **D-2** 로 표기 → "7일차인데 D-2" 모순.
- **05-08 00:00~20:00 KST**: 게이트(`now < end_at`)와 RLS(`now between start_at and end_at`)가 아직 열려 있어 **인증 제출이 됨**. 그러나 이 날의 day-index = 8 > `duration_days`(7) 이라 `verifiedDays` 필터(`index <= totalDays`)에서 **조용히 탈락** → 제출은 받지만 목표에 안 잡히는 **dead zone**.

`start_at` 의 시각(時)에 따라 어긋남 폭과 dead zone 길이가 달라진다.

## Decision

**챌린지 활성화 시 `end_at` 을 "활성화 KST 날짜 + `duration_days` 일"의 00:00 KST 로 계산한다.** 즉 마지막 캘린더 날(day-index `duration_days`)의 다음 자정.

- **시작 경계 불변**: `start_at = now()` 유지. 활성화된 KST 날짜가 1일차(부분일일 수 있음 — 늦게 활성화하면 첫날 인증 시간이 짧다). day-index 코드(`done-days.ts`)는 변경하지 않는다.
- **종료 경계 (변경)**: `start_challenge_with_signed_participants` RPC 에서
  ```sql
  end_at = (date_trunc('day', now() at time zone 'Asia/Seoul')
            + make_interval(days => v_duration_days)) at time zone 'Asia/Seoul'
  ```
  현재 `end_at` 을 세팅(=활성화)하는 함수는 이 하나뿐이다 (`sign_and_maybe_activate` 는 0028 에서 서명만 기록하도록 바뀜).
- **신규만 적용**: 이미 `status='active'` 인 챌린지의 `end_at` 은 소급 변경(backfill)하지 않는다. 진행 중 챌린지의 마감을 당기지 않기 위함. POC 챌린지는 짧아(며칠) 기존 불일치는 곧 자연 소멸.
- **게이트·RLS·dead zone 자동 해소**: `now < end_at` 게이트와 `now between start_at and end_at` RLS 가 KST 자정에 정확히 닫혀, day-index 가 `duration_days` 를 초과하는 날의 제출 자체가 막힌다. 별도 코드 변경 불필요.
- **표시(D-N) 불변**: `ceil((end_at - now)/86_400_000)` 공식은 `end_at` 이 KST 자정이 되는 순간 자동으로 정확해진다 (1일차=D-`duration_days` … 마지막 날=D-1, 자정에 "마감"). 표시 코드 변경 없음.

## Alternatives Considered

### 1. 진행 일수도 활성화+24h 배수로 변경 (24h 기준으로 통일)

- **Pros**: RLS 변경 불필요, `end_at` 현행 유지.
- **Cons**: "하루 = 캘린더 일자" 직관과 어긋남. `done-days.ts` 의 KST 자정 distinct-day 카운트(인증 1일 1회)를 전면 재작성해야 하고, 사용자가 자정 넘겨 인증해도 "같은 날"로 취급되는 현 동작이 깨진다.
- **Why not**: habit 앱의 자연스러운 멘탈 모델은 캘린더 일자다. 변경 폭도 더 크다.

### 2. 1일차를 활성화 다음 KST 자정부터 시작 (모두 온전한 첫날 보장)

- **Pros**: 늦게 활성화해도 첫날 인증 시간이 짧지 않음.
- **Cons**: `start_at` 과 "1일차 날짜"가 분리돼 day-index SoT 변경 필요. 활성화~1일차 사이 "active 인데 인증 못 하는 공백" 발생.
- **Why not**: 변경 폭이 크고, POC 에서는 "시작한 날 바로 인증 가능"이 오히려 자연스럽다.

### 3. 기존 active 챌린지도 backfill

- **Pros**: 즉시 전면 일관.
- **Cons**: 진행 중 챌린지 마감이 최대 ~1일 당겨져 dogfood 사용자가 체감.
- **Why not**: 진행 중 판돈/마감을 사용자 동의 없이 바꾸는 위험. 짧은 POC 챌린지는 곧 종료되어 자연 정렬.

## Consequences

### 긍정적

- "N일차 = D-(`duration_days`−N+1)" 가 정확히 일치. "마지막 날 = D-1, 자정에 마감"으로 직관 일치.
- dead zone(제출은 되는데 카운트 안 됨) 소멸 — 게이트·RLS 가 KST 자정에 닫힘.
- `deadline-push` cron(`end_at` 기준)이 KST 자정 전날 저녁 즈음 발송되어 더 합리적.

### 부정적 / 비용

- 첫날이 부분일일 수 있음(늦게 활성화 시 첫날 인증 시간 짧음) — 의도적 수용(대안 2 참조).
- 신규만 적용이라 이번 결정 시점에 진행 중인 챌린지는 종료될 때까지 옛(24h) 동작 유지 — 일시적 혼재.

### 후속 영향

- migration `0039_challenge_end_at_kst_midnight.sql` (forward-only, down 없음).
- `docs/BE_SCHEMA.md` §5.5 `end_at` 설명 갱신.
- day-index·표시·RLS 코드는 변경하지 않음(자동 정렬).

## Links

- SoT: [`src/lib/challenge/done-days.ts`](../../src/lib/challenge/done-days.ts) — KST 자정 캘린더 일자 + `dayIndexOf`
- 활성화 RPC: `start_challenge_with_signed_participants` (정의 [`supabase/migrations/0028_pending_invite_start_flow.sql`](../../supabase/migrations/0028_pending_invite_start_flow.sql))
