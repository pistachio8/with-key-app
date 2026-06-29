---
Task: EVAL-0058
Track: greenfield
Kind: migration
Status: done
Parent: docs/superpowers/plans/2026-06-29-rn-settlement-sl0-design.md
---

# EVAL-0058: RN 정산 디자인 시스템 SL0 — theme 토큰 4종 + parity 테스트

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0058` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10). spec: docs/superpowers/specs/2026-06-29-rn-settlement-points-redemption-design.md §SL0
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-settlement-sl0-design` (base: develop)

## Goal

`apps/mobile/src/shared/theme/`에 web `globals.css` SoT를 정확히 미러한 토큰 4종(colors·typography·radius·motion)과 barrel을 만들고, parity 테스트(`theme.spec.ts`)가 green이 된다. colors.ts는 기존 teal 팔레트를 web hex SoT로 교체하되 레거시 alias를 보존해 기존 화면(home·me·feed·challenge)이 typecheck를 통과한다. EVAL-0059(UI primitive)의 전제 조건이다.

상세 구현 내용은 `docs/superpowers/plans/2026-06-29-rn-settlement-sl0-design.md` Task 1~5를 따른다.

## Source Files to Inspect

- `apps/web/src/app/globals.css` — hex SoT(`:61-99`) · OKLCH 보정 토큰(muted·mutedForeground·brandPrimaryDeep) · invite 팔레트(`:127-138`) · radius(`:52-57`) · motion(`:120-125`) · typography `.t-*`(`:186-220`)
- `apps/mobile/src/shared/theme/colors.ts` — 기존 teal 팔레트(재작성 대상, 레거시 키 14개 확인)
- `apps/mobile/src/app/(app)/(tabs)/home.tsx` · `me.tsx` · `apps/mobile/src/shared/components/screen-states.tsx` — 레거시 alias 사용 현황 (typecheck 비파괴 확인용)
- `apps/mobile/package.json` — devDependencies(culori 추가 위치)

## Target Files

- `apps/mobile/src/shared/theme/colors.ts` — **재작성** (web hex SoT + invite 팔레트 + 레거시 alias)
- `apps/mobile/src/shared/theme/` — typography.ts · radius.ts · motion.ts · index.ts · theme.spec.ts 신규
- `apps/mobile/package.json` — devDependencies에 culori 추가

## Requirements

- colors: 시맨틱 토큰(hex SoT) + invite 팔레트 + OKLCH 변환 3종(muted·mutedForeground·brandPrimaryDeep) + 레거시 alias 9종. 모든 색은 #RRGGBB.
- typography: h1~caption 6종 → RN TextStyle. letterSpacing=em×fontSize, lineHeight=ratio×fontSize.
- radius: BASE=14px, sm~3xl 6종 파생.
- motion: duration {fast:120, base:200, slow:320, stamp:520} + easeOutSoft·easeInSoft Easing.bezier.
- theme.spec.ts: parity (a)hex SoT (b)OKLCH culori (c)invite (d)alias. culori=devDependency only.
- 기존 화면 비파괴: tsc --noEmit PASS (레거시 alias 보존).
- 구현 상세: plan Task 1~5 참조.

## Non-goals

- UI primitive — EVAL-0059
- 기존 화면 레거시 alias→시맨틱 마이그레이션 — 후속 슬라이스
- globals.css 수정 금지

## Acceptance Criteria

| 기준                                                       | 검증 방법                                          |
| ---------------------------------------------------------- | -------------------------------------------------- |
| theme.spec parity (a)hex·(b)OKLCH·(c)invite·(d)alias green | `pnpm --filter @withkey/mobile test -- theme.spec` |
| typography·radius·motion 수치 테스트 green                 | `pnpm --filter @withkey/mobile test -- theme.spec` |
| theme barrel 4종 re-export 타입 통과                       | `pnpm --filter @withkey/mobile exec tsc --noEmit`  |
| 기존 화면 비파괴                                           | `pnpm --filter @withkey/mobile exec tsc --noEmit`  |
| TypeScript·ESLint 이상 없음                                | 위 verify 커맨드                                   |
| harness 추적성                                             | `pnpm harness:check`                               |

## Verification Commands

```bash
pnpm --filter @withkey/mobile test -- theme.spec
pnpm --filter @withkey/mobile exec tsc --noEmit
pnpm --filter @withkey/mobile lint
pnpm harness:check
pnpm validate:docs
```

## Expected Output Summary

colors.ts 재작성(hex SoT 토큰·invite 팔레트·OKLCH 변환 3종·레거시 alias 보존), typography/radius/motion 신규 파일, theme barrel, culori devDependency 추가, theme.spec.ts parity 테스트 전 항목 green, 기존 화면 typecheck 비파괴를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? `shared/theme/` 하위 파일 4종 + barrel + spec 신규. drift-reports 노트.
2. Did this task introduce a new naming convention? `theme.spec.ts` parity 테스트 파일명. drift-reports 노트.
3. Did this task introduce a new dependency? `culori` devDependency — yes. drift-reports 노트.
4. Did this task change verification commands? `pnpm --filter @withkey/mobile test -- theme.spec` 신규. drift-reports 노트.
5. Did this task reveal that the current harness instructions are outdated? 판단 필요.
6. Should any `.agents/` document be updated? → yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- parity 테스트 (a)(b)(c)(d) + typography·radius·motion 테스트 전 항목 green + typecheck PASS(기존 화면 비파괴) + `pnpm harness:check` 통과 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages 로 분할.
