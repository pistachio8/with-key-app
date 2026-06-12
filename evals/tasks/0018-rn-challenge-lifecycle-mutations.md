---
Task: EVAL-0018
Track: port
Kind: migration
Status: todo
Parent: docs/PRD.md, docs/migration/00-rn-conversion-plan.md, docs/migration/03-rn-migration-rules.md, docs/migration/04-rn-architecture.md
---

# EVAL-0018: G9 Challenge lifecycle mutations — create/invite/pledge/start parity

> 00 §8 G9. 핵심 챌린지 lifecycle write 포팅, PWA/RN DB 호환성 증명. **blocked 해제(2026-06-12)**: 선행 EVAL-0017(G8 read-only screens) done — `pnpm harness:next` unblock 후보 보고 검토 후 todo flip(선행 WP 가 develop 에 머지되어 base 는 develop fallback, 파이프라인 2호 dogfood).

## Parent Links

- PRD Feature: challenge create/invite/pledge/start — [docs/PRD.md](../../docs/PRD.md) §3, §3.1~§3.4.
- Test Scenario: D10 lifecycle; PRD §3 AC가 소스.
- Engineering Story: [00 §9](../../docs/migration/00-rn-conversion-plan.md) + [04 §5 A8](../../docs/migration/04-rn-architecture.md).
- Work Package: `feat/rn-challenge-lifecycle` (G9).

## Goal

RN lifecycle mutation 핵심 경로가 동작하고 PWA가 같은 DB 상태를 표시한다. create/invite accept/pledge sign/signed start가 가능하고, write는 00 §13.2 RPC/BFF/RN-direct를 따른다. 공유 Supabase/RPC 상태 전이가 깨지지 않는다.

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

- `apps` — mobile create/invite/pledge/start mutation·UI.
- `supabase/migrations` — 계약 부족 시만 RPC 추가; 재정렬 금지.
- `apps/web/src/app` — PWA smoke 참조; web 동작 보존.
- `packages/domain` — validators·challenge rules 소비.

## Requirements

- `createChallenge`: `create_challenge` RPC 코어(00 §13.2); invite/push는 승인된 API/RPC 뒤.
- `acceptInvite`: `accept_invite` RPC; idempotent already-joined 보존.
- `signPledge`: `sign_and_maybe_activate` RPC; pending/active freeze 보존.
- `startChallengeWithSignedParticipants`: RPC 계약; owner-only.
- 입력 검증: `@withkey/domain` validators.
- RN write 후 PWA home/challenge/pledge 동일 DB 표시.
- unauthorized RLS 테스트(가능 범위).
- push/analytics는 server/BFF; service-role 키 mobile 금지.

## Non-goals

- Action log/photo/AI 제출(EVAL-0019).
- `updateGroupAccount`·`revealAccountNumber`(create flow 최소 필요 시 예외만).
- 00 §13.4 D-5 delete/end/leave.
- P1/P2 settlement·auto-verification mutation.

## Acceptance Criteria

| 기준                 | 검증 방법                           |
| -------------------- | ----------------------------------- |
| create challenge     | RPC/API로 pending 생성, PWA 표시    |
| invite accept        | idempotent 수락, membership 반영    |
| pledge sign          | 서약 서명, pending/active 규칙 보존 |
| signed start         | owner start → active 전환           |
| RLS unauth paths     | 미인가 시도 service-role 없이 실패  |
| PWA compatibility    | RN write 후 PWA 동일 DB 읽힘        |
| harness traceability | `pnpm harness:check` passes         |

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

mutation별 RPC/API 계약, PWA 호환 smoke, RLS negative, side-effect 경계, service-role debt를 한국어로 요약.

## Harness Impact Questions

1. New folder structure? Maybe — challenge/invite/pledge mutation folders.
2. New naming convention? Maybe — mutation hook names.
3. New dependency? No unless accepted by spec.
4. Verification commands changed? Maybe — lifecycle tests or Maestro smoke.
5. Harness outdated? Maybe — PWA/RN smoke may need standard form.
6. `.agents/` update? Only if smoke becomes harness policy.

## Stop Condition

- RN create/invite/pledge/start 성공; PWA 동일 상태 표시.
- Unauthorized 경로가 RLS/BFF에서 실패.
- pass@3 green 불가 → create/invite accept/pledge-start split.
