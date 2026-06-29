# Drift Report — EVAL-0059 RN 정산 SL0 UI primitive 6종 + barrel

- Task: **EVAL-0059** (Track: greenfield · Kind: migration)
- Branch: `feat/rn-settlement-sl0-design` (PR base `develop` — Depends-on EVAL-0058 theme 토큰)
- Date: 2026-06-29
- Trigger: `apps/mobile/src/shared/ui/` 신규 — web `components/ui/*` 를 RN StyleSheet 로 미러한 primitive 6종(Button·Chip·Card·Stamp·EmptyState·ErrorState) + barrel + 렌더 스냅샷 테스트. Parent: plan `2026-06-29-rn-settlement-sl0-design.md` Task 6~12.

## Harness Impact Questions — 답변

1. **New folder structure? YES** — `apps/mobile/src/shared/ui/` 신규 디렉토리(6 component + index barrel + ui.spec.tsx). 후속 정산 화면(C1·C2·C3)이 `@/shared/ui` barrel 로 소비. `.agents/` 영향 없음.
2. **New naming convention? YES(경미)** — `ui.spec.tsx` = 렌더 스냅샷(behavior) 테스트 파일명. repo-wide 규약 아님(RN ui 한정). `.agents/` 갱신 불요.
3. **New dependency? NO** — 신규 npm 의존 0. 테스트는 기존 `@testing-library/react-native`, 컴포넌트는 EVAL-0058 theme 토큰 + RN 코어(StyleSheet·Pressable·Text·View)만 사용.
4. **Verification commands changed? YES** — `pnpm --filter @withkey/mobile test -- ui.spec` 신규(AC verify). package.json script 변경 없음.
5. **Harness instructions outdated? NO(경미 deviation 1건)** — 워크플로/템플릿 불변. plan 의 ui.spec 테스트 코드는 `require("react-native").StyleSheet.flatten(...)` 인라인 require 를 쓰는데, expo lint(`no-require-imports` 계열) 리스크를 피해 top-level `import { StyleSheet } from "react-native"` 로 동치 치환(단언 내용 동일). 기능·AC 무변경.
6. **`.agents/` 문서 갱신? NO** — analytics·Server Action·RSC·RLS·env·시크릿 전부 무관(순수 RN presentational primitive).

## 주요 설계 결정 (plan 충실 + AC 확인)

- **Stamp 정적**: `Animated`/`Easing` 미import — 회전 애니메이션 생략(spec §SL0). variant `label`(단어) / `wordmark`(from·with 2줄 + 이중 링), tone 4, `color` prop 직접 주입(영수증 invite-stamp `#4a3f37`). accessibilityRole=image.
- **Button YAGNI**: variant 5(default·outline·secondary·ghost·destructive) × size 3(default·sm·lg). web 의 `link` variant·`icon` size 는 정산 도메인 미사용이라 제외. 터치 타깃 minHeight≥44(default/sm 44, lg 52) — RN 접근성. destructive 배경은 web `bg-destructive/10` → `rgba(255,107,107,0.1)`.
- **alpha 색은 rgba**: Chip success `#52C28C/15`→`rgba(82,194,140,0.15)`, danger `#FF6B6B/12`→`rgba(255,107,107,0.12)`. RN 은 `/alpha` 문법 미지원.
- **Card shadow**: web `shadow-[0_1px_2px_rgba(20,24,36,0.04)]` → RN `shadowColor/Offset/Opacity/Radius` + `elevation:1`(Android). tone=default 만 그림자.
- **EmptyState icon**: web 은 `ComponentType`(lucide) 이나 RN 아이콘 의존 회피 위해 `icon?: ReactNode`(이미 렌더된 노드, optional).

## 검증 결과

- `pnpm --filter @withkey/mobile test -- ui.spec` → 14/14 PASS(Button 3·Chip 2·Card 2·Stamp 3·EmptyState 2·ErrorState 2).
- `pnpm --filter @withkey/mobile test`(전체) → 21 suites · **194/194 PASS**(기존 비파괴).
- `pnpm --filter @withkey/mobile exec tsc --noEmit` → clean.
- `pnpm --filter @withkey/mobile lint` → exit 0.
- `pnpm harness:check` PASS · `pnpm validate:docs` OK.
