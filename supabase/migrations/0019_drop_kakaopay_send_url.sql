-- 0019_drop_kakaopay_send_url.sql
--
-- 목적 (D-020 정리):
--   D-009 반전 과정에서 앱 레이어의 kakaopay 송금 링크 인프라는 제거됐으나
--   (e391982, 924af06), groups.kakaopay_send_url 컬럼을 추가한 원본 migration 이
--   브랜치 초기화 과정에서 git 히스토리에서 빠지면서 원격 DB 에만 고아 컬럼으로
--   남아 있었다. 이 migration 으로 원격 DB 와 앱·generated types 를 재동기화한다.
--
--   앱 어디에서도 해당 컬럼을 읽거나 쓰지 않으므로(`grep kakaopay_send_url src/` = 0건)
--   DROP 은 무결성 영향 없음. RLS 정책에서 참조되지도 않는다.

alter table public.groups
  drop column if exists kakaopay_send_url;
