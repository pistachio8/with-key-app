---
Task: EVAL-0010
Track: port
Kind: migration
Status: done
Parent: docs/adr/0033-rn-target-architecture.md, docs/migration/04-rn-architecture.md, docs/migration/00-rn-conversion-plan.md
---

# EVAL-0010: RN 토대 — 모노레포 restructure (`src` → `apps/web` + `packages/domain` shell + workspace)

> [00 §8 goal 3·4·5](../../docs/migration/00-rn-conversion-plan.md)의 **선행 토대**. G3(Supabase RN auth PoC)·G4(invite deep link)·G5(Expo Router skeleton) 공통 prerequisite다. ADR-0033이 target 토폴로지를 *결정(박제)*했으나 *실행*은 안 됐고(00 §13.4 D-1 미해소), `apps/mobile`이 없어 그 위 auth/route work-unit을 harness-valid eval로 materialize할 수 없다 — 이 task가 그 자리를 만든다.
>
> ⚠️ **착수 전 PO 승인.** 이 restructure는 인증 백본(`src/lib/supabase/**`) import 일괄 이동 + Vercel root dir·CI 경로 재설정을 동반한다([AGENTS.md §4](../../AGENTS.md): `src/lib/supabase/**` 변경 → ADR — ADR-0033으로 충족). 1 PR(`feat/rn-monorepo-foundation`)로 격리해 실행.

## Parent Links

- Parent Decision (ADR): [ADR-0033 RN Target Architecture](../../docs/adr/0033-rn-target-architecture.md) — 결정 1(`apps/mobile`)·결정 2(`packages/domain`) 실행
- Parent Architecture: [04 §1 Repo 토폴로지 (A1·A2·A3)](../../docs/migration/04-rn-architecture.md)
- Parent Conversion Plan: [00 §6.2 · §13.4 D-1 (모노레포 restructure)](../../docs/migration/00-rn-conversion-plan.md)
- Parent Plan: [00 §8 goal 3·4·5 선행 토대 (depends-on)](../../docs/migration/00-rn-conversion-plan.md)
- Parent Work Package: `feat/rn-monorepo-foundation` (신규)

## Goal

현 루트 단일 Next.js 패키지(`src/` at root)를 ADR-0033 결정 1·2대로 `apps/web`(현 PWA + BFF 겸임) + `packages/domain`(공유 순수 도메인 shell) + workspace로 전면 재구성한다. 이 task가 끝나면 `pnpm-workspace.yaml`에 `apps/*`·`packages/*`가 등록되고, 현 `src/` 전체가 `apps/web/src/`로 이동했으며(`@/* → ./src/*` 동작 유지), `@withkey/domain` 패키지가 `dist` 없이 `./src/index.ts`를 export하는 빈 shell로 존재하고, `pnpm -r typecheck/lint/test`가 이동 후에도 동일 통과(드리프트 0)한다. `apps/mobile`(Expo 부트, EVAL-0011)과 도메인 모듈 실이동(G6/validators…)은 이 task 범위 밖이며, 본 task가 그 자리(workspace + 패키지 경계)만 깔아 후속을 unblock한다.

## Source Files to Inspect

- `docs/adr/0033-rn-target-architecture.md` — 결정 1·2, Consequences(부정적/비용)
- `docs/migration/04-rn-architecture.md` — §1 트리·A2(TS source 직접)·A3(pnpm -r)·§9 부트스트랩 순서
- `docs/migration/00-rn-conversion-plan.md` — §6.2·§13.4 D-1
- `pnpm-workspace.yaml`
- `tsconfig.json`
- `apps/web/next.config.ts`
- `apps/web/vercel.json`
- `apps/web/src/lib/supabase`

## Target Files

- `pnpm-workspace.yaml` — `packages: ['apps/*','packages/*']` 추가
- `package.json` — root는 workspace 오케스트레이터(`pnpm -r typecheck/lint/test`), 앱 의존은 `apps/web/package.json`로 이전
- `tsconfig.json` — base/경로 재배치 (앱별 `tsconfig`가 `@/*`를 app-local로)
- `apps/web/next.config.ts` — `transpilePackages: ['@withkey/domain']` 추가(이동 후 위치)
- `apps/web/vercel.json` — Vercel root directory → `apps/web` (대시보드 설정은 수동)
- `apps/web/src` — 루트 `src/` 전체를 이동 (`@/* → ./src/*` 유지). 신규 `packages/domain/` shell(`src/index.ts` export, dist 없음) 생성

## Requirements

- `pnpm-workspace.yaml`에 `packages: ['apps/*','packages/*']` 추가. 기존 `onlyBuiltDependencies`·`ignoredBuiltDependencies` 보존.
- 현 루트 Next.js 앱(`src/`·`public/`·config)을 `apps/web/`로 이동(`supabase/`·`evals/`·`docs/`는 루트 SoT 유지, 04 §1 트리). `@/* → ./src/*` alias가 `apps/web` 기준으로 동작.
- `packages/domain` 생성: `package.json`(name `@withkey/domain`, `exports: { ".": "./src/index.ts" }`, `dist` 없음) + `src/index.ts`(빈 re-export shell). **도메인 모듈 실이동은 하지 않는다**(G6/EVAL 후속) — 경계·소비 배선만.
- `apps/web`은 `transpilePackages: ['@withkey/domain']`, Metro 설정은 EVAL-0011(Expo)에서. 도메인은 `@withkey/domain` workspace 참조만(상대경로 import 금지, A2).
- root 스크립트를 `pnpm -r <task>`로 전환(A3). 기존 `harness:*`·`validate:docs`·`db:*` 스크립트는 root에 유지.
- Vercel root directory를 `apps/web`로, CI(GitHub Actions) 경로를 모노레포 레이아웃에 맞게 재설정.
- 이동 후 `packages/domain` 및 `apps/web`의 기존 unit test가 **동일 통과**(드리프트 0, [harness §4 Extract 게이트](../../docs/migration/02-rn-migration-harness.md)).

## Non-goals

- `apps/mobile` Expo 앱 부트스트랩 — EVAL-0011(A4/A12).
- 도메인 모듈(validators·keywords·challenge·bank·share) 실이동 — G6 후속(`packages/domain`은 본 task에선 빈 shell).
- RN auth/route/feature 코드 — G3·G5 후속(이 task가 unblock).
- Supabase migration·RLS·RPC 변경. 키워드 풀·`KEYWORD_POOL_VERSION` 변경.
- `src/lib/supabase/**`의 **로직** 변경 — 경로 이동만(인증 동작 불변).

## Acceptance Criteria

| 기준                      | 검증 방법                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| workspace 등록            | `pnpm-workspace.yaml`에 `apps/*`·`packages/*` 존재. `pnpm -r exec pwd`가 `apps/web`·`packages/domain` 나열 |
| src → apps/web 이동       | 루트에 `src/` 부재, `apps/web/src/` 존재. `@/*` import가 `apps/web`에서 resolve                            |
| `@withkey/domain` shell   | `packages/domain/package.json`(name·exports) + `src/index.ts` 존재, `dist` 없음                            |
| 드리프트 0 (이동 후 동일) | 이동 전후 `pnpm -r test` 동일 통과 — 기존 web 테스트 회귀 0 (`harness §4 Extract`)                         |
| typecheck/lint green      | `pnpm -r typecheck && pnpm -r lint` exit 0 (web·domain)                                                    |
| 인증 백본 경로만 이동     | `git mv` 기반 — `src/lib/supabase/**` 내용 diff가 import 경로 외 0 (동작 불변)                             |
| harness traceability      | `pnpm harness:check`가 frontmatter·Parent·Source·Target 인용을 검증·통과                                   |

## Verification Commands

```bash
pnpm harness:context EVAL-0010
pnpm -r typecheck
pnpm -r lint
pnpm -r test            # 이동 후 동일 통과 (드리프트 0)
pnpm harness:check
pnpm validate:docs
# 설정 변경 게이트: apps/web 프로덕션 빌드
pnpm --filter @withkey/web build
```

## Expected Output Summary

restructure가 끝나면 `apps/web`·`packages/domain`·workspace 변경 위치, `src/lib/supabase/**` 경로 이동이 동작 불변임을 보인 diff, 이동 후 `pnpm -r test` 드리프트 0 결과, Vercel root dir·CI 경로 재설정 지점, 그리고 이 토대가 unblock하는 후속(EVAL-0011 Expo, G3 auth, G5 route)을 한국어로 요약한다.

## Harness Impact Questions

> 본 task는 *정의*다. 아래는 **구현 시** 예상되는 영향 — 하나라도 yes면 구현 PR에서 `evals/drift-reports/`에 노트 + `pnpm harness:drift` 트리거.

1. New folder structure? **Yes** — `apps/*`·`packages/*` 모노레포. drift 노트 필수(레이아웃 SoT 이동).
2. New naming convention? **Yes** — `@withkey/<pkg>` workspace 패키지명, `apps/web` 기준 `@/*`.
3. New dependency? No (Expo·RN deps는 EVAL-0011). workspace protocol(`workspace:*`)만 추가.
4. Verification commands changed? **Yes** — `pnpm <task>` → `pnpm -r <task>`(A3). 하네스 스크립트 호출 경로 점검 필요.
5. Harness instructions outdated? Maybe — `.agents/`·CLAUDE.md의 `src/...` 경로 가정이 `apps/web/src/...`로 바뀜. 구현 PR에서 점검.
6. Should any `.agents/` document be updated? **Yes(예상)** — 경로 가정이 담긴 harness 문서·context 인덱스. 구현 시 doc-updater 동반.

## Stop Condition

- 모든 Acceptance Criteria가 checkable + `pnpm -r typecheck/lint/test` green(이동 후 드리프트 0) + `pnpm harness:check` 통과.
- `pnpm harness:context EVAL-0010`이 Parent·Source·Target·Verify를 출력.
- pass@3 안에 green 못 만들면 → restructure를 (workspace 설정 / `src→apps/web` 이동 / `packages/domain` shell / Vercel·CI 재설정) 단위로 split-work-packages 분할.
