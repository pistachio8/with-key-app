# Drift Report — EVAL-0058 RN 정산 SL0 theme 토큰 4종 + parity 테스트

- Task: **EVAL-0058** (Track: greenfield · Kind: migration)
- Branch: `feat/rn-settlement-sl0-design` (PR base `develop` — deps none. EVAL-0059 UI primitive 의 전제)
- Date: 2026-06-29
- Trigger: `apps/mobile/src/shared/theme/` 신규 — web `globals.css` SoT 를 미러한 토큰 4종(colors·typography·radius·motion) + barrel + parity 테스트. colors.ts 는 기존 teal POC 팔레트를 web hex SoT 로 재작성하되 레거시 alias 9종 보존(기존 화면 비파괴). Parent: plan `2026-06-29-rn-settlement-sl0-design.md` Task 1~5.

## Harness Impact Questions — 답변

1. **New folder structure? YES** — `apps/mobile/src/shared/theme/` 하위에 `typography.ts`·`radius.ts`·`motion.ts`·`index.ts`(barrel)·`theme.spec.ts` 신규(`colors.ts` 는 기존 파일 재작성). `shared/ui/` 는 EVAL-0059 에서 생성. propagation: RN 디자인 토큰의 단일 진입점 확립 — 후속 정산 화면(C1·C2·C3)이 `@/shared/theme` barrel 로 소비. `.agents/` 머시너리 영향 없음.
2. **New naming convention? YES(경미)** — `theme.spec.ts` = web globals.css 대비 **parity 테스트** 파일명(culori 로 OKLCH→hex 변환 일치 강제). repo-wide 규약 아님(RN theme 한정 로컬). `.agents/` 갱신 불요.
3. **New dependency? YES** — `culori@4.0.2` **devDependency**(parity 테스트 전용, 런타임 번들 미포함). culori 4.x 는 `"type":"module"` 이나 `require`/`main` 조건이 CJS 번들(`bundled/culori.cjs`)을 가리켜 jest-expo babel transform 에서 ESM 이슈 없이 resolve. 타입 미동봉이라 `test-env.d.ts` 에 최소 표면(`converter`)만 ambient 선언.
4. **Verification commands changed? YES** — `pnpm --filter @withkey/mobile test -- theme.spec` 신규(AC verify). package.json script 변경은 없음(devDep 추가만).
5. **Harness instructions outdated? NO(단, plan 갭 2건 기록)** — 워크플로/템플릿 가정 불변. 다만 plan 본문에 2건의 자기모순이 있어 구현 중 교정(아래 §plan 갭 교정).
6. **`.agents/` 문서 갱신? NO** — analytics parity(PRD §9.1)·Server Action·RSC·RLS·env·시크릿 전부 무관(순수 RN 디자인 토큰). 단 §후속 권고에 RN spec 의 node/untyped-dep typecheck shim 패턴 1줄 기록 제안.

## plan 갭 교정 (구현 중 발견 — TDD 로 드러남)

- **radius 부동소수점 드리프트**: plan 의 `radius.ts` 는 `BASE * 0.8`·`BASE * 1.4`·`BASE * 2.2` 곱셈인데 JS 에서 `14*1.4 = 19.599999…`·`14*0.8 = 11.2000…1`·`14*2.2 = 30.800…4` 로 plan 의 테스트 리터럴(`19.6`·`11.2`·`30.8`)과 `toEqual` 불일치. typography.ts 가 이미 리터럴 패턴인 것에 맞춰 radius 도 파생값을 **리터럴로 고정**(파생 관계는 주석 보존). web 토큰값과 동일.
- **spec typecheck shim 누락**: plan 의 `theme.spec.ts` 는 `node:fs` `readFileSync` + `culori` `converter` 를 쓰는데, RN tsconfig 는 `@types/node` 미포함(RN 전역 충돌 회피)이고 `tsc --noEmit` 가 spec 도 검사한다. 기존 `src/test-env.d.ts`(ambient 최소 표면 shim) 컨벤션대로 `readFileSync` + `declare module "culori"` 를 추가해 typecheck 통과. **target file 밖이지만**(test-env.d.ts) plan-mandated 테스트가 요구하는 필수 부수 변경 — 기존 패턴 준수로 surgical 유지.

## 후속 권고 (이번 슬라이스 밖)

- RN spec 이 node 빌트인/타입 미동봉 dep 를 import 할 때 `src/test-env.d.ts` 에 쓰는 표면만 ambient 선언하는 패턴을 `.agents/engineering/` 코딩 규칙에 1줄 명시하면 후속 RN 테스트 task 의 동일 typecheck 함정을 예방(현재는 암묵 관행).

## 검증 결과

- `pnpm --filter @withkey/mobile test -- theme.spec` → 26/26 PASS(hex SoT 12 + OKLCH culori 3 + invite + alias + typography 6 + radius + motion 2).
- `pnpm --filter @withkey/mobile exec tsc --noEmit` → clean(기존 화면 비파괴 — 레거시 alias 보존).
- `pnpm --filter @withkey/mobile lint` → exit 0.
- `pnpm --filter @withkey/mobile test`(전체) → 20 suites · **180/180 PASS**(colors 재작성이 기존 feed/recap/invite 등 스냅샷·로직 테스트 비파괴 확인).
- `pnpm harness:check` PASS · `pnpm validate:docs` OK.
