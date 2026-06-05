# Drift Report — EVAL-0010 모노레포 restructure

- Task: **EVAL-0010** (Track: port · Kind: migration)
- Branch: `feat/rn-monorepo-foundation`
- Date: 2026-06-05
- Trigger: 루트 단일 Next.js 패키지(`src/` at root) → `apps/web`(PWA + BFF) + `packages/domain`(공유 shell) + pnpm workspace 전면 재구성. ADR-0033 결정 1·2(A1·A2·A3) 실행, 00 §13.4 D-1 해소.

## Harness Impact Questions — 답변

1. **New folder structure? YES** — `apps/*`·`packages/*` 모노레포 레이아웃 신설. 레이아웃 SoT가 루트 `src/` → `apps/web/src/`로 이동. `supabase/`·`evals/`·`docs/`·`scripts/`(harness)는 루트 유지.
2. **New naming convention? YES** — workspace 패키지명 `@withkey/web`·`@withkey/domain`. `@/*` alias가 `apps/web` 기준으로 재루팅(소스 import 무수정).
3. **New dependency? NO(런타임)** — workspace protocol(`workspace:*`)만 추가. Expo·RN deps는 EVAL-0011. 단 `.npmrc` `public-hoist-pattern`에 `next` 추가 — eslint-config-next 의 `require("next/dist/...")` 해석용(모노레포 전환 후 next가 apps/web에만 설치되어 root eslint-config-next에서 안 보임).
4. **Verification commands changed? YES** — 루트 `pnpm <task>` → `pnpm -r <task>`(typecheck/lint/test) / `pnpm --filter @withkey/web <task>`(build·e2e·dev). `harness:*`·`validate:docs`·`db:*`·`check:spec-required`·`new`·`format`은 루트 유지. app-결합 스크립트(copy-ffmpeg·generate-pwa-icons·dev-login-link·dev-seed-action-log·test/·spike/)는 `apps/web/scripts/`로 이동.
5. **Harness instructions outdated? YES(해소)** — `src/...` 경로 가정 문서를 `apps/web/src/...`로 갱신: `AGENTS.md`·`README.md`·`docs/adr/README.md`·`docs/superpowers/specs/README.md`·`supabase/README.md`·`apps/web/{src,public}/CLAUDE.md`(상대링크 깊이 `../../../`)·`CLAUDE.md`(컨텍스트 인덱스)·eval tasks 0004·0006·0007·0008·0009(Source/Target)·`scripts/check-spec-required.mjs`(WHITELIST: `^src/lib/...` → `^apps/web/src/lib/...`, `middleware.ts` → `apps/web/proxy.ts`). 가드레일 doc의 illustrative glob(`src/lib/*`·`src/features/` 등 비-파일 참조)은 의미 보존 위해 유지.
6. **`.agents/` 문서 갱신? NO(불요)** — `.agents/`에 구체 `src/app|lib|components|types` 경로 가정 없음(grep 0건). 경로 인덱스는 `CLAUDE.md`/`AGENTS.md`에 있었고 갱신 완료.

## 이동 무결성 (드리프트 0 증명, harness §4 Extract 게이트)

- `git mv` 기반 — git이 전 이동을 rename(R)으로 인식. `apps/web/src/lib/supabase/**` 내용 diff = import 경로 외 0(동작 불변).
- 이동 후 `pnpm -r test` = **764 tests / 121 files 전부 통과**(이동 전과 동일).
- `pnpm -r typecheck` green · `pnpm -r lint` green · `pnpm --filter @withkey/web build` green(라우트 매니페스트 정상).
- `pnpm harness:check` PASS(7 tasks, 0 violations) · `pnpm validate:docs` OK · `pnpm harness:context EVAL-0010` Source/Target 전부 ok.

## 외부 수동 조치 (PR 머지 전 PO)

- **Vercel 대시보드 → Project Settings → Root Directory = `apps/web`** (미설정 시 다음 배포 빌드 실패). crons·regions는 `apps/web/vercel.json`로 이동 완료(Root Directory 설정 시 인식).
- CI(`ci.yml`)는 모노레포용으로 정합(루트 passthrough + e2e 아티팩트 경로 `apps/web/*` + playwright install `--filter @withkey/web`). 머지 후 첫 push에서 green 확인.

## 관찰된 별개 항목 (AC 밖, 후속)

- `node_modules/.bin/supabase` 바이너리 미생성 경고 — `pnpm-workspace.yaml`의 `onlyBuiltDependencies`(불변 보존)가 supabase postinstall을 차단. purge 재설치로 표면화된 기존 잠재 조건. `pnpm db:*` 로컬 사용 시 후속 확인(필요 시 supabase를 `onlyBuiltDependencies`에 추가).
- 도메인 모듈 실이동(validators·keywords·challenge·bank·share → `packages/domain`)은 G6 후속. 본 task의 `packages/domain`은 빈 shell(`export {}`), `lint`는 G6에서 eslint 배선.
