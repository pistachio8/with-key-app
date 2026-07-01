---
Task: EVAL-0072
Track: port
Kind: migration
Status: blocked
Blocked-by: [task:EVAL-0067] — 토큰 확장 완료 전에는 parity 를 사후 강제할 수 없다(ADR-0044·spec §C).
Parent: docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md
---

# EVAL-0072: RN recap(정산) 화면 구현 + 1:1 parity (P0)

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0072` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10). spec: docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md §A(`/challenge/[id]/recap` 행, 1:1 parity) / ADR: docs/adr/0044-rn-screen-visual-parity.md
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-screen-parity-recap` (base: develop, EVAL-0067 머지 후)

## Goal

`apps/mobile/src/app/(app)/challenge/[id]/recap.tsx`는 현재 `PlaceholderScreen`만 렌더하는 스텁이다(read 계약은 EVAL-0017 산출물 `fetchRecap`·`fetchChallengePhotos`가 이미 완성) — spec §A 표는 이 화면을 "native 구현"으로 분류하지만 실제 코드는 미구현이라, 이 task 는 순수 재도장이 아니라 **정산 요약 + 사진 갤러리 UI 구현과 parity 적용을 동시에 수행**한다. PWA `/challenge/[id]/recap`와 "1:1 parity" 분류(spec §A)를 목표로, EVAL-0059 정산 SL0 primitive(`Card`·`Stamp`·`EmptyState`)와 EVAL-0067 확장 토큰을 사용한다. screenshot acceptance(spec §B)를 DoD 로 통과한다.

## Source Files to Inspect

- `apps/web/src/app/(app)/challenge/[id]/recap/page.tsx` — PWA 원본(정산 영수증·사진 갤러리·공유. story/montage/share-card 는 Non-goals)
- `apps/mobile/src/app/(app)/challenge/[id]/recap.tsx` — 현재 placeholder 스텁
- `apps/mobile/src/features/recap/api/recap-reads.ts` — `fetchRecap`·`fetchChallengePhotos` (기존 read 계약, 변경 금지)
- `apps/mobile/src/shared/ui/index.ts` — EVAL-0059 primitive(Card·Stamp·EmptyState)
- `apps/mobile/src/shared/theme/index.ts` — EVAL-0067 확장 토큰(invite 팔레트 포함)
- `docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md` §A·§B

## Target Files

- `apps/mobile/src/app/(app)/challenge/[id]/recap.tsx`

## Requirements

- `fetchRecap(viewerId, { challengeId })`·`fetchChallengePhotos(challengeId)`로 정산 요약(달성 현황·MVP·벌금)과 사진 그리드를 렌더한다.
- 정산 요약은 `shared/ui`의 `Card`·`Stamp` primitive(정산 영수증 룩, invite 팔레트)를 재사용해 PWA `SettlementReceipt` 와 컴포넌트 parity를 맞춘다.
- 사진 그리드는 `FlatList`(또는 그리드 컬럼) + `signedUrl` 렌더, 실패 시 개별 카드만 빈 처리.
- recap 없음(아직 끝난 챌린지 없음) 상태는 `EmptyState` primitive 로 parity(§B-3 #4).
- 로딩·오류(read 실패) 상태 parity.
- StyleSheet 는 EVAL-0067 확장 토큰만 사용 — 하드코딩 hex/px 금지.

## Non-goals

- 스토리 재생·몽타주·공유 카드 생성 — 이미지/영상 생성 endpoint 는 서버 유지, RN native share 는 후속(00-rn-conversion-plan §1.1).
- 정산 계좌 인라인 프롬프트 — group/[id] 계좌 플로우와 함께 후속.
- `fetchRecap`·`fetchChallengePhotos` 계약 변경.

## Acceptance Criteria

| 기준                                         | 검증 방법                                        |
| -------------------------------------------- | ------------------------------------------------ |
| 정산 요약+사진 그리드 렌더(placeholder 대체) | 코드 검토 + `pnpm --filter @withkey/mobile test` |
| recap 없음/로딩/오류 EmptyState·재시도       | `pnpm --filter @withkey/mobile test`             |
| shared/ui primitive 재사용(하드코딩 없음)    | 코드 검토                                        |
| 전 모바일 테스트 회귀 없음                   | `pnpm --filter @withkey/mobile test`             |
| screenshot acceptance 375/320                | PR 첨부 + 수동 확인(spec §B)                     |
| typecheck·lint 이상 없음                     | 아래 verify 커맨드                               |
| harness 추적성                               | `pnpm harness:check`                             |

## Verification Commands

```bash
pnpm --filter @withkey/mobile test
pnpm --filter @withkey/mobile exec tsc --noEmit
pnpm --filter @withkey/mobile lint
pnpm harness:check
pnpm validate:docs
# manual: 375·320pt PWA/RN recap(요약+갤러리) side-by-side 비교, spec §B-3 1~5 확인 후 PR 첨부
```

## Expected Output Summary

placeholder → 정산 요약·사진 갤러리 구현 내역, shared/ui primitive 재사용 방식, 1:1 parity 판단 근거, story/montage/share 제외 사유, 375·320 screenshot 비교 결과를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? No.
2. Did this task introduce a new naming convention? No.
3. Did this task introduce a new dependency? 없음(shared/ui·recap-reads 재사용).
4. Did this task change verification commands? screenshot 수동 비교 절차 신규 — drift-reports 노트.
5. Did this task reveal that the current harness instructions are outdated? spec §A 의 `/challenge/[id]/recap` "native 구현" 분류가 실제 placeholder 상태와 불일치 — drift-reports 노트 권장.
6. Should any `.agents/` document be updated? → yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- 정산 요약·사진 갤러리 구현 완료 + 상태 화면(로딩/빈/오류) parity + 전체 테스트 비파괴 + typecheck·lint green + `pnpm harness:check` 통과 + screenshot acceptance(375·320) 증거 첨부 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 태스크 과대, 정산 요약과 사진 갤러리를 분리해 split-work-packages 로 분할.
