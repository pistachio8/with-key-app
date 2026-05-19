-- ADR-0008 카카오 OAuth 도입에 따른 handle_new_auth_user() 안전화.
--
-- 변경 이유: 카카오 OAuth 의 이메일 동의가 선택 동의로 운영되므로
-- new.email 이 NULL 일 수 있다. 기존 본문(0001_init.sql)의
-- split_part(new.email, '@', 1) 은 NULL 시 NULL 을 반환해 users.display_name
-- NOT NULL 제약을 위반한다. raw_user_meta_data 의 name/nickname 을 폴백 체인
-- 1순위로 두고 email-local-part 와 '사용자' 리터럴을 보조 폴백으로 둔다.
--
-- 시그니처(returns trigger / language plpgsql / security definer /
-- set search_path = public) 는 0001_init.sql 과 동일하게 유지해
-- trigger on_auth_user_created 가 자동으로 새 함수 본문을 가리킨다.
-- 0024_grant_handle_new_auth_user_to_auth_admin.sql 의 grant 도 함수 identity
-- 가 그대로라 영향 없음.
--
-- avatar_url 은 신규로 채움 — 카카오 동의 항목에 프로필 사진이 포함된
-- 경우 자동 활용, 미포함 시 NULL 유지.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(new.raw_user_meta_data->>'nickname', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      '사용자'
    ),
    nullif(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
