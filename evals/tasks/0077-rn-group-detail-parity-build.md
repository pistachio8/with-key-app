---
Task: EVAL-0077
Track: port
Kind: migration
Status: todo
Depends-on: [task:EVAL-0067] — 토큰 확장 완료 후 착수해야 재작업이 없다(하드 게이트 아님, 순서 권장).
Parent: docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md
---

# EVAL-0077: RN group/[id] 화면 read-only 구현 + 1:1 parity (P1)

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0077` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10). spec: docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md §A(`/group/[id]` 행, "부분(features/group reads)", 1:1 parity, P1) / ADR: docs/adr/0044-rn-screen-visual-parity.md
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-screen-parity-group` (base: develop, EVAL-0067 머지 후)

## Goal

RN 은 `features/group/api/group-reads.ts`(read 계약)만 있고 화면 자체가 없다 — spec §A 도 이를 "부분"으로 정확히 분류한다. 이 task 는 `apps/mobile/src/app/(app)/group/[id].tsx` 화면을 **신규 구현**하며 EVAL-0067 확장 토큰으로 처음부터 parity 를 적용한다. PWA `/group/[id]`와 "1:1 parity" 분류(spec §A)를 read-only 범위(헤더·멤버·계좌 표시·챌린지 목록)에서 목표로 한다. screenshot acceptance(spec §B)를 DoD 로 통과한다.

## Source Files to Inspect

- `apps/web/src/app/(app)/group/[id]/page.tsx` (및 `_components/group-header.tsx` · `group-account-card.tsx` · `group-members.tsx` · `group-challenges-list.tsx`) — PWA 원본
- `apps/mobile/src/features/group/api/group-reads.ts` — `fetchGroupDetail` 기존 read 계약(재사용, 변경 금지)
- `apps/mobile/src/app/(app)/challenge/[id]/info.tsx` — 계좌 마스킹 표시 패턴 선례(`maskAccountNumber`)
- `apps/mobile/src/shared/theme/index.ts` — EVAL-0067 확장 토큰
- `docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md` §A·§B

## Target Files

- `apps/mobile/src/features/group/api/group-reads.ts` — 구조 선례 확인(수정 없음, 패턴 참조용)
- 신규: apps/mobile/src/app/(app)/group/[id].tsx · apps/mobile/src/features/group/index.ts

## Requirements

- `fetchGroupDetail(groupId)`로 그룹명·멤버 리스트(role 표시)·계좌(마스킹, `maskAccountNumber` 재사용)·소속 챌린지 목록을 렌더.
- 그룹명 → 계좌 카드 → 멤버 리스트 → 챌린지 목록 순서·강조가 PWA 와 parity(1:1, §B-3 #1).
- 계좌 없음(`bankCode`/`accountNumberLast4` null) 상태는 카드 자체를 숨긴다(info.tsx `AccountCard` 패턴과 동일).
- 로딩·빈(그룹 없음/비멤버)·오류 상태 parity(§B-3 #4) — RLS 가 비멤버를 null 로 필터링.
- `features/group/index.ts` barrel 신규(다른 feature 와 동일 공개 API 패턴).
- StyleSheet 는 EVAL-0067 확장 토큰만 사용.

## Non-goals

- 계좌 추가/변경 mutation(`GroupAccountCard` 의 운영자 편집 폼) — write 경로 후속 task.
- 그룹명 변경·그룹 삭제·초대 재발급 mutation.
- `?welcome=` query 1회성 배너(PWA ADR-0008 특수 케이스) — RN 진입 플로우 재검토 필요, 후속.

## Acceptance Criteria

| 기준                                                  | 검증 방법                                              |
| ----------------------------------------------------- | ------------------------------------------------------ |
| group/[id].tsx 신규 — 헤더·계좌·멤버·챌린지 목록 렌더 | `pnpm --filter @withkey/mobile test`                   |
| 계좌 없음 상태 카드 숨김                              | `pnpm --filter @withkey/mobile test`                   |
| 비멤버/그룹 없음 빈 상태                              | `pnpm --filter @withkey/mobile test`                   |
| screenshot acceptance 375/320 + 체크리스트 5항        | PR 첨부 + 수동 side-by-side 확인(spec §B, 자동화 불가) |
| typecheck·lint 이상 없음                              | 아래 verify 커맨드                                     |
| harness 추적성                                        | `pnpm harness:check`                                   |

## Verification Commands

```bash
pnpm --filter @withkey/mobile test
pnpm --filter @withkey/mobile exec tsc --noEmit
pnpm --filter @withkey/mobile lint
pnpm harness:check
pnpm validate:docs
# manual: 375pt·320pt 뷰포트에서 PWA/RN group/[id] 화면 side-by-side 비교, spec §B-3 체크리스트 1~5 확인 후 PR 첨부
```

## Expected Output Summary

group/[id].tsx 신규 구현 내역(헤더·계좌·멤버·챌린지 목록), read-only 범위 판단 근거, 1:1 parity 판단, 375·320 screenshot 비교 결과를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? `app/(app)/group/[id].tsx` 라우트 신규 — drift-reports 노트.
2. Did this task introduce a new naming convention? `features/group/index.ts` barrel 신규(기존 feature 패턴 재사용이라 신규 컨벤션 아님).
3. Did this task introduce a new dependency? 없음.
4. Did this task change verification commands? screenshot 수동 비교 절차 신규 — drift-reports 노트.
5. Did this task reveal that the current harness instructions are outdated? 판단 필요.
6. Should any `.agents/` document be updated? → yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- group/[id].tsx 신규 구현(read-only) + 상태 화면(로딩/빈/오류) parity + typecheck·lint green + `pnpm harness:check` 통과 + screenshot acceptance(375·320) 증거 첨부 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages 로 분할.
