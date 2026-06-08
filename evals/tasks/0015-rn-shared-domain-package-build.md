---
Task: EVAL-0015
Track: port
Kind: migration
Status: blocked
Blocked-by: EVAL-0010(RN monorepo foundation) complete.
Parent: docs/PRD.md, docs/migration/00-rn-conversion-plan.md, docs/migration/02-rn-migration-harness.md, docs/migration/04-rn-architecture.md
---

# EVAL-0015: G6 Shared domain package build — validators/keywords/challenge/bank/share

> 00 §8 G6. EVAL-0010이 빈 `@withkey/domain` 셸 생성; 이 task가 순수 모듈·공유 테스트로 채운다.

## Parent Links

- PRD Feature: [docs/PRD.md](../../docs/PRD.md) §3~§7 (challenge/action/keywords/Kudos/share 도메인).
- Test Scenario: [02 §5.2](../../docs/migration/02-rn-migration-harness.md) preservation evals.
- Job Story: [docs/stories/2026-06-02-photo-verification-job-stories.md](../../docs/stories/2026-06-02-photo-verification-job-stories.md) S1~S4.
- Engineering Story: [02 §3.2](../../docs/migration/02-rn-migration-harness.md) + [04 §1 A2](../../docs/migration/04-rn-architecture.md).
- Work Package: `feat/rn-shared-domain` (G6).

## Goal

`packages/domain`을 순수 도메인 코드로 채워 web·RN이 공유 import한다. validators/keywords/challenge/bank/share 모듈·테스트가 `@withkey/domain`에서 export되고, web·mobile이 동일 source를 소비한다. drift를 차단한다.

## Source Files to Inspect

- `docs/PRD.md`
- `docs/migration/00-rn-conversion-plan.md`
- `docs/migration/02-rn-migration-harness.md`
- `docs/migration/03-rn-migration-rules.md`
- `docs/migration/04-rn-architecture.md`
- `apps/web/src/lib/validators`
- `apps/web/src/lib/keywords`
- `apps/web/src/lib/challenge`
- `apps/web/src/lib/bank`
- `apps/web/src/lib/share`

## Target Files

- `packages/domain` — 순수 모듈·테스트, `src/index.ts` export.
- `apps/web/src/lib` — 로컬 pure-domain import → `@withkey/domain` 교체.
- `apps` — mobile은 `@withkey/domain` 소비; 중복 금지.

## Requirements

- 순수 TS 모듈만 이동: validators/keywords/challenge/bank/share. Server-only/DB client/React/Next cache/RN capability 제외.
- zod 타입 SoT 보존; 도메인 타입은 `z.infer<>` 도출.
- `KEYWORD_POOL_VERSION`·pool 내용 수정 금지(freeze).
- `./src/index.ts` source-direct export; `dist` 불필요.
- unit tests도 함께 이동; `packages/domain`에서 통과.
- `apps/web`은 `@withkey/domain`으로 import; cross-package 상대 import 금지.
- mobile에서 domain 로직 재구현 금지.

## Non-goals

- DB reads/Supabase/Server Actions/analytics/AI/push/React UI 이동.
- Read model 계약(EVAL-0016), keyword pool 변경, 레지스트리 배포.
- P1/P2 settlement/auto-verification 규칙.

## Acceptance Criteria

| 기준                     | 검증 방법                                          |
| ------------------------ | -------------------------------------------------- |
| pure module coverage     | 5모듈이 `@withkey/domain` export                   |
| tests moved and green    | 이동된 unit tests가 package-level pass             |
| web consumes package     | web imports via `@withkey/domain`                  |
| no server leakage        | domain에 Next/Supabase/React/fs/native import 없음 |
| keyword freeze preserved | `KEYWORD_POOL_VERSION`·pool 내용 불변              |
| workspace verification   | `pnpm -r typecheck/lint/test` pass                 |
| harness traceability     | `pnpm harness:check` passes                        |

## Verification Commands

```bash
pnpm harness:context EVAL-0015
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm --filter @withkey/domain test
pnpm harness:check
pnpm validate:docs
```

## Expected Output Summary

이동·제외 모듈, web import 전환, keyword pool 무변경, G7/G8 unblock 상태를 한국어로 요약.

## Harness Impact Questions

1. New folder structure? Yes — domain subfolders mirror `src/lib`.
2. New naming convention? Maybe — `@withkey/domain` exports.
3. New dependency? No.
4. Verification commands changed? Yes — domain tests join `pnpm -r test`.
5. Harness outdated? Maybe — old `src/lib` paths in docs.
6. `.agents/` update? Only if domain paths become harness inputs.

## Stop Condition

- 모든 모듈 패밀리 공유 또는 명시적 제외(근거 필수).
- web/domain/mobile 타입 경계 통과.
- pass@3 실패 시 validators / keywords+challenge / bank+share로 split.
