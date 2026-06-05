---
Task: EVAL-0014
Track: port
Kind: migration
Status: blocked
Blocked-by: EVAL-0012(G3 auth PoC) complete.
Parent: docs/PRD.md, docs/migration/00-rn-conversion-plan.md, docs/migration/04-rn-architecture.md, docs/adr/0033-rn-target-architecture.md
---

# EVAL-0014: G5 Expo Router skeleton — auth gate + RN route map

> 00 §8 G5. Auth state가 먼저 있어야 protected route gate가 의미 있으므로 G3 이후에 착수한다.

## Parent Links

- Parent PRD Feature: RN route parity for POC core screens — [00 §8 G5](../../docs/migration/00-rn-conversion-plan.md) and [00 §10 route map](../../docs/migration/00-rn-conversion-plan.md).
- Parent Test Scenario: `TS-rn-router-1`~`TS-rn-router-4`는 본 파일 Acceptance Criteria에 흡수(D10) — [docs/migration/05-rn-harness-decisions.md](../../docs/migration/05-rn-harness-decisions.md) §2.
- Parent Job Story: 사용자가 로그인 후 홈/챌린지/서약/인증/내 정보로 끊김 없이 이동한다 — [docs/PRD.md](../../docs/PRD.md) §10 화면 인벤토리.
- Parent Engineering Story: [04 §3 Navigation A5](../../docs/migration/04-rn-architecture.md) + [00 §10 target route map](../../docs/migration/00-rn-conversion-plan.md).
- Parent Work Package: `feat/rn-router-skeleton` (G5).

## Goal

Expo Router 기반의 RN route skeleton과 auth gate를 만든다. 이 task가 끝나면 `/login`, `/invite/[token]`, `/home`, `/challenge/[id]`, `/challenge/[id]/action`, `/challenge/[id]/pledge`, `/challenge/[id]/recap`, `/me`에 대응하는 RN route가 존재하고, 세션이 없으면 auth group으로, 세션이 있으면 app group으로 이동한다. 화면은 아직 실데이터 기능을 완성하지 않아도 되지만, route params와 protected navigation 구조는 후속 read/mutation/action-log task가 붙을 수 있어야 한다.

## Source Files to Inspect

- `docs/PRD.md`
- `docs/migration/00-rn-conversion-plan.md`
- `docs/migration/03-rn-migration-rules.md`
- `docs/migration/04-rn-architecture.md`
- `apps/web/src/app`
- `apps/web/src/components/app-shell`
- `apps/web/src/components/pwa`

## Target Files

- `apps` — implement `apps/mobile/app/...` Expo Router skeleton and route layouts.
- `apps/web/src/app` — source route inventory only; preserve PWA routes.
- `package.json` — ensure route tests remain in workspace scripts if added.

## Requirements

- Implement Root Stack with auth-aware gate: unauthenticated users cannot access protected routes; authenticated users do not stay on login route.
- Add RN route files corresponding to 00 §10 for at least `/login`, `/invite/[token]`, `/home`, `/challenge/[id]`, `/challenge/[id]/action`, `/challenge/[id]/pledge`, `/challenge/[id]/recap`, and `/me`.
- Preserve mobile IA from 04 §3: auth group, app/tabs group, challenge stack, and modal/flow routes as skeleton only.
- Route params (`challengeId`, `token`) must be typed/validated at the route boundary before feature code consumes them.
- Legacy aliases from 00 §1.2 are handled as compatibility redirects or explicit non-goals; do not create confusing duplicate primary routes.
- Do not add data fetching beyond placeholder guards. Read contracts are EVAL-0016/EVAL-0017.
- Do not reintroduce a separate `navigation/` directory; Expo Router `app/` is the navigation SoT per 04 §5.1.

## Non-goals

- Real home/challenge data rendering — EVAL-0017.
- Mutations such as create challenge, pledge sign, invite accept, start — EVAL-0018.
- Native action log photo/AI flow — EVAL-0019.
- Domain extraction — EVAL-0015.
- Changing PWA route behavior or deleting web legacy redirects.

## Acceptance Criteria

| 기준                       | 검증 방법                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------- |
| required route files exist | route tree includes the G5 paths from 00 §8/§10                                       |
| auth gate works            | unauth protected route redirects/replaces to login; auth user reaches app route       |
| route params stable        | invite token and challenge id are passed as typed params to placeholder screens       |
| IA follows 04 §3           | root/auth/app/challenge grouping matches architecture without `navigation/` duplicate |
| legacy handling explicit   | 00 §1.2 aliases are documented as redirect/compat or non-goal                         |
| mobile tests green         | route/gate tests pass in mobile test runner                                           |
| harness traceability       | `pnpm harness:check` passes                                                           |

## Verification Commands

```bash
pnpm harness:context EVAL-0014
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm --filter @withkey/mobile test -- router
pnpm harness:check
pnpm validate:docs
```

## Expected Output Summary

완료 보고는 생성된 route groups, auth gate 동작, 00 §10 route map 커버리지, legacy alias 처리, 후속 G8/G9/G10이 붙을 placeholder 경계를 한국어로 요약한다.

## Harness Impact Questions

1. Did this task introduce a new folder structure? Yes — Expo Router route tree under `apps/mobile/app`.
2. Did this task introduce a new naming convention? Yes — mobile route param names and route group naming.
3. Did this task introduce a new dependency? No beyond EVAL-0011 Expo Router baseline.
4. Did this task change verification commands? Maybe — route tests may join mobile test scope.
5. Did this task reveal that the current harness instructions are outdated? Maybe — if route map coverage should become deterministic.
6. Should any `.agents/` document be updated? Only if route coverage becomes a reusable harness check.

## Stop Condition

- All G5 route paths exist and auth gate tests pass.
- `pnpm harness:check` and `pnpm validate:docs` pass.
- pass@3 안에 green 못 만들면 auth gate / route tree / legacy alias handling으로 split.
