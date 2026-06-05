---
Task: EVAL-0011
Track: port
Kind: migration
Status: blocked
Blocked-by: EVAL-0010(RN monorepo foundation) complete.
Parent: docs/adr/0033-rn-target-architecture.md, docs/migration/00-rn-conversion-plan.md, docs/migration/04-rn-architecture.md, docs/migration/05-rn-harness-decisions.md
---

# EVAL-0011: Expo boot — Managed+CNG dev build + APP_VARIANT/EAS profile

> 00 §8의 G3~G5가 올라갈 `apps/mobile` 실행 표면을 만든다. EVAL-0010이 `apps/web`+`packages/domain` workspace 토대를 깐 뒤에만 착수한다.

## Parent Links

- Parent PRD Feature: RN MVP M1 "포팅 기반" — [docs/migration/01-rn-mvp-prd.md](../../docs/migration/01-rn-mvp-prd.md) §8.
- Parent Test Scenario: `TS-expo-boot-*`는 본 파일 Acceptance Criteria에 흡수(D10) — [docs/migration/05-rn-harness-decisions.md](../../docs/migration/05-rn-harness-decisions.md) §2.
- Parent Job Story: "RN dev build가 실기기에서 auth/photo/push native module을 실을 수 있어야 한다" — [docs/migration/04-rn-architecture.md](../../docs/migration/04-rn-architecture.md) §2.
- Parent Engineering Story: [04 §2 Expo Foundation A4·A12](../../docs/migration/04-rn-architecture.md) + [ADR-0033](../../docs/adr/0033-rn-target-architecture.md) 결정 1.
- Parent Work Package: `feat/rn-expo-boot` (EVAL-0011).

## Goal

`apps/mobile`에 Expo Managed+CNG 기반 RN 앱 shell을 만들고 dev build가 가능한 최소 구성을 고정한다. 이 task가 끝나면 `ios/`·`android/`는 커밋하지 않는 CNG 원칙을 지키면서 New Architecture가 켜져 있고, `APP_VARIANT=dev|staging|prod`가 bundle id·앱 이름·scheme·연결 도메인을 분기하며, EAS `development`·`preview`·`production` profile이 같은 variant 모델을 따른다. 앱 코드는 아직 auth/route 기능을 완성하지 않고, 후속 G3/G5가 붙을 실행 가능한 Expo 표면만 만든다.

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

- `apps` — create `apps/mobile/...` Expo app shell.
- `package.json` — root orchestration keeps `pnpm -r` scripts working.
- `pnpm-workspace.yaml` — mobile workspace package remains under `apps/*`.
- `.github/workflows` — add/adjust mobile lane only if CI already owns that check.

## Requirements

- Create an Expo app at `apps/mobile` using Managed workflow + CNG. Do not commit generated `ios/` or `android/`.
- Enable New Architecture in Expo config, matching 04 A4.
- Add `app.config.ts` with `APP_VARIANT` handling for dev/staging/prod bundle id, display name, scheme, and app/universal link domains. Do not hard-code prod values into every variant.
- Add EAS profiles mapping `development`/`preview`/`production` to the same variant model.
- Keep env exposure limited to `EXPO_PUBLIC_*` for mobile. Server secrets remain in `apps/web`/Vercel only.
- Wire TypeScript, lint, and test scripts so `pnpm -r typecheck`, `pnpm -r lint`, and `pnpm -r test` include mobile without breaking web/domain.
- Add only the minimum placeholder screen needed for Expo boot validation; full route skeleton is EVAL-0014.

## Non-goals

- Kakao OAuth, magic link, SecureStore session restore, or logout — EVAL-0012.
- Invite deep link orchestration — EVAL-0013.
- Full Expo Router route inventory — EVAL-0014.
- Moving domain modules into `packages/domain` — EVAL-0015.
- Native photo upload, push registration, or production store release.

## Acceptance Criteria

| 기준                   | 검증 방법                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ------- | ----------------------------------------------------- |
| Expo app shell exists  | `apps/mobile` package exists and is listed by `pnpm -r exec pwd`                                 |
| CNG boundary preserved | generated `ios/` and `android/` directories are absent from git                                  |
| A4 dev build config    | Expo config has Managed+CNG, New Architecture, and dev build-ready plugins only as required      |
| A12 variant config     | `APP_VARIANT=dev                                                                                 | staging | prod` changes bundle id/name/scheme deterministically |
| EAS profile parity     | EAS profiles map to variant values without duplicating secrets                                   |
| workspace verification | `pnpm -r typecheck`, `pnpm -r lint`, and `pnpm -r test` pass or have explicit mobile no-op tests |
| harness traceability   | `pnpm harness:check` passes with EVAL-0011 present                                               |

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

완료 보고는 `apps/mobile` 부트스트랩 위치, CNG 경계(`ios/`·`android/` 미커밋), `APP_VARIANT`/EAS profile 매핑, workspace 검증 결과, 그리고 G3/G5를 unblock한 지점을 한국어로 요약한다.

## Harness Impact Questions

1. Did this task introduce a new folder structure? Yes — `apps/mobile`; implementation PR must add drift note if harness docs assume only web/domain.
2. Did this task introduce a new naming convention? Yes — mobile package name and `APP_VARIANT` profile naming.
3. Did this task introduce a new dependency? Yes — Expo/RN/EAS dependencies inside `apps/mobile`.
4. Did this task change verification commands? Yes — mobile joins `pnpm -r` checks.
5. Did this task reveal that the current harness instructions are outdated? Maybe — any hard-coded web-only script path must be reported.
6. Should any `.agents/` document be updated? Only if implementation finds stale path assumptions; otherwise no.

## Stop Condition

- All Acceptance Criteria green + verification commands pass.
- `pnpm harness:context EVAL-0011` prints Parent, Source, Target, and Verify sections.
- pass@3 안에 green 못 만들면 app shell / variant config / CI lane으로 split.
