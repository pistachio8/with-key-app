---
Task: EVAL-0059
Track: greenfield
Kind: migration
Status: done
Depends-on: [task:EVAL-0058] — theme 토큰(colors·typography·radius)이 완성돼야 UI primitive 가 import 가능하다.
Parent: docs/superpowers/plans/2026-06-29-rn-settlement-sl0-design.md
---

# EVAL-0059: RN 정산 디자인 시스템 SL0 — UI primitive 6종 + barrel

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0059` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10). spec: docs/superpowers/specs/2026-06-29-rn-settlement-points-redemption-design.md §SL0
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-settlement-sl0-design` (base: develop)

## Goal

`apps/mobile/src/shared/ui/`를 신규 생성하고 web `components/ui/*`를 RN StyleSheet로 미러한 primitive 6종(Button·Chip·Card·Stamp·EmptyState·ErrorState)과 barrel을 만든다. 렌더 스냅샷 테스트(`ui.spec.tsx`)가 모두 green이 되고, SL0 Definition of Done이 충족된다. EVAL-0058(theme 토큰) 완료 후 착수한다.

상세 구현 내용은 `docs/superpowers/plans/2026-06-29-rn-settlement-sl0-design.md` Task 6~12를 따른다.

## Source Files to Inspect

- `docs/superpowers/plans/2026-06-29-rn-settlement-sl0-design.md` Task 6~12 — 각 primitive의 variant·props·StyleSheet 상세
- `apps/mobile/src/shared/theme/colors.ts` · `radius.ts` · `typography.ts` — EVAL-0058 산출물(import 대상)
- `docs/superpowers/specs/2026-06-29-rn-settlement-points-redemption-design.md` §SL0 — primitive 스펙(터치 타깃·variant·YAGNI 범위)
- `apps/mobile/src/shared/components/screen-states.tsx` — 기존 공용 컴포넌트 경로(건드리지 않음, 참고용)

## Target Files

- `apps/mobile/src/shared/` — ui/ 디렉토리 신규 생성: button.tsx · chip.tsx · card.tsx · stamp.tsx · empty-state.tsx · error-state.tsx · index.ts · ui.spec.tsx

## Requirements

- Button: variant 5(default·outline·secondary·ghost·destructive) × size 3. accessibilityRole=button, minHeight≥44. link·icon 제외(YAGNI).
- Chip: tone 5(neutral·primary·secondary·success·danger). alpha 배경은 rgba.
- Card: padding 4(none·sm·md·lg) × tone 3(default·muted·primary). borderRadius=14, web shadow를 RN shadow로.
- Stamp: variant(label·wordmark) × tone 4 + color prop(영수증 직접 주입). **회전 애니메이션 없음**. accessibilityRole=image.
- EmptyState: icon?(ReactNode) · title · description? · action?. title=typography.h3, description=typography.sub.
- ErrorState: 기본 문구 + onRetry?시 Button ghost 렌더.
- barrel: 6종 + 타입 re-export. 기존 테스트 비파괴.
- 구현 상세: plan Task 6~12 참조.

## Non-goals

- Stamp 회전 애니메이션 금지(정적)
- Button link·icon variant(YAGNI), 정산 도메인 밖 컴포넌트
- 기존 shared/components/ 수정 금지, 기존 화면 primitive 교체 — 후속 슬라이스

## Acceptance Criteria

| 기준                                                | 검증 방법                                       |
| --------------------------------------------------- | ----------------------------------------------- |
| Button 렌더·onPress·disabled·접근성·터치타깃        | `pnpm --filter @withkey/mobile test -- ui.spec` |
| Chip tone=danger 색·Stamp label/wordmark/color prop | `pnpm --filter @withkey/mobile test -- ui.spec` |
| Card tone=primary 배경·EmptyState/ErrorState 렌더   | `pnpm --filter @withkey/mobile test -- ui.spec` |
| Stamp 정적(Animated 미사용)                         | 코드 검토                                       |
| 기존 테스트 비파괴                                  | `pnpm --filter @withkey/mobile test`            |
| TypeScript·ESLint 이상 없음                         | 위 verify 커맨드                                |
| harness 추적성                                      | `pnpm harness:check`                            |

## Verification Commands

```bash
pnpm --filter @withkey/mobile test -- ui.spec
pnpm --filter @withkey/mobile test
pnpm --filter @withkey/mobile exec tsc --noEmit
pnpm --filter @withkey/mobile lint
pnpm harness:check
pnpm validate:docs
```

## Expected Output Summary

`shared/ui/` 디렉토리 신규 생성, Button·Chip·Card·Stamp·EmptyState·ErrorState 구현 내용(각 variant·props·주요 StyleSheet 결정), Stamp 정적 처리 확인, ui.spec.tsx 렌더 테스트 전 항목 green, 기존 테스트 비파괴 확인, barrel export 목록을 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? `shared/ui/` 디렉토리 신규 — yes. drift-reports 노트.
2. Did this task introduce a new naming convention? `ui.spec.tsx` 렌더 스냅샷 파일명. drift-reports 노트.
3. Did this task introduce a new dependency? 없음(EVAL-0058의 culori와 기존 @testing-library/react-native만).
4. Did this task change verification commands? `pnpm --filter @withkey/mobile test -- ui.spec` 신규. drift-reports 노트.
5. Did this task reveal that the current harness instructions are outdated? 판단 필요.
6. Should any `.agents/` document be updated? → yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- 6종 primitive 렌더 테스트 전 항목 green + 기존 테스트 비파괴 + typecheck PASS + `pnpm harness:check` 통과 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 태스크 과대, 각 primitive를 별도 task 로 split-work-packages 분할.
