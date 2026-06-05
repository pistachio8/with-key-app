---
Task: EVAL-0016
Track: port
Kind: migration
Status: blocked
Blocked-by: EVAL-0015(G6 shared domain package) complete + ADR/spec if 00 §13.4 D-4 admin hydrate RN contract remains unresolved.
Parent: docs/PRD.md, docs/migration/00-rn-conversion-plan.md, docs/migration/02-rn-migration-harness.md, docs/migration/04-rn-architecture.md
---

# EVAL-0016: G7 Read model contract — Home/challenge/group/recap/me RN-safe boundaries

> 00 §8 G7. This task defines contracts before screens consume data. It must not silently carry Next cache/cookie/admin hydrate assumptions into RN.

## Parent Links

- Parent PRD Feature: POC read surfaces home/challenge/feed/group/recap/me — [docs/PRD.md](../../docs/PRD.md) §10.
- Parent Test Scenario: read contract snapshot preservation evals from [02 §5.2](../../docs/migration/02-rn-migration-harness.md).
- Parent Job Story: 사용자가 홈·피드·현황·프로필에서 같은 DB 상태를 web/RN 모두에서 신뢰한다 — [docs/stories/2026-06-02-photo-verification-job-stories.md](../../docs/stories/2026-06-02-photo-verification-job-stories.md) S3~S5.
- Parent Engineering Story: [00 §13.3 Read matrix freeze](../../docs/migration/00-rn-conversion-plan.md) + [04 §5 A8 data layer](../../docs/migration/04-rn-architecture.md).
- Parent Work Package: `feat/rn-read-contracts` (G7).

## Goal

RN read screens가 의존할 read model 계약을 고정한다. 이 task가 끝나면 Home, challenge feed/dashboard/info, group detail, recap, me/challenges/profile의 read contract가 RN-safe direct Supabase/RPC인지 BFF API인지 명시되고, `next/cache`·cookies·service-role/admin hydrate 의존 여부가 함수별로 드러난다. 후속 G8 화면은 이 계약만 소비하고, Next Server Component read 함수를 그대로 복사하지 않는다.

## Source Files to Inspect

- `docs/PRD.md`
- `docs/migration/00-rn-conversion-plan.md`
- `docs/migration/02-rn-migration-harness.md`
- `docs/migration/03-rn-migration-rules.md`
- `docs/migration/04-rn-architecture.md`
- `apps/web/src/lib/db/reads`
- `apps/web/src/app/(app)/home`
- `apps/web/src/app/(app)/challenge/[id]`
- `apps/web/src/app/(app)/group/[id]`
- `apps/web/src/app/(app)/me`

## Target Files

- `apps` — create mobile read service/API contracts under the relevant feature slices.
- `apps/web/src/lib/db/reads` — source for contract extraction; avoid behavior drift.
- `packages/domain` — shared view-model types only if they are pure.
- `docs/adr` — required if D-4 admin hydrate read contract is still undecided.

## Requirements

- For every read in 00 §13.3, classify the RN contract as RLS direct, RPC direct, or BFF/server-only. Keep service-role/admin hydrate paths out of the mobile client.
- Define stable TypeScript return types for Home, challenge detail/feed/dashboard/info, group detail, recap, me/profile, and my challenges.
- Remove/replace `cookies()`, `@supabase/ssr`, and `next/cache` assumptions at the contract boundary; do not call them from mobile code.
- Preserve Layer 1 visibility for feed/photo access. If admin hydrate remains the chosen server strategy, expose it only behind BFF after the RLS visibility gate.
- Add fixture/snapshot tests comparing existing web read view model output with RN-safe contract output where practical.
- Document invalidation/query-key expectations for follow-up screens without introducing greenfield state-library decisions beyond accepted specs.
- Keep RLS as the authorization boundary; no service-role result may be cached or shipped directly to arbitrary mobile clients.

## Non-goals

- Building read-only screens — EVAL-0017.
- Implementing mutations — EVAL-0018.
- Native action log submission — EVAL-0019.
- Changing DB schema/RLS.
- Rewriting product copy or screen IA.

## Acceptance Criteria

| 기준                        | 검증 방법                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------- |
| full read matrix covered    | each 00 §13.3 read has RN contract classification                                      |
| admin/cache/cookie visible  | service-role, cache, and cookie dependencies are explicit in code/docs/tests           |
| contract types stable       | exported types compile in mobile and web contexts                                      |
| preservation snapshots      | core fixtures for home/challenge/feed/recap/me match expected web view-model semantics |
| no mobile service-role leak | mobile code has no admin client/server secret path                                     |
| harness traceability        | `pnpm harness:check` passes                                                            |

## Verification Commands

```bash
pnpm harness:context EVAL-0016
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm --filter @withkey/mobile test -- read
pnpm harness:check
pnpm validate:docs
```

## Expected Output Summary

완료 보고는 read별 RN 계약 분류표, BFF가 필요한 admin hydrate 경계, cache/cookie 제거 지점, snapshot 보존 결과, G8 화면이 소비할 API 목록을 한국어로 요약한다.

## Harness Impact Questions

1. Did this task introduce a new folder structure? Maybe — mobile feature `api/` and `hooks/` folders.
2. Did this task introduce a new naming convention? Yes if query keys/read service names are standardized.
3. Did this task introduce a new dependency? No unless accepted state/query spec adds one.
4. Did this task change verification commands? Maybe — read snapshot tests join mobile/domain test scope.
5. Did this task reveal that the current harness instructions are outdated? Maybe — read matrix may need deterministic checker.
6. Should any `.agents/` document be updated? Only if read-contract checks become harness mechanics.

## Stop Condition

- Every 00 §13.3 read has a contract and testable boundary.
- All verification commands pass.
- pass@3 안에 green 못 만들면 RLS-direct reads / BFF admin hydrate reads / recap-me reads로 split.
