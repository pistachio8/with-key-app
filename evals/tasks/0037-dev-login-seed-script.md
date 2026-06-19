---
Task: EVAL-0037
Track: greenfield
Kind: migration
Status: blocked
Depends-on: [task:EVAL-0033] — DEV_ACCOUNTS 상수·allowlist 이메일 집합이 서버 코어와 일치해야 함.
Blocked-by: [po:seed-run-approval] — linked 공유 Supabase에 1회 수동 실행은 PO 승인 후 사람이 직접. append-only ledger라 비가역.
Parent: docs/superpowers/specs/2026-06-19-dev-login-mode-design.md, docs/eng-stories/2026-06-19-dev-login-mode.md
---

# EVAL-0037: dev-seed-accounts 스크립트 — 2종 fixture 멱등 생성

> WP5 (`feat/dev-login-mode`). `member-active`·`balance` 계정 + fixture data. migration-reviewer 교정(action_logs NOT NULL·group_members RLS) 반영. spec §6·§6.1·§6.2·§6.3.

## Parent Links

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: [2026-06-19-dev-login-mode](../../docs/eng-stories/2026-06-19-dev-login-mode.md) WP5
- Parent Work Package: `feat/dev-login-mode` (WP5)

## Goal

`apps/web/scripts/dev-seed-accounts.mjs` 가 공유 Supabase에 **결정적 UUID + skip-if-exists** 방식으로 2종 fixture 계정을 생성한다. 스크립트는 멱등이라 여러 번 실행해도 동일 결과. `point_ledger` append-only 제약 때문에 잔액은 `grant_bundle_points` RPC로만 부여하고, 고정 `ref_id`로 재실행 no-op를 보장한다. **실제 실행은 ops 게이트(사람) 해소 후** — 이 task는 스크립트 코드 완성 + dry-run 검증이 목표.

## Source Files to Inspect

- `apps/web/scripts/dev-login-link.mjs` — adminClient 패턴·hashed_token 필드명
- `supabase/migrations/0001_init.sql` — `action_logs` NOT NULL/CHECK 제약 전체
- `supabase/migrations/0002_rls.sql` — `group_members` RLS 정책(INSERT 없음 확인)
- `supabase/migrations/0044_settlement_rpcs.sql` — `grant_bundle_points` 시그니처·service_role 전용·`ref_id` 멱등 (line ~28)
- `docs/superpowers/specs/2026-06-19-dev-login-mode-design.md` §6·§6.1·§6.2·§6.3

## Target Files

- `apps/web/scripts/` — 신규 dev-seed-accounts.mjs (2종 fixture 멱등 생성)

## Requirements

- `adminClient()` (service_role) 사용 — `group_members` INSERT는 service_role 전용 RLS.
- 계정별 결정적 UUID(하드코딩 고정값) + `on conflict do nothing`.
- `admin.createUser({ email, email_confirm: true })` → 이미 존재하면 skip.
- `member-active@fromwith.test`: `users`→`groups`→`group_members`(service_role)→활성 `challenges`(start_at/end_at 직접)→`challenge_participants`(signed_at set, deposit_points=0)→`action_logs`(**NOT NULL/CHECK 전부 공급**: photo_url·selected_keywords(1~3개)·shown_keywords·ai_summary(≤150자)·prompt_version·activity_type enum).
- `balance@fromwith.test`: `users`→`groups`→`group_members`(service_role)→`grant_bundle_points(user_id, group_id, amount, ref_id='dev-seed-balance-v1')` RPC 1회. 직접 point_ledger insert 금지(트리거 차단).
- `on conflict do nothing` + `ref_id` 고정으로 멱등. 파괴적 reset(DELETE/UPDATE) 코드 없음.
- `--dry-run` 플래그 시 실제 insert 없이 계획 출력.

## Non-goals

- CI 자동 재seed — 후속.
- 3종 이상 추가 fixture 계정 — 후속.
- `point_ledger` 직접 DELETE/UPDATE — append-only 불변, 불가.
- 정산 full lifecycle(`hold_deposit`·`settle_challenge`) — spec §11 후속.

## Acceptance Criteria

| 기준                            | 검증 방법                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| action_logs NOT NULL 전부 공급  | 코드에서 `photo_url`·`selected_keywords`·`ai_summary`·`prompt_version`·`activity_type` 확인 |
| grant_bundle_points ref_id 고정 | grep 'dev-seed-balance-v1' 스크립트                                                         |
| group_members insert admin 방식 | adminClient 사용 확인 (service_role)                                                        |
| 파괴적 reset 없음               | grep 'DELETE\|UPDATE' 스크립트 → 빈 결과                                                    |
| --dry-run 플래그 동작           | node dev-seed-accounts.mjs --dry-run → 에러 없음                                            |
| typecheck(mjs라 lint 선택)      | 스크립트 dry-run + `pnpm typecheck` PASS                                                    |
| harness traceability            | `pnpm harness:check` PASS                                                                   |

## Verification Commands

```bash
pnpm harness:context EVAL-0037
# 스크립트 dry-run (실제 Supabase 연결 불필요 — 실행 흐름 확인)
node apps/web/scripts/dev-seed-accounts.mjs --dry-run
pnpm typecheck
pnpm harness:check
# 실제 실행은 ops 게이트(po:seed-run-approval) 해소 후 사람이 직접:
# node apps/web/scripts/dev-seed-accounts.mjs
```

## Expected Output Summary

`dev-seed-accounts.mjs` 의 계정별 fixture 전략 차이(member-active는 action_logs 전 컬럼 공급, balance는 grant_bundle_points만), group_members가 service_role 전용인 이유(RLS INSERT 정책 부재), `ref_id` 고정으로 멱등을 보장하는 방식, `--dry-run` 구현을 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. New folder structure? No (`scripts/` 기존).
2. New naming convention? No.
3. New dependency? `adminClient` 패턴 재사용 여부 확인.
4. Verification commands changed? No.
5. Harness instructions outdated? No.
6. `.agents/` update needed? → yes 있으면 `evals/drift-reports/` 노트.

## Stop Condition

- dry-run PASS + action_logs 전 컬럼 공급 코드 확인 + 파괴적 reset 없음 grep + `pnpm harness:check` PASS.
- 실제 실행은 `po:seed-run-approval` 게이트 해소 후.
- pass@3 미달 → member-active / balance 스크립트 분리.
