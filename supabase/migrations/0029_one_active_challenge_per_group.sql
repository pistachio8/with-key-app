-- 0029_one_active_challenge_per_group.sql
--
-- 그룹당 동시 챌린지 1개만 허용한다. closed 는 제외하여 직렬 진행에는
-- 영향이 없고, pending|accepted|active 단계의 챌린지가 같은 group_id 로
-- 두 개 이상 존재하지 못하도록 partial unique index 로 강제한다.
--
-- 참조:
--   docs/superpowers/specs/2026-05-20-group-challenge-concept.md C3
--   docs/adr/0011-group-challenge-ownership-model.md
--
-- 위반 시 sqlstate 23505 → Server Action 의 mapSupabaseError 가
-- "conflict" ErrorCode 로 매핑 → 호출처 UI 에서 "이미 진행 중인 챌린지가
-- 있어요" 토스트로 안내.

create unique index if not exists challenges_one_open_per_group
  on public.challenges (group_id)
  where status in ('pending', 'accepted', 'active');
