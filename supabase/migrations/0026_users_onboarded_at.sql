-- 0026_users_onboarded_at.sql
-- ADR-0006 — onboarding 노출 판정을 group_members 휴리스틱 → 사용자 단위 플래그로 이전.
-- nullable: 기존 사용자 전원 NULL (백필 안 함). NULL = "아직 슬라이드 못 본 사용자",
-- NOT NULL = "본인 의사로 종료한 시각". 다음 비-invite 로그인에 callback 이 이 컬럼으로 분기.

alter table public.users
  add column if not exists onboarded_at timestamptz;

-- RLS: users_select_self_or_group (0002) · users_update_self (0002) 가 이미 self read/write 를 허용.
-- 별도 정책 변경 불필요. write 는 (auth)/login/_actions.ts 의 markOnboarded() Server Action 으로만 발생.
