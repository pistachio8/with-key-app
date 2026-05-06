-- 0017_groups_bank_account_and_create_rpc.sql
--
-- 목적 (D-009 Reversed · D-016):
--   카카오페이 송금 링크 API 정책 리스크로 D-009 를 되돌리고, 오너가 입력한 은행 계좌를
--   앱 레이어 AES-256-GCM 로 암호화해서 저장한다. 본 migration 은:
--
--   1) groups 에 계좌 컬럼 4개 추가
--      - bank_code / account_holder / account_number_encrypted(bytea) / account_number_last4
--      - 4개는 all-or-nothing (묶음 CHECK)
--      - 암호화/복호화는 앱(Node crypto)에서 처리. pgcrypto 미사용.
--
--   2) 그룹 생성 RPC `create_group_with_owner(
--        p_name, p_bank_code, p_account_holder, p_account_number_encrypted, p_account_number_last4
--      )`
--      - group_members.INSERT 는 0002_rls.sql 기준 service_role-only 이므로 유저 토큰으로
--        직접 insert 불가. SECURITY DEFINER RPC 로 groups insert + group_members(role=owner)
--        를 한 트랜잭션에서 처리.
--      - 암호문 bytea 는 이미 앱에서 AES-GCM 으로 만들어 넘어온다 (서버는 키를 보지 않음).

alter table public.groups
  add column bank_code text
    check (bank_code is null or char_length(bank_code) between 2 and 10),
  add column account_holder text
    check (account_holder is null or char_length(account_holder) between 1 and 30),
  add column account_number_encrypted bytea,
  add column account_number_last4 text
    check (
      account_number_last4 is null
      or (char_length(account_number_last4) = 4 and account_number_last4 ~ '^[0-9]{4}$')
    );

-- 묶음 CHECK: 4 컬럼 동시 NULL 또는 동시 NOT NULL.
alter table public.groups
  add constraint groups_bank_account_all_or_nothing check (
    (
      bank_code is null
      and account_holder is null
      and account_number_encrypted is null
      and account_number_last4 is null
    )
    or (
      bank_code is not null
      and account_holder is not null
      and account_number_encrypted is not null
      and account_number_last4 is not null
    )
  );

create or replace function public.create_group_with_owner(
  p_name text,
  p_bank_code text,
  p_account_holder text,
  p_account_number_encrypted bytea,
  p_account_number_last4 text
)
returns uuid
language plpgsql security definer
set search_path = public as $$
declare
  v_uid uuid;
  v_group_id uuid;
  v_has_any boolean;
  v_has_all boolean;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  if p_name is null or char_length(p_name) < 1 or char_length(p_name) > 30 then
    raise exception 'invalid group name' using errcode = '22023';
  end if;

  -- 계좌 4 인자: 전부 NULL 이거나 전부 NOT NULL 이어야 한다.
  v_has_any :=
    p_bank_code is not null
    or p_account_holder is not null
    or p_account_number_encrypted is not null
    or p_account_number_last4 is not null;
  v_has_all :=
    p_bank_code is not null
    and p_account_holder is not null
    and p_account_number_encrypted is not null
    and p_account_number_last4 is not null;

  if v_has_any and not v_has_all then
    raise exception 'incomplete bank account fields' using errcode = '22023';
  end if;

  insert into public.groups (
    owner_id, name,
    bank_code, account_holder, account_number_encrypted, account_number_last4
  )
  values (
    v_uid, p_name,
    p_bank_code, p_account_holder, p_account_number_encrypted, p_account_number_last4
  )
  returning id into v_group_id;

  insert into public.group_members (group_id, user_id, role)
    values (v_group_id, v_uid, 'owner');

  return v_group_id;
end;
$$;

revoke all on function public.create_group_with_owner(text, text, text, bytea, text)
  from public, anon;
grant execute on function public.create_group_with_owner(text, text, text, bytea, text)
  to authenticated, service_role;
