-- supabase/migrations/0050_settlement_penalty_exclude_peer_rejected.sql
-- ADR-0032 (정산 검증 데이터 모델) §peer_rejected 제외 정책 구현 누락 bugfix / EVAL-0040 —
--   🐞 정산 미달분(confirmedPenalty) 산정 RPC `_settlement_confirmed_penalties` 의 done_days 가
--      과반 익명 반려(auto_verify_status='peer_rejected') 인증을 "달성한 날(done day)"로 세던 버그를 고친다.
--
-- 배경: 0045_action_logs_verify_columns 가 'peer_rejected' 를 "주간 카운트 제외" 대상으로 명시 선언했고
--   (L30 comment), EVAL-0032(멤버 현황판 doneCount)·EVAL-0039(주차 링·칩)는 web read 에서 이를 제외했다.
--   그러나 0044_settlement_rpcs 의 _settlement_confirmed_penalties 는 0045 도입 전 작성돼 같은 제외가 빠졌다.
--   결과: 반려당한 인증도 done_day 로 집계되어 done<week_goal 판정이 어긋나고 미달 penalty 가 과소 산정됐다.
--
-- 수정: done_days CTE 에 `al.auto_verify_status <> 'peer_rejected'` 한 줄만 추가. 그 외 산식·시그니처는 0044 와 동일.
--   peer_rejected 만 제외한다 — passed/pending/failed/manual_review 는 기존대로 done 집계('친구 신뢰' default-passed,
--   EVAL-0032/0039 web read 와 동일 기준: `<> 'peer_rejected'`).
--
-- 번호: append-only(재정렬 금지). 0049 다음 가용 번호 0050. 0044 는 편집하지 않는다(단방향, forward-only).
-- forward-only(down 없음, POC 정책). RPC 산정 correctness 는 결정론 불변식 — 게이트 무관 즉시 활성(EVAL-0006 기준).
create or replace function public._settlement_confirmed_penalties(p_challenge_id uuid)
returns table (user_id uuid, confirmed_penalty integer)
language sql stable security definer
set search_path = public as $$
  with ch as (
    select
      c.duration_days,
      c.goal_count,
      c.penalty_amount,
      (c.start_at at time zone 'Asia/Seoul')::date as start_day,
      ceil(c.duration_days::numeric / 7)::int as total_weeks,
      case
        when c.closed_at is not null then
          least(
            c.duration_days,
            (((c.closed_at at time zone 'Asia/Seoul')::date - (c.start_at at time zone 'Asia/Seoul')::date) + 1)
          )
        else c.duration_days
      end as cutoff_day
    from public.challenges c
    where c.id = p_challenge_id
  ),
  elapsed_weeks as (
    -- 끝까지 진행된 주 + 그 주의 목표(자투리 ceil 비례)
    select
      w.week,
      case
        when w.week < ch.total_weeks or ch.duration_days % 7 = 0 then ch.goal_count
        else ceil(ch.goal_count::numeric * (ch.duration_days - (ch.total_weeks - 1) * 7) / 7)::int
      end as week_goal
    from ch
    cross join lateral generate_series(1, ch.total_weeks) as w(week)
    where least(w.week * 7, ch.duration_days) <= ch.cutoff_day
  ),
  participants as (
    select cp.user_id
    from public.challenge_participants cp
    where cp.challenge_id = p_challenge_id and cp.signed_at is not null
  ),
  done_days as (
    -- 하루 N개 인증도 1회(KST distinct day), 범위 밖(stray) 제외
    -- EVAL-0040: 과반 익명 반려(peer_rejected) 인증은 done 에서 제외(0045 "주간 카운트 제외" 정책).
    select distinct
      cp.user_id,
      (al.created_at at time zone 'Asia/Seoul')::date as kst_day
    from public.challenge_participants cp
    join public.action_logs al
      on al.challenge_id = cp.challenge_id and al.user_id = cp.user_id
    cross join ch
    where cp.challenge_id = p_challenge_id
      and cp.signed_at is not null
      and al.auto_verify_status <> 'peer_rejected'
      and (((al.created_at at time zone 'Asia/Seoul')::date - ch.start_day) + 1)
          between 1 and ch.duration_days
  ),
  done_by_week as (
    -- weekIndexOf(dayIndex) = floor((dayIndex-1)/7)+1, dayIndex-1 = kst_day - start_day
    select
      dd.user_id,
      floor((dd.kst_day - ch.start_day) / 7) + 1 as week,
      count(*) as done
    from done_days dd
    cross join ch
    group by dd.user_id, floor((dd.kst_day - ch.start_day) / 7) + 1
  ),
  per_user_week as (
    select
      p.user_id,
      e.week_goal,
      coalesce(dbw.done, 0) as done
    from participants p
    cross join elapsed_weeks e
    left join done_by_week dbw on dbw.user_id = p.user_id and dbw.week = e.week
  )
  select
    pu.user_id,
    case
      when (select penalty_amount from ch) > 0
        then ((select penalty_amount from ch) * count(*) filter (where pu.done < pu.week_goal))::integer
      else 0
    end as confirmed_penalty
  from per_user_week pu
  group by pu.user_id;
$$;
