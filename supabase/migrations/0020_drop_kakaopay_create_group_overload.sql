-- 0020_drop_kakaopay_create_group_overload.sql
--
-- 목적 (D-020 정리 연속):
--   같은 원인(D-009 반전 과정에서 롤백된 migration 잔재)으로 원격 DB 에는
--   옛 시그니처 `create_group_with_owner(p_name text, p_kakaopay_url text)`
--   오버로드가 0017 의 신 시그니처와 공존 중이다.
--   `create or replace function` 은 같은 인자 시그니처에서만 대체하므로
--   이 오버로드는 명시 DROP 으로 제거한다.

drop function if exists public.create_group_with_owner(p_name text, p_kakaopay_url text);
