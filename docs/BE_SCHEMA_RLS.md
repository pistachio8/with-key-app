# BE_SCHEMA RLS Policy Contract

> **문서 상태**: Draft v0.1 · **작성일**: 2026-04-30
> **상위**: [BE_SCHEMA.md](./BE_SCHEMA.md) §7
> **역할**: `BE_SCHEMA §7` 의 matrix 를 실제 `CREATE POLICY` predicate 수준으로 구체화. `0002_rls.sql` 은 이 문서를 SQL 로 옮긴 결과.

## 0. 공통 헬퍼

```sql
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql stable security invoker
set search_path = public as $$
  select exists(
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;
```

- **`stable`**: 같은 트랜잭션 내 결과 재사용 허용 → planner 가 caller predicate 와 결합 효율화.
- **`security invoker`**: 호출자의 RLS 가 `group_members` 에도 적용.

## 1. 테이블별 정책

### 1.1 `users`

| Op     | Predicate                                                                                                       | 인덱스 요구                        |
| ------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| SELECT | `id = auth.uid() OR EXISTS(gm1 JOIN gm2 ON group_id WHERE gm1.user_id = auth.uid() AND gm2.user_id = users.id)` | `group_members(user_id, group_id)` |
| INSERT | `id = auth.uid()`                                                                                               | —                                  |
| UPDATE | `id = auth.uid()` (USING + WITH CHECK)                                                                          | —                                  |
| DELETE | `false`                                                                                                         | —                                  |

### 1.2 `groups`

| Op     | Predicate                                    |
| ------ | -------------------------------------------- |
| SELECT | `is_group_member(id)`                        |
| INSERT | `owner_id = auth.uid()` (WITH CHECK)         |
| UPDATE | `owner_id = auth.uid()` (USING + WITH CHECK) |
| DELETE | `false`                                      |

### 1.3 `group_members`

| Op     | Predicate                                                      |
| ------ | -------------------------------------------------------------- |
| SELECT | `is_group_member(group_id)`                                    |
| INSERT | service_role only (초대 수락 Server Action 경유)               |
| UPDATE | `false`                                                        |
| DELETE | `user_id = auth.uid() OR EXISTS(groups.owner_id = auth.uid())` |

### 1.4 `invites`

| Op     | Predicate  |
| ------ | ---------- |
| SELECT | owner only |
| INSERT | owner only |
| UPDATE | `false`    |
| DELETE | owner only |

### 1.5 `challenges`

| Op     | Predicate                                                             |
| ------ | --------------------------------------------------------------------- |
| SELECT | `is_group_member(group_id)`                                           |
| INSERT | owner only (WITH CHECK)                                               |
| UPDATE | `status='pending'` AND owner AND NEW.status IN ('pending','accepted') |
| DELETE | `false`                                                               |

> `accepted→active` 전이는 RPC(`sign_and_maybe_activate`) 에서 `security invoker` 로 수행. 정책은 해당 RPC 내부 UPDATE 만 허용하도록 인수 검증.

### 1.6 `challenge_participants`

| Op     | Predicate                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------ |
| SELECT | `is_group_member(challenges.group_id)` via inner join                                                  |
| INSERT | service_role only                                                                                      |
| UPDATE | `user_id = auth.uid()` (`signed_at` 만 변경, `deposit_points` 는 trigger 로 service_role 외 변경 차단) |
| DELETE | `false`                                                                                                |

### 1.7 `point_ledger`

| Op     | Predicate                                                                    |
| ------ | ---------------------------------------------------------------------------- |
| SELECT | `user_id = auth.uid() OR is_group_member(group_id)`                          |
| INSERT | service_role/RPC only. 정책 없음 + BEFORE trigger 가 service_role 외 `42501` |
| UPDATE | `false`. BEFORE trigger 가 append-only 위반으로 `42501`                      |
| DELETE | `false`. BEFORE trigger 가 append-only 위반으로 `42501`                      |

### 1.8 `settlements`

| Op     | Predicate                                                                    |
| ------ | ---------------------------------------------------------------------------- |
| SELECT | `is_group_member(challenges.group_id)` via inner join                        |
| INSERT | service_role/RPC only. 정책 없음 + BEFORE trigger 가 service_role 외 `42501` |
| UPDATE | `false`. BEFORE trigger 가 immutable snapshot 위반으로 `42501`               |
| DELETE | `false`. BEFORE trigger 가 immutable snapshot 위반으로 `42501`               |

### 1.9 `action_logs`

| Op     | Predicate                                                              |
| ------ | ---------------------------------------------------------------------- |
| SELECT | `is_group_member(challenges.group_id)`                                 |
| INSERT | `user_id = auth.uid()` AND challenge active AND 기간 내                |
| UPDATE | `user_id = auth.uid()` AND `created_at > now() - interval '5 minutes'` |
| DELETE | `false` (PRD §4.3 AC-6)                                                |

> AI 컬럼(ai_summary, template_fallback, regenerate_count, prompt_version)의 클라이언트 변경 차단은 BEFORE UPDATE 트리거(`prevent_ai_column_update`)로 방어 — RLS 가 column-level 제한을 직접 표현할 수 없음.

### 1.10 `kudos`

| Op     | Predicate                                                                   |
| ------ | --------------------------------------------------------------------------- |
| SELECT | `is_group_member(challenges.group_id)` via action_logs JOIN                 |
| INSERT | `user_id = auth.uid()` AND `action_log.user_id != auth.uid()` AND 같은 그룹 |
| UPDATE | `false`                                                                     |
| DELETE | `user_id = auth.uid()` (토글 취소)                                          |

### 1.11 `push_subscriptions`

| Op  | Predicate              |
| --- | ---------------------- |
| ALL | `user_id = auth.uid()` |

### 1.12 `events`

| Op            | Predicate                                 |
| ------------- | ----------------------------------------- |
| SELECT        | service_role only                         |
| INSERT        | `user_id = auth.uid() OR user_id IS NULL` |
| UPDATE/DELETE | `false`                                   |

## 2. 인덱스 요약

`BE_SCHEMA §6` 의 8 인덱스 전부 필요 + 추가:

- **`group_members(user_id, group_id)`** — `users` SELECT 정책 inner loop 가속. §6 에 누락되어 있으므로 `0001_init.sql` 에 추가.
- **`point_ledger(user_id, group_id, created_at desc)`** — user/group 잔액 및 이력 조회.
- **`point_ledger(group_id, created_at desc)`** — 그룹 정산 투명성 read.
- **`point_ledger(challenge_id)` partial** — 챌린지 정산 관련 원장 조회.

## 3. Realtime publication (POC 결정)

POC 범위 **비활성**. 이유: 4명 소규모 그룹 체감 이슈 낮음 + RLS 호환 publication 설정 비용. v1 에서 "피드 실시간" 이 hot path 되면 재검토.

## 4. Follow-up

- [ ] pgTAP 기반 RLS 스모크 테스트 (v1)
- [ ] `challenges.status` 전이 RPC `security definer` 감사 로그 (v1)
- [ ] `events.props` jsonb schema validation (v1)
