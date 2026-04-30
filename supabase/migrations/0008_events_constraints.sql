-- PRD §9.1 이벤트 목록과 1:1 보장 + 분석 쿼리 가속.
-- 2-step: NOT VALID 로 걸고, 기존 row 정리 후 VALIDATE.

-- (a) alien name row 선제 정리 — Preview 에 수동 시드된 legacy 가 있어도 안전.
delete from public.events
  where name not in (
    'user_signed_up','group_created','invite_sent','invite_opened',
    'challenge_created','challenge_signed','challenge_activated',
    'action_started','keywords_shown','keywords_reroll','keyword_selected',
    'memo_fallback_opened','action_logged','ai_generated',
    'feed_view','kudos_given','notification_sent','notification_opened',
    'penalty_displayed'
  );

-- (b) NOT VALID 로 먼저 제약 등록 (lock 최소화).
alter table public.events
  add constraint events_name_valid
  check (name in (
    'user_signed_up','group_created','invite_sent','invite_opened',
    'challenge_created','challenge_signed','challenge_activated',
    'action_started','keywords_shown','keywords_reroll','keyword_selected',
    'memo_fallback_opened','action_logged','ai_generated',
    'feed_view','kudos_given','notification_sent','notification_opened',
    'penalty_displayed'
  )) not valid;

-- (c) 검증 — 위 DELETE 후엔 반드시 통과.
alter table public.events validate constraint events_name_valid;

-- (d) Week 2 props 조회용 GIN.
create index if not exists idx_events_props_gin
  on public.events using gin (props);

-- (e) 시계열 range scan.
create index if not exists idx_events_created_at
  on public.events (created_at desc);
