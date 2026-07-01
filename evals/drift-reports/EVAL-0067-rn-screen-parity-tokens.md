# Drift Report — EVAL-0067 RN 화면 공통 디자인 토큰 확장 (정산 SL0 → 전 화면)

- Task: **EVAL-0067** (Track: greenfield · Kind: migration)
- Branch: `feat/rn-screen-parity-tokens` (PR base `develop` — P0 화면 re-skin EVAL-0068~0072 의 선행 조건)
- Date: 2026-07-01
- Trigger: `apps/mobile/src/shared/theme/colors.ts` 를 web `globals.css` 대비 감사해 누락 semantic 토큰(input·ring·popover·popoverForeground·streak-1~7) 추가 + `spacing.ts` 신규(8px 그리드 scale). EVAL-0058 산출물의 비파괴 확장. Parent: spec `2026-07-01-rn-screen-parity-acceptance.md` §C · ADR-0044.

## Harness Impact Questions — 답변

1. **New folder structure? NO** — `shared/theme/` 확장(신규 디렉토리 없음). barrel(`index.ts`) 에 `spacing` export 1줄 추가.
2. **New naming convention? NO(경미)** — `spacing.ts` 는 기존 per-category 파일 컨벤션(`colors.ts`·`typography.ts`·`radius.ts`·`motion.ts` = 토큰 카테고리 1종당 파일 1개)의 **신규 인스턴스**일 뿐 새 규약 아님. repo-wide 영향·`.agents/` 갱신 불요. `harness:drift` clean(No Tier 1 drift). 후속 EVAL-0068~ 화면 re-skin 이 `@/shared/theme` barrel 로 `spacing` 소비 — 발견성 위해 기록.
3. **New dependency? NO** — culori 재사용(EVAL-0058 devDependency, parity 테스트 전용). 런타임 번들 미포함.
4. **Verification commands changed? NO** — `pnpm --filter @withkey/mobile test -- theme.spec` 동일. 신규 케이스만 추가(기존 4종 구조 재사용).
5. **Harness instructions outdated? NO** — 워크플로/템플릿 가정 불변.
6. **`.agents/` 문서 갱신? NO** — analytics parity·Server Action·RSC·RLS·env·시크릿 전부 무관(순수 RN 디자인 토큰). `globals.css` 미변경(참조만).

## 감사 결과 (globals.css 대비 색 토큰 갭)

- **동일-OKLCH 별칭 4종**(globals.css 가 형제 토큰과 같은 OKLCH 재사용 — culori round-trip 정확, drift 0):
  - `input` = `--input` = `--border` → `#E8EBF0`
  - `ring` = `--ring` = `--primary` → `#8AA4FF`
  - `popover` = `--popover` = `--card` (oklch(1 0 0)) → `#FFFFFF`
  - `popoverForeground` = `--popover-foreground` = `--foreground` → `#22262E`
- **streak-1~7**(hex SoT 부재 — OKLCH 가 SoT, culori 변환값 저장. muted/brandPrimaryDeep 패턴): `#DCE7FF`·`#C8D8FF`·`#B5C8FF`·`#A0B7FF`·`#8DA6FA`·`#7A93EF`·`#657EE0`. theme.spec 이 globals.css OKLCH 정의 존재(`toContain`) + culori 일치 이중 강제.
- **미포함(의도)**: `--chart-1~5`·`--sidebar-*` = web 전용 표면(차트·사이드바), P0 RN 화면 비대상. dark mode 토큰 = POC 단일 테마(Non-goal).

## spacing 근거 (8px 그리드)

- `apps/mobile/src` padding/margin/gap 리터럴 빈도 감사(2026-07-01): 12→31 · 16→25 · 8→24 · 4→16 · 24→16 · 32→6.
- 정규 scale: `xs:4`(0.5×8) · `sm:8` · `md:12`(1.5×8, 최빈) · `lg:16`(화면 기본 padding) · `xl:24` · `2xl:32`. 전부 4px 하프스텝 정렬.
- off-grid 잔여(10·6·14 등)는 화면 re-skin(EVAL-0068~)에서 이 scale 로 흡수 — 이 task 는 정규 scale 제공까지(re-skin 은 Non-goal).

## 검증 결과

- `pnpm --filter @withkey/mobile test -- theme.spec` → **40/40 PASS**(기존 26 + 신규 색 11[별칭 4 culori + 별칭관계 1 + streak 7 − 중복 정리] + spacing 2 등).
- `pnpm --filter @withkey/mobile test`(전체) → 25 suites · **234/234 PASS**(colors 확장이 기존 feed/recap/invite/read-only 테스트 비파괴).
- `pnpm --filter @withkey/mobile exec tsc --noEmit` → clean(레거시 alias·SL0 소비처 비파괴).
- `pnpm --filter @withkey/mobile lint` → exit 0.
- `pnpm harness:check` PASS · `pnpm harness:drift` clean(No Tier 1) · `pnpm validate:docs` OK.
