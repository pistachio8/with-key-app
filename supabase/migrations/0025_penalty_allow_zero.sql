-- 0025_penalty_allow_zero.sql
--
-- 목적: PR5 모킹업 §3-A "없음" 옵션 (#58) — penalty_amount = 0 허용.
--   0001_init.sql:66 의 CHECK(penalty_amount BETWEEN 1000 AND 10000) 가 0원을 거부.
--   validator `src/lib/validators/challenge.ts` 는 PR5 에서 .min(0) 으로 풀었으나
--   DB CHECK 가 동기화되지 않아 create_challenge RPC 가 23514 로 실패하는 누락 수정.
--
-- 참고: docs/superpowers/plans/2026-05-14-ui-revision.md §PR5 Task 5.1 Step 5b.
--
-- 백필 / 안전성:
--   - 기존 row 영향 없음: 모든 penalty_amount 는 1000~10000 (구 정책) 이라
--     새 CHECK (0~10000) 도 모두 통과.
--   - 1천원 단위 제약은 그대로 유지.
--
-- Down: 없음 (POC 단방향, AGENTS.md §Supabase/RLS).
--   롤백 시 0원 row 가 존재한다면 데이터 정리(1000 으로 갱신 또는 삭제) 필요.

alter table public.challenges
  drop constraint if exists challenges_penalty_amount_check;

alter table public.challenges
  add constraint challenges_penalty_amount_check
  check (penalty_amount between 0 and 10000 and penalty_amount % 1000 = 0);
