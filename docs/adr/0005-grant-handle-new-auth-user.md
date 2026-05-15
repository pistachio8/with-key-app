# ADR-0005-grant-handle-new-auth-user: `handle_new_auth_user` 트리거 함수에 `supabase_auth_admin` EXECUTE 권한 명시 부여

**Date**: 2026-05-15
**Status**: accepted
**Deciders**: pistachio8

## Context

- 0001_init.sql 에서 `auth.users` insert 시 `public.users` 행을 채워주는 `handle_new_auth_user()` 트리거 함수를 만들고, `on_auth_user_created` 트리거로 연결했다. 함수는 `security definer` + `search_path = public` 로 정의돼 있다.
- 2026-05-14 14:37 부터 develop · 모든 PR 의 `Integration (shared with-key project)` job 이 4건 연속 FAIL. 직전 마지막 성공(2026-05-14 09:53) 과 그 사이의 develop 커밋은 전부 docs only — 코드 회귀 없음.
- 실패 패턴이 일관됨:
  - 첫 단계에서 GoTrue 가 `Database error granting user` 반환
  - 후속 테스트에서 `groups_owner_id_fkey` · `group_members_group_id_fkey` · `Invalid login credentials` · CHECK 미발동 (0-row update) 가 도미노로 발생
- 진단 결과:
  - `on_auth_user_created` 트리거 → 존재 · `tgenabled = 'O'`
  - `handle_new_auth_user()` 함수 본문 → 0001_init.sql 과 동일
  - `information_schema.routine_privileges` 에 `supabase_auth_admin` 의 EXECUTE 권한 **부재**
- GoTrue 는 새 유저 가입 시 `supabase_auth_admin` role 로 트리거를 발화시킨다. EXECUTE 가 없으면 트리거 자체가 실행되지 않거나 권한 오류로 트랜잭션이 중단 → `public.users` 동기화 실패 → 위 모든 후속 증상의 단일 근본 원인.
- 0001_init.sql 에는 본래 이 GRANT 가 누락돼 있었고, 그동안은 hosted 프로젝트의 기본 권한 정책이 우연히 통과시켜 주고 있었던 것으로 추정. shared 프로젝트의 권한 상태가 어떤 외부 작업으로 변경되며 표면화됐다.

## Decision

`public.handle_new_auth_user()` 함수에 `supabase_auth_admin` 의 EXECUTE 권한을 **migration 으로 명시 부여**한다.

- 신규 migration `supabase/migrations/0024_grant_handle_new_auth_user_to_auth_admin.sql` 에 `grant execute on function public.handle_new_auth_user() to supabase_auth_admin;` 단일 statement 만 추가.
- 0001_init.sql 은 머지된 migration 이라 사후 수정 금지 (POC 단방향 정책) — 따라서 신규 번호 migration 으로 보강한다.
- `truncate_test_data` · `add_ai_cost` 등 다른 함수는 GoTrue 가 직접 호출하지 않으므로 본 ADR 범위 밖.

## Alternatives Considered

### 1. Studio SQL Editor 에서 GRANT 만 한 번 실행하고 끝

- **Pros**: 즉시 효과. 코드 변경 0.
- **Cons**: 환경 재구성·새 Supabase 프로젝트 복제 시 동일 회귀 재발. 권한 상태가 SoT(코드) 와 어긋남.
- **Why not**: POC 라도 reproducibility 가 중요한 가드레일(§Supabase / RLS — "모든 스키마 변경은 migration 으로"). Studio 직접 변경 금지 정책과 충돌.

### 2. 0001_init.sql 을 사후 수정

- **Pros**: 단일 출처(트리거 정의와 GRANT 가 한 파일).
- **Cons**: AGENTS.md §Supabase / RLS 의 "번호 재정렬·기존 migration 수정 금지" 위반. 이미 production 적용된 migration 변경은 재현성 깨짐.
- **Why not**: 가드레일 위반.

### 3. integration job 을 local Supabase 로 이전 (D-014 재검토)

- **Pros**: shared 프로젝트의 외부 상태 의존이 사라져 같은 종류의 회귀를 구조적으로 차단.
- **Cons**: workflow · 시드 · 비밀키 운영을 새로 짜야 함 (1~2h+). UI 리비전 PR 흐름에 끼우기엔 큼.
- **Why not**: 본 회귀의 즉시 해소는 GRANT 한 줄이면 충분. 환경 분리는 별도 후속 ADR 로 분리해서 차분히 진행하는 게 비용·리스크 균형이 맞다.

## Consequences

### 긍정적

- shared Supabase 프로젝트가 외부 사유로 재구성/복제되더라도 같은 회귀가 재발하지 않음 — `supabase db push` 만으로 권한 상태가 SoT 에 정렬된다.
- "Database error granting user" → FK violation 도미노 시나리오의 단일 근본 원인이 코드로 박제됨 (다음 사람이 디버깅 비용 0).

### 부정적 / 비용

- migration 한 줄 추가 외 비용 없음.
- `supabase_auth_admin` role 에 함수 실행 권한을 명시 부여하는 것이 작은 표면적 확대이긴 하나, 트리거가 본래 GoTrue 흐름의 일부라 의도된 권한이다.

### 후속 영향

- 다음 후보 ADR: **integration job 의 local Supabase 이전** (D-014 재검토) — shared 프로젝트 외부 상태에 CI 가 결합된 구조 자체를 떼어내기 위함. 본 ADR 범위 밖, 별도 PR.
- `truncate_test_data` 등 다른 service_role 전용 함수는 GoTrue 가 호출하지 않으므로 동일 패턴 적용 불필요. 새 트리거 함수를 auth flow 에 추가할 때만 동일 GRANT 누락에 주의.
