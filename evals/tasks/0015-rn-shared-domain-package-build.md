---
Task: EVAL-0015
Track: port
Kind: migration
Status: blocked
Blocked-by: EVAL-0010(RN monorepo foundation) complete.
Parent: docs/PRD.md, docs/migration/00-rn-conversion-plan.md, docs/migration/02-rn-migration-harness.md, docs/migration/04-rn-architecture.md
---

# EVAL-0015: G6 Shared domain package build — validators/keywords/challenge/bank/share

> 00 §8 G6. EVAL-0010 creates the empty `@withkey/domain` shell; this task fills it with pure modules and shared tests.

## Parent Links

- Parent PRD Feature: POC domain rules for challenge/action/keywords/Kudos/share — [docs/PRD.md](../../docs/PRD.md) §3~§7.
- Parent Test Scenario: existing unit tests become deterministic preservation evals per [02 §5.2](../../docs/migration/02-rn-migration-harness.md).
- Parent Job Story: 인증/피드/정산 표시의 도메인 규칙이 web과 RN에서 같아야 한다 — [docs/stories/2026-06-02-photo-verification-job-stories.md](../../docs/stories/2026-06-02-photo-verification-job-stories.md) S1~S4.
- Parent Engineering Story: [02 §3.2 packages/domain](../../docs/migration/02-rn-migration-harness.md) + [04 §1 A2](../../docs/migration/04-rn-architecture.md).
- Parent Work Package: `feat/rn-shared-domain` (G6).

## Goal

web과 RN이 같은 순수 도메인 코드를 import하도록 `packages/domain`을 채운다. 이 task가 끝나면 validators, keywords, challenge, bank, share 순수 모듈과 해당 unit tests가 `@withkey/domain`에서 export되고, `apps/web`은 상대 경로나 app-local alias가 아니라 workspace package를 통해 이 모듈을 소비할 수 있으며, mobile도 동일 source/test를 소비할 준비가 된다. 결과적으로 RN 포팅 중 도메인 규칙 재구현으로 생기는 drift를 차단한다.

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

- `packages/domain` — move pure modules/tests and export from `src/index.ts`.
- `apps/web/src/lib` — replace local pure-domain imports with `@withkey/domain` where scoped.
- `apps` — mobile consumes `@withkey/domain`; do not duplicate domain code.

## Requirements

- Move only pure TypeScript modules: validators, keywords, challenge, bank, share. Server-only modules, DB clients, React components, Next cache, and RN capability code stay out.
- Preserve zod schemas as type SoT; exported domain types use `z.infer<>`.
- Preserve keyword pool freeze and `KEYWORD_POOL_VERSION`; do not edit pool contents.
- Keep `@withkey/domain` source-direct export (`./src/index.ts`) without `dist` build output.
- Existing unit tests for moved modules must move with the modules and pass in `packages/domain`.
- `apps/web` imports moved domain modules via `@withkey/domain`; relative cross-package imports are forbidden.
- Mobile code must not reimplement done-day, penalty, keyword, bank, share, or validator logic inside features.

## Non-goals

- Moving DB reads, Supabase clients, Server Actions, analytics server emitter, AI, push, storage, or React UI.
- Designing read model contracts — EVAL-0016.
- Changing domain behavior or keyword pool.
- Adding new greenfield P1/P2 settlement or auto-verification domain rules.
- Publishing a package to a registry.

## Acceptance Criteria

| 기준                     | 검증 방법                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------- |
| pure module coverage     | validators/keywords/challenge/bank/share are exported from `@withkey/domain`            |
| tests moved and green    | package-level unit tests pass and cover moved behavior                                  |
| web consumes package     | web imports moved modules from `@withkey/domain` where migrated                         |
| no server leakage        | `packages/domain` has no Next, Supabase client, React, fs, or native capability imports |
| keyword freeze preserved | `KEYWORD_POOL_VERSION` and pool contents are unchanged                                  |
| workspace verification   | `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test` pass                                |
| harness traceability     | `pnpm harness:check` passes                                                             |

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

완료 보고는 `@withkey/domain`으로 이동한 모듈과 제외한 서버/UI 모듈, web import 전환 범위, 공유 unit test 결과, keyword pool 무변경 증거, 후속 G7/G8 unblock 상태를 한국어로 요약한다.

## Harness Impact Questions

1. Did this task introduce a new folder structure? Yes if domain subfolders mirror old `src/lib` structure.
2. Did this task introduce a new naming convention? Maybe — public exports from `@withkey/domain`.
3. Did this task introduce a new dependency? No; package should stay pure and dependency-light.
4. Did this task change verification commands? Yes — `@withkey/domain` tests become part of `pnpm -r test`.
5. Did this task reveal that the current harness instructions are outdated? Maybe — if old `src/lib` paths remain in docs.
6. Should any `.agents/` document be updated? Only if harness context paths assume domain modules live under web.

## Stop Condition

- All listed module families are shared or explicitly excluded with rationale.
- web/domain/mobile type boundaries pass.
- pass@3 안에 green 못 만들면 validators / keywords+challenge / bank+share로 split.
