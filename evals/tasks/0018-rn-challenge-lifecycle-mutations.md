---
Task: EVAL-0018
Track: port
Kind: migration
Status: blocked
Blocked-by: EVAL-0017(G8 read-only screens) complete.
Parent: docs/PRD.md, docs/migration/00-rn-conversion-plan.md, docs/migration/03-rn-migration-rules.md, docs/migration/04-rn-architecture.md
---

# EVAL-0018: G9 Challenge lifecycle mutations — create/invite/pledge/start parity

> 00 §8 G9. This task ports the core challenge lifecycle writes and proves PWA/RN DB compatibility.

## Parent Links

- Parent PRD Feature: challenge creation, invite, pledge, start — [docs/PRD.md](../../docs/PRD.md) §3.
- Parent Test Scenario: pledge/invite/create lifecycle scenarios are embedded below per D10, with POC PRD §3 AC as source.
- Parent Job Story: 그룹장이 챌린지를 만들고 멤버가 서약해 코호트를 시작한다 — [docs/PRD.md](../../docs/PRD.md) §3.1~§3.4.
- Parent Engineering Story: [00 §9 Server Action 승격 후보](../../docs/migration/00-rn-conversion-plan.md) + [04 §5 A8 Hybrid](../../docs/migration/04-rn-architecture.md).
- Parent Work Package: `feat/rn-challenge-lifecycle` (G9).

## Goal

RN에서 챌린지 lifecycle mutation의 핵심 경로가 동작하고, 같은 DB 상태를 기존 PWA가 정상 표시한다. 이 task가 끝나면 RN 사용자는 challenge create, invite accept, pledge sign, signed participants start를 수행할 수 있고, 각 write는 00 §13.2 action matrix의 RPC/BFF/RN-direct 분류를 따른다. RN과 PWA가 같은 Supabase/RPC를 공유해도 상태 전이가 깨지지 않아야 한다.

## Source Files to Inspect

- `docs/PRD.md`
- `docs/migration/00-rn-conversion-plan.md`
- `docs/migration/03-rn-migration-rules.md`
- `docs/migration/04-rn-architecture.md`
- `apps/web/src/app/(flow)/challenge/new`
- `apps/web/src/app/(auth)/invite/[token]`
- `apps/web/src/app/(app)/challenge/[id]/pledge`
- `apps/web/src/app/(app)/challenge/[id]/_actions.ts`
- `supabase/migrations/0021_create_challenge_rpc.sql`
- `supabase/migrations/0028_pending_invite_start_flow.sql`

## Target Files

- `apps` — implement mobile create/invite/pledge/start feature mutations and UI flows.
- `supabase/migrations` — only append RPC changes if the existing contract is insufficient; no reorder.
- `apps/web/src/app` — PWA compatibility reference/smoke only; preserve web behavior.
- `packages/domain` — consume validators and challenge rules.

## Requirements

- `createChallenge` path follows 00 §13.2 classification: `create_challenge` RPC for core creation, with invite/push side effects behind approved API/RPC boundaries.
- `acceptInvite` uses existing `accept_invite` RPC semantics; idempotent already-joined handling preserved.
- `signPledge` uses `sign_and_maybe_activate` RPC and preserves pending/active participant freeze semantics.
- `startChallengeWithSignedParticipants` uses its RPC contract and preserves owner-only start rules.
- Use shared `@withkey/domain` validators for challenge/group/invite inputs.
- After RN mutation, existing PWA home/challenge/pledge views show the same DB state correctly.
- RLS role tests cover unauthorized create/accept/sign/start attempts where feasible.
- Side effects (push/analytics) use approved server/BFF paths; do not place service-role keys in mobile.

## Non-goals

- Native action log/photo/AI submission — EVAL-0019.
- Read-only screen construction — EVAL-0017 should already be complete.
- Account encryption mutations (`updateGroupAccount`, `revealAccountNumber`) unless needed for create flow minimum.
- Service-role delete/end/leave challenge migration decisions from 00 §13.4 D-5.
- P1/P2 settlement or auto-verification mutations.

## Acceptance Criteria

| 기준                   | 검증 방법                                                                   |
| ---------------------- | --------------------------------------------------------------------------- |
| create challenge       | RN creates a pending challenge through approved RPC/API and PWA displays it |
| invite accept          | RN accepts invite idempotently and membership appears in PWA/RN reads       |
| pledge sign            | RN signs pledge and preserves pending/active rules                          |
| signed start           | owner starts signed participants and challenge becomes active               |
| RLS unauthorized paths | non-owner/non-member attempts fail without service-role exposure            |
| PWA compatibility      | same DB state is readable in existing PWA views after RN writes             |
| harness traceability   | `pnpm harness:check` passes                                                 |

## Verification Commands

```bash
pnpm harness:context EVAL-0018
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm --filter @withkey/mobile test -- challenge-lifecycle
pnpm harness:check
pnpm validate:docs
# manual/dev-build + PWA smoke: create -> invite accept -> pledge -> start -> web reads same state
```

## Expected Output Summary

완료 보고는 RN mutation별 사용한 RPC/API 계약, PWA 호환 smoke 결과, RLS negative 검증, side-effect 처리 경계, 남은 service-role mutation debt를 한국어로 요약한다.

## Harness Impact Questions

1. Did this task introduce a new folder structure? Maybe — challenge/invite/pledge feature mutation folders.
2. Did this task introduce a new naming convention? Maybe — mutation hook names.
3. Did this task introduce a new dependency? No unless accepted by existing architecture/spec.
4. Did this task change verification commands? Maybe — lifecycle integration tests or Maestro smoke.
5. Did this task reveal that the current harness instructions are outdated? Maybe — PWA/RN compatibility smoke may need standard form.
6. Should any `.agents/` document be updated? Only if compatibility smoke becomes harness policy.

## Stop Condition

- RN create/invite/pledge/start succeeds and PWA shows the same state.
- Unauthorized paths fail under RLS/BFF checks.
- pass@3 안에 green 못 만들면 create / invite accept / pledge-start로 split.
