---
Task: EVAL-0067
Track: greenfield
Kind: migration
Status: todo
Parent: docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md
---

# EVAL-0067: RN 화면 공통 디자인 토큰 확장 — 정산 SL0 → 전 화면

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0067` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10). spec: docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md §C(선행 토큰 확장) / ADR: docs/adr/0044-rn-screen-visual-parity.md
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-screen-parity-tokens` (base: develop)

## Goal

`apps/mobile/src/shared/theme/`를 정산 SL0(EVAL-0058·0059) 범위에서 P0 화면 전반이 요구하는 공통 토큰으로 확장한다. web `globals.css` 대비 아직 미러되지 않은 semantic 색 토큰(예: input·ring·popover·streak-1~7)을 감사해 추가하고, 화면 간 공통 spacing scale 을 신설한다. 기존 legacy alias·정산(SL0) 소비처는 비파괴로 유지한다. 이 task 는 P0 화면 re-skin(EVAL-0068~0072)의 선행 조건이다 — 토큰 없이 화면부터 칠하면 하드코딩 스타일이 흩어져 parity 를 사후 강제할 수 없다(ADR-0044·spec §C).

## Source Files to Inspect

- `apps/web/src/app/globals.css` — hex/OKLCH SoT. `:16-138` semantic·streak·invite 팔레트, `:52-57` radius, `:186-220` typography
- `apps/mobile/src/shared/theme/colors.ts` — EVAL-0058 산출물(확장 대상)
- `apps/mobile/src/shared/theme/typography.ts` · `radius.ts` · `motion.ts` · `theme.spec.ts` — 기존 parity 테스트 패턴
- `apps/mobile/src/app/(app)/(tabs)/home.tsx` — 기존 하드코딩 padding/margin 수치 감사 예시
- `docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md` §B-3 #2(토큰 parity 체크리스트)

## Target Files

- `apps/mobile/src/shared/theme/colors.ts` — 확장(재작성 아님, 시맨틱 토큰 추가)
- `apps/mobile/src/shared/theme/theme.spec.ts` — parity 테스트 확장
- `apps/mobile/src/shared/theme/index.ts` — barrel 갱신
- 신규: apps/mobile/src/shared/theme/spacing.ts

## Requirements

- globals.css 대비 색 토큰 갭을 감사해 P0 화면에 필요한 누락 semantic 토큰(예: input·ring·popover·popoverForeground·streak-1~7)을 hex SoT 그대로 추가(OKLCH 보정이 필요한 값만 culori 재사용).
- spacing.ts 신규: 기존 native 화면(home·action·pledge 등)에서 반복되는 padding/margin 값을 감사해 8px 그리드 기반 scale(예: xs~2xl)로 추출하고 근거를 주석에 남긴다.
- theme.spec.ts 에 신규 색·spacing parity 케이스를 추가한다(기존 4종 케이스 구조 재사용).
- 기존 legacy alias·`shared/ui/*`(EVAL-0059) 소비처 비파괴 — 전 앱 tsc --noEmit 통과.
- `globals.css` 직접 수정 금지(참조만).

## Non-goals

- 화면별 re-skin 적용 — EVAL-0068~0079 범위.
- 공유 `packages/tokens` 승격 — cutover 후(04-rn-architecture A10).
- dark mode 토큰 — POC 단일 테마 유지.

## Acceptance Criteria

| 기준                                               | 검증 방법                                          |
| -------------------------------------------------- | -------------------------------------------------- |
| 색 토큰 갭 감사 반영(input·ring·popover·streak 등) | `pnpm --filter @withkey/mobile test -- theme.spec` |
| spacing.ts 신규 + 그리드 근거 주석                 | 코드 검토 + `theme.spec`                           |
| 기존 theme.spec 4종 parity 케이스 비파괴           | `pnpm --filter @withkey/mobile test -- theme.spec` |
| 전 앱 typecheck 비파괴                             | `pnpm --filter @withkey/mobile exec tsc --noEmit`  |
| TypeScript·ESLint 이상 없음                        | 위 verify 커맨드                                   |
| harness 추적성                                     | `pnpm harness:check`                               |

## Verification Commands

```bash
pnpm --filter @withkey/mobile test -- theme.spec
pnpm --filter @withkey/mobile exec tsc --noEmit
pnpm --filter @withkey/mobile lint
pnpm harness:check
pnpm validate:docs
```

## Expected Output Summary

globals.css 대비 감사해 추가한 색 토큰 목록, spacing.ts 그리드 근거, theme.spec 확장 결과(전 항목 green), 기존 화면·SL0 소비처 typecheck 비파괴 확인을 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? No(`shared/theme/` 확장).
2. Did this task introduce a new naming convention? `spacing.ts` 파일명 신규 — drift-reports 노트.
3. Did this task introduce a new dependency? 없음(culori 재사용, EVAL-0058 산출물).
4. Did this task change verification commands? No(theme.spec 패턴 유지).
5. Did this task reveal that the current harness instructions are outdated? 판단 필요.
6. Should any `.agents/` document be updated? → yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- 색 토큰 갭 감사 반영 + spacing.ts 신설 + theme.spec 신규·기존 케이스 전 항목 green + typecheck 비파괴 + `pnpm harness:check` 통과 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 색/typography 확장과 spacing 신설을 분리해 split-work-packages 로 분할.
