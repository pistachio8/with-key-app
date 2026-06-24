-- supabase/migrations/0052_truncate_test_data_ledger_settlements.sql
-- ADR-0035 가 인지 기록한 잠복 결함의 forward-fix / EVAL-0042 integration 동반.
--
-- 배경: truncate_test_data(integration afterEach 정리 RPC)는 point_ledger·settlements 를 삭제하지
--   않아, 그 두 테이블이 challenges 를 FK 참조하면 `delete from challenges` 가
--   "update or delete on table challenges violates foreign key constraint point_ledger_challenge_id_fkey"
--   로 막힌다. 0047 주석이 "point_ledger·settlements 미정리는 기존 잠복 결함 — 별도 forward-fix"로 명시 이연.
--   EVAL-0042 의 settle-challenge-insert-once integration 이 통합테스트 사상 처음 settle_challenge 를 호출해
--   point_ledger(deposit_release/penalty) + settlements 행을 만들면서 이 결함이 실제로 터졌고, 정리 실패가
--   공유 Supabase 를 오염시켜 전 integration suite 로 cascade 했다.
--
-- 수정: 0047 정의 전문 보존 + challenges 삭제 *이전*에 두 줄 추가
--   (a) delete from public.point_ledger  (user_id 스코프 — 테스트 참가자 소유 원장)
--   (b) delete from public.settlements    (테스트 그룹 소유 challenge 의 정산 스냅샷)
--   둘 다 challenges 를 FK 참조하므로 challenges 삭제보다 먼저 지운다.
--
-- 번호: append-only(재정렬 금지). 0051 다음 가용 번호 0052. forward-only(down 없음, POC 정책).
--   test-only 정리 RPC 라 production 데이터·런타임 동작에 영향 없음(scope=@test.local).
create or replace function public.truncate_test_data()
returns void
language plpgsql security definer
set search_path = public, storage as $$
declare
  v_test_user_ids uuid[];
begin
  select coalesce(array_agg(id), array[]::uuid[]) into v_test_user_ids
    from auth.users where email like '%@test.local';

  if array_length(v_test_user_ids, 1) is not null then
    -- Bypass storage.protect_delete trigger (session-local; service_role only).
    perform set_config('storage.allow_delete_query', 'true', true);

    delete from storage.objects
      where bucket_id in ('action-photos', 'feedback-photos')
        and (storage.foldername(name))[1] in (
          select unnest(v_test_user_ids)::text
        );

    delete from public.feedback where user_id = any(v_test_user_ids);
    delete from public.kudos where user_id = any(v_test_user_ids);
    delete from public.action_logs where user_id = any(v_test_user_ids);

    -- point_ledger·settlements 는 challenges 를 FK 참조 → challenges 삭제 이전에 정리(ADR-0035 forward-fix).
    delete from public.point_ledger where user_id = any(v_test_user_ids);
    delete from public.settlements where challenge_id in (
      select id from public.challenges where group_id in (
        select id from public.groups where owner_id = any(v_test_user_ids)
      )
    );

    delete from public.challenge_participants where user_id = any(v_test_user_ids);
    delete from public.challenges where group_id in (
      select id from public.groups where owner_id = any(v_test_user_ids)
    );
    delete from public.invites where created_by = any(v_test_user_ids);
    delete from public.group_members where user_id = any(v_test_user_ids);
    delete from public.groups where owner_id = any(v_test_user_ids);
    delete from public.push_subscriptions where user_id = any(v_test_user_ids);
    delete from public.events where user_id = any(v_test_user_ids);
    delete from auth.users where id = any(v_test_user_ids);
  end if;

  -- D-017: anon events (user_id IS NULL) within 24h — test anon leaks only,
  -- preserve older prod analytics.
  delete from public.events
    where user_id is null
      and created_at > now() - interval '24 hours';

  -- D-017: reset scope='test' current-month AI cost accumulator.
  update public.ai_cost_log
    set total_micros = 0, updated_at = now()
    where month = date_trunc('month', now() at time zone 'utc')::date
      and scope = 'test';
end;
$$;
revoke all on function public.truncate_test_data() from public, anon, authenticated;
grant execute on function public.truncate_test_data() to service_role;
