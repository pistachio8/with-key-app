---
Task: EVAL-0011
Track: port
Kind: migration
Status: done
Blocked-by: [task:EVAL-0010] — RN monorepo foundation complete 선행.
Parent: docs/adr/0033-rn-target-architecture.md, docs/migration/00-rn-conversion-plan.md, docs/migration/04-rn-architecture.md, docs/migration/05-rn-harness-decisions.md
---

# EVAL-0011: Expo boot — Managed+CNG dev build + APP_VARIANT/EAS profile

> 00 §8 G3~G5 표면 `apps/mobile` 생성. EVAL-0010 완료 후 착수.

## Parent Links

- PRD: [01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §8.
- Test Scenario: `TS-expo-boot-*` → AC 흡수(D10) — [05-rn-harness-decisions.md](../../docs/migration/05-rn-harness-decisions.md) §2.
- Job Story: dev build 실기기 native module — [04-rn-architecture.md](../../docs/migration/04-rn-architecture.md) §2.
- Engineering Story: [04 §2 A4·A12](../../docs/migration/04-rn-architecture.md) + [ADR-0033](../../docs/adr/0033-rn-target-architecture.md).
- Work Package: `feat/rn-expo-boot`.

## Goal

`apps/mobile`에 Expo Managed+CNG shell, dev build 최소 구성 고정. `ios/`·`android/` 미커밋, New Architecture 활성화, `APP_VARIANT` variant 분기, EAS profile 매핑. auth/route는 후속 task.

## Source Files to Inspect

- `docs/adr/0033-rn-target-architecture.md`
- `docs/migration/00-rn-conversion-plan.md`
- `docs/migration/03-rn-migration-rules.md`
- `docs/migration/04-rn-architecture.md`
- `docs/migration/05-rn-harness-decisions.md`
- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`

## Target Files

- `apps` — `apps/mobile/...` shell 생성.
- `package.json` — `pnpm -r` scripts 유지.
- `pnpm-workspace.yaml` — mobile은 `apps/*`.
- `.github/workflows` — 기존 CI 있는 경우만 mobile lane 추가.

## Requirements

- `apps/mobile` Managed+CNG 생성. `ios/`·`android/` 커밋 금지.
- New Architecture 활성화(04 A4).
- `app.config.ts`: `APP_VARIANT`=dev|staging|prod 분기(bundle id·name·scheme). prod 하드코딩 금지.
- EAS profile → variant 매핑.
- mobile env `EXPO_PUBLIC_*`만. 서버 시크릿은 web/Vercel 전용.
- `pnpm -r typecheck|lint|test` mobile 포함.
- boot 최소 placeholder만. skeleton은 EVAL-0014.

## Non-goals

- Kakao OAuth, magic link, SecureStore, logout — EVAL-0012.
- Invite deep link — EVAL-0013.
- Full route inventory — EVAL-0014.
- `packages/domain` 이동 — EVAL-0015.
- Native photo, push 등록, store 배포.

## Acceptance Criteria

| 기준                   | 검증 방법                                                |
| ---------------------- | -------------------------------------------------------- |
| Expo app shell exists  | `apps/mobile` listed by `pnpm -r exec pwd`               |
| CNG boundary preserved | `ios/` and `android/` absent from git                    |
| A4 dev build config    | Managed+CNG, New Architecture, dev build plugins         |
| A12 variant config     | `APP_VARIANT=dev\|staging\|prod` → bundle id/name/scheme |
| EAS profile parity     | EAS profiles map to variants, no duplicate secrets       |
| workspace verification | `pnpm -r typecheck/lint/test` pass or mobile no-op       |
| harness traceability   | `pnpm harness:check` passes                              |

## Verification Commands

```bash
pnpm harness:context EVAL-0011
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm --filter @withkey/mobile expo config --type public
pnpm harness:check
pnpm validate:docs
```

## Expected Output Summary

한국어 요약: `apps/mobile` 위치, CNG 경계, `APP_VARIANT`/EAS 매핑, workspace 검증 결과, G3/G5 unblock.

## Harness Impact Questions

1. New folder structure? Yes — `apps/mobile`; harness web-only 가정 PR drift note.
2. New naming convention? Yes — mobile package, `APP_VARIANT` profile.
3. New dependency? Yes — Expo/RN/EAS.
4. Verification commands changed? Yes — `pnpm -r` 합류.
5. Harness outdated? Maybe — web-only path 발견 시 보고.
6. `.agents/` update? Only if stale paths found.

## Stop Condition

- AC 전부 green + verification commands pass.
- `pnpm harness:context EVAL-0011` prints Parent/Source/Target/Verify.
- pass@3 실패 시 app shell / variant config / CI lane으로 split.
