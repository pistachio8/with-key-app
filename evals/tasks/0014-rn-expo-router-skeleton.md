---
Task: EVAL-0014
Track: port
Kind: migration
Status: done
Blocked-by: EVAL-0012(G3 auth PoC) complete — PR #199 머지(2026-06-11)로 해제.
Parent: docs/PRD.md, docs/migration/00-rn-conversion-plan.md, docs/migration/04-rn-architecture.md, docs/adr/0033-rn-target-architecture.md
---

# EVAL-0014: G5 Expo Router skeleton — auth gate + RN route map

> 00 §8 G5. G3(EVAL-0012) 완료 후 착수.

## Parent Links

- PRD Feature: RN route parity — [00 §8 G5 + §10](../../docs/migration/00-rn-conversion-plan.md).
- Test Scenario: `TS-rn-router-1`~`TS-rn-router-4` → AC 흡수(D10) — [05-rn-harness-decisions.md](../../docs/migration/05-rn-harness-decisions.md) §2.
- Job Story: 홈/챌린지/서약/인증/내 정보 이동 — [docs/PRD.md](../../docs/PRD.md) §10.
- Engineering Story: [04 §3 A5](../../docs/migration/04-rn-architecture.md) + [00 §10](../../docs/migration/00-rn-conversion-plan.md).
- Work Package: `feat/rn-router-skeleton` (G5).

## Goal

Expo Router 기반 RN route skeleton과 auth gate 구현. 완료 시: 00 §10 routes(`/login`, `/invite/[token]`, `/home`, `/challenge/[id]/{action,pledge,recap}`, `/me`) 존재, 미인증→auth group, 인증→app group. route params·navigation 구조는 후속 task가 붙을 수 있어야 한다.

## Source Files to Inspect

- `docs/PRD.md`
- `docs/migration/00-rn-conversion-plan.md`
- `docs/migration/03-rn-migration-rules.md`
- `docs/migration/04-rn-architecture.md`
- `apps/web/src/app`
- `apps/web/src/components/app-shell`
- `apps/web/src/components/pwa`

## Target Files

- `apps` — `apps/mobile/app/...` Expo Router skeleton 및 route layouts 구현.
- `apps/web/src/app` — route 인벤토리 참조만. PWA routes 보존.
- `package.json` — route tests 추가 시 workspace scripts 유지.

## Requirements

- auth gate: 미인증→보호 route 차단, 인증→login 우회.
- 00 §10 routes: `/login`, `/invite/[token]`, `/home`, `/challenge/[id]/{action,pledge,recap}`, `/me`.
- 04 §3 IA: auth/app/tabs/challenge group, modal/flow skeleton.
- params(`challengeId`, `token`) route 경계에서 typed/validated.
- 00 §1.2 legacy alias: redirect/compat 또는 non-goal. 중복 primary route 금지.
- data fetching: placeholder guard만. Read 계약은 EVAL-0016/EVAL-0017.
- `navigation/` 신설 금지. `app/`이 SoT(04 §5.1).

## Non-goals

- 실데이터 렌더링 — EVAL-0017.
- mutation(challenge/pledge/invite) — EVAL-0018.
- action log photo/AI — EVAL-0019.
- domain extraction — EVAL-0015.
- PWA route 변경 또는 legacy redirect 삭제.

## Acceptance Criteria

| 기준                       | 검증 방법                                         |
| -------------------------- | ------------------------------------------------- |
| required route files exist | 00 §8/§10 G5 paths가 route tree에 존재            |
| auth gate works            | 미인증→login; 인증→app route 도달                 |
| route params stable        | invite token·challenge id가 typed params          |
| IA follows 04 §3           | root/auth/app/challenge, `navigation/` 중복 없음  |
| legacy handling explicit   | 00 §1.2 alias: redirect/compat 또는 non-goal 명시 |
| mobile tests green         | route/gate tests pass                             |
| harness traceability       | `pnpm harness:check` passes                       |

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

route groups·auth gate·00 §10 커버리지·legacy alias·G8–G10 placeholder 경계를 한국어로 요약.

## Harness Impact Questions

1. New folder structure? Yes — `apps/mobile/app` route tree.
2. New naming convention? Yes — mobile route param·group naming.
3. New dependency? No beyond EVAL-0011.
4. Verification commands changed? Maybe — route tests join mobile scope.
5. Harness outdated? Maybe — route map coverage 결정론적 체크 필요 시.
6. `.agents/` update? Only if route coverage becomes a harness check.

## Stop Condition

- G5 route paths 존재 및 auth gate tests pass.
- `pnpm harness:check` 및 `pnpm validate:docs` pass.
- pass@3 실패 시 auth gate / route tree / legacy alias로 split.
