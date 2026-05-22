# ADR-0018: `on_auth_user_created` 트리거 재생성으로 disabled 회귀 복구

**Date**: 2026-05-22
**Status**: accepted
**Deciders**: pistachio8

## Context

- 2026-05-22 12:15 부터 `Integration (shared with-key project)` job 이 양쪽 PR (`#85` · `#86`) 에서 일관 FAIL. 직전 마지막 성공 (2026-05-22 10:57, develop merge of PR #84) 과 그 사이 develop 커밋은 0건 — 코드 회귀 없음.
- 실패 패턴이 ADR-0005 와 동일:
  - `auth.admin.createUser` 가 `Database error granting user` 반환
  - 후속 테스트에서 `groups_owner_id_fkey` · `Invalid login credentials` · `challenges_group_id_fkey` 가 도미노로 발생
- 진단 과정:
  - 트리거 함수 `public.handle_new_auth_user()` 의 본문은 0027 과 동일, `prosecdef = true`, owner = `postgres` 정상
  - `information_schema.routine_privileges` 의 `supabase_auth_admin` EXECUTE 권한 부여 정상 (ADR-0005 후속 0024 migration 이 SoT)
  - `public.users` 의 `relrowsecurity = true`, `relforcerowsecurity = false` 정상
  - postgres 로 `INSERT INTO auth.users` 수동 실행 시 트리거가 fire 되어 `handle_new_auth_user()` 본문이 실행됨을 확인 (CHECK 위반까지 도달)
  - 그러나 `pg_trigger.tgenabled` 가 정상값 `'O'` 가 아닌 disabled 상태로 표시됨 — 외부 작업이 트리거 자체를 비활성화한 것으로 추정
- Supabase Studio SQL Editor 의 postgres role 은 `auth.users` 의 owner(`supabase_auth_admin`) 가 아니므로 `ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created` 실행 시 `42501: must be owner of table users` 에러 반환 → Studio 직접 복구 불가.
- `supabase db push --linked` 는 신규 migration 만 적용하므로 기존 0001_init.sql 의 `create trigger` 문을 재실행하지 않음 → 단순 push 로는 disabled 트리거 복구 불가.

## Decision

신규 migration `supabase/migrations/0035_reenable_on_auth_user_created.sql` 로 `on_auth_user_created` 트리거를 **DROP IF EXISTS + CREATE** 패턴으로 멱등 재생성한다.

- migration 은 elevated 권한 (Supabase platform 의 service role) 으로 실행되므로 `auth.users` 트리거 조작 가능.
- 새 트리거는 기본 `tgenabled = 'O'` (enabled) 로 생성됨.
- 정의는 0001_init.sql 의 원본과 동일 — 함수 본문 변경 없음, 트리거 발화 조건 (`after insert on auth.users for each row`) 동일.
- 적용 후 검증: shared 프로젝트에서 `SELECT tgenabled FROM pg_trigger WHERE tgname = 'on_auth_user_created'` 가 `'O'` 반환 → 양쪽 PR 의 Integration job 재실행 → 통과 확인.

## Alternatives Considered

### 1. Studio SQL Editor 에서 `ALTER TABLE auth.users ENABLE TRIGGER` 단발 실행

- **Pros**: 즉시 효과. migration 추가 없음.
- **Cons**: postgres role 이 owner 아니라 `42501` 에러로 실행 불가. 가능했더라도 환경 재구성·새 Supabase 프로젝트 복제 시 동일 회귀 재발 — 권한 상태가 SoT(코드) 와 어긋남 (ADR-0005 의 같은 논거).
- **Why not**: 권한상 불가능 + SoT 위반.

### 2. 0001_init.sql 의 `create trigger` 문을 사후 수정

- **Pros**: 단일 출처 (트리거 정의 원본 갱신).
- **Cons**: AGENTS.md §Supabase / RLS — "번호 재정렬·기존 migration 수정 금지" 위반. 이미 production 적용된 migration 변경은 재현성 깨짐.
- **Why not**: 가드레일 위반.

### 3. Integration job 을 local Supabase 로 이전 (ADR-0005 §후속 영향 의 재검토)

- **Pros**: shared 프로젝트의 외부 상태 의존이 사라져 같은 종류의 회귀를 구조적으로 차단. 이번이 두 번째 동일 패턴 회귀라 가치 입증됨.
- **Cons**: workflow · 시드 · 비밀키 운영을 새로 짜야 함 (1~2h+). 현재는 CI 즉시 회복이 우선.
- **Why not**: 본 회귀의 즉시 해소는 migration 한 파일이면 충분. 환경 분리는 별도 후속 ADR 로 분리해서 차분히 진행. 본 ADR 의 후속 액션 항목으로 기록.

## Consequences

### 긍정적

- shared 프로젝트가 외부 사유로 트리거 비활성화 / 재구성 되더라도 다음 `db push` 한 번으로 SoT 에 정렬됨.
- "Database error granting user" → FK violation 도미노 시나리오의 두 번째 발생 원인 (트리거 disabled) 이 코드로 박제됨.

### 부정적 / 비용

- migration 한 파일 외 비용 없음.
- 트리거 DROP 시점과 CREATE 시점 사이의 microsecond 윈도우에 새 auth.users insert 가 들어오면 `public.users` 동기화를 놓침. shared 프로젝트의 정상 활동량 (devs only) 을 고려할 때 무시 가능. 진짜 우려되면 트랜잭션으로 감쌀 수 있으나 trigger DDL 은 implicit lock 을 잡아 동시 INSERT 가 차단되므로 추가 보호 불필요.

### 후속 영향

- ADR-0005 의 §후속 영향 항목 ("integration job 의 local Supabase 이전") 의 우선순위 ↑ — 동일 패턴 2회 회귀 발생. 별도 PR/ADR 로 진행 검토.
- 새 트리거를 auth flow 에 추가할 때, 본 회귀 가능성을 인지하고 migration 으로 enable 상태를 명시 보장.
