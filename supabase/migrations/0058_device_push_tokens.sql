-- supabase/migrations/0058_device_push_tokens.sql
-- ADR-0041(rn-push-token-model: Web Push 구독 → Expo device token) accepted 2026-06-25.
-- 선행 권장: docs/migration/03-rn-migration-rules.md §8 · 04-rn-architecture.md §7 A9. EVAL-0051(WP1).
--
-- 본 migration 이 하는 일 (EVAL-0051 범위 — DDL + RLS 만):
--   A. device_push_tokens 신설 — RN(Expo) 디바이스별 push token 저장. push_subscriptions(Web Push)는
--      변형/삭제하지 않고 cutover(Phase 8)까지 web 잔존(ADR-0041 §49). 한 user 가 여러 기기를 가지므로
--      (user_id × device_id) 매핑, token 갱신은 upsert. expo_push_token UNIQUE 로 기기 이전/재설치 정리.
--   B. RLS dpt_all_self — push_subscriptions 의 ps_all_self(0002) 미러. self 만 read/insert/update/delete.
--      RN 은 RLS self-row 라 Supabase 클라이언트로 직접 upsert(BFF 불필요, ADR-0041 §73).
--
-- 무효 토큰 = soft-delete(disabled_at). Web Push 는 404/410 에 endpoint hard-delete 였지만 신규는
--   Expo receipts 의 DeviceNotRegistered 에 disabled_at 마킹(재등록 시 같은 (user_id,device_id) upsert 로
--   재활성). dispatch sender(apps/web/src/lib/push/dispatch.ts)가 disabled_at IS NULL 토큰만 발송 대상으로 본다.
--
-- 번호: append-only(재정렬 금지). 현재 최신 0057_challenge_montages → next available 0058. forward-only(down 없음).
--   production apply 게이트는 0044·0050·0051·0054·0055 와 동일(G2). 신규 테이블·RLS 라 기존 행/동작 무변.
-- 테스트 정리: truncate_test_data(0054) 가 auth.users 를 삭제하고, public.users.id → auth.users(id) ON DELETE
--   CASCADE → device_push_tokens.user_id → public.users(id) ON DELETE CASCADE 체인으로 test 토큰이 자동 정리되므로
--   truncate_test_data 재선언은 불필요(push_subscriptions 의 명시 delete 와 동일 효과를 cascade 가 보장).

-- ============================================================
-- A. device_push_tokens — Expo device push token (기기당 1행)
-- ============================================================
create table public.device_push_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  device_id       text not null,                                  -- expo-device installation id
  expo_push_token text not null,                                  -- ExponentPushToken[...]
  platform        text not null check (platform in ('ios', 'android')),
  app_version     text,
  last_seen_at    timestamptz,
  disabled_at     timestamptz,                                    -- 무효화 soft-delete(DeviceNotRegistered)
  created_at      timestamptz not null default now(),
  unique (user_id, device_id),                                   -- 기기당 1행(토큰 갱신은 upsert)
  unique (expo_push_token)
);

comment on table public.device_push_tokens is
  'RN(Expo) 디바이스별 push token(ADR-0041). push_subscriptions(Web Push)와 cutover 까지 공존. (user_id,device_id) 1행, disabled_at=DeviceNotRegistered soft-delete.';
comment on column public.device_push_tokens.device_id is
  '기기 식별자(expo-device installation id). user_id 와 함께 다중 디바이스 구분.';
comment on column public.device_push_tokens.expo_push_token is
  'ExponentPushToken[...] — Expo Push Service(exp.host) 발송 대상. 기기 이전/재설치 정리 위해 UNIQUE.';
comment on column public.device_push_tokens.disabled_at is
  '무효 토큰 soft-delete 마커. dispatch 가 disabled_at IS NULL 만 발송. 재등록 시 (user_id,device_id) upsert 로 재활성.';

create index idx_dpt_user on public.device_push_tokens(user_id);

-- ============================================================
-- B. RLS — dpt_all_self (push_subscriptions 의 ps_all_self[0002] 미러)
-- ============================================================
alter table public.device_push_tokens enable row level security;

create policy dpt_all_self on public.device_push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
