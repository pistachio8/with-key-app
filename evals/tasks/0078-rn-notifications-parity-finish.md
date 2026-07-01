---
Task: EVAL-0078
Track: port
Kind: migration
Status: blocked
Blocked-by: [task:EVAL-0054] [task:EVAL-0067] — 알림 센터 화면 자체가 아직 없다(EVAL-0054 가 신규 build, 현재 blocked) + 토큰 확장(EVAL-0067)도 선행돼야 parity 를 적용할 수 있다.
Parent: docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md
---

# EVAL-0078: RN 알림 센터 화면 parity 마감 — screenshot acceptance (P2)

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0078` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10). spec: docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md §A(`/notifications` 행, 1:1 parity, P2 — EVAL-0054 후) / ADR: docs/adr/0044-rn-screen-visual-parity.md
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-screen-parity-notifications` (base: develop, EVAL-0054·0067 머지 후)

## Goal

`/notifications`는 EVAL-0054 가 **신규 build**(IDB→AsyncStorage 포팅, 카테고리 탭 4개)하는 미구현 화면이다 — re-skin 대상이 아니다(spec §A "미구현"). EVAL-0054 가 화면을 만들 때는 본 ADR-0044/parity spec 이 아직 없었으므로, 이 task 는 EVAL-0054 산출물 위에 EVAL-0067 확장 토큰을 적용하고 screenshot acceptance(spec §B)를 최종 DoD 로 통과시키는 **parity 마감** task 다.

## Source Files to Inspect

- `evals/tasks/0054-rn-notification-center-screen.md` — 화면 구현 범위(카테고리 탭 4개·미읽음 배지·탭 이동)
- `apps/web/src/app/(app)/notifications/page.tsx` — PWA 원본
- `apps/mobile/src/shared/theme/index.ts` — EVAL-0067 확장 토큰
- `docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md` §A·§B

## Target Files

- `apps/mobile/src/app/(app)/(tabs)/_layout.tsx` — EVAL-0054 산출물(수정 없음, 탭 진입점 확인용)
- 신규(EVAL-0054 산출물, 본 task 에서 재도장): apps/mobile/src/app/(app)/(tabs)/notifications.tsx · apps/mobile/src/capabilities/push-notification/notification-store.ts 소비 UI

## Requirements

- EVAL-0054 가 만든 알림 센터 화면의 StyleSheet 를 EVAL-0067 확장 토큰(colors·typography·radius·spacing)으로 치환한다.
- 카테고리 탭 4개(전체·리마인더·친구 인증·벌금) 구성·카드 위계가 PWA 와 parity(1:1, §B-3 #1).
- 빈(알림 없음) 상태 parity(§B-3 #4).
- 탭 이동·읽음 처리 등 핵심 인터랙션은 EVAL-0054 계약을 변경하지 않는다(§B-3 #3 확인만).

## Non-goals

- AsyncStorage CRUD·수신 핸들러 로직 변경 — EVAL-0054 범위.
- 알림 설정(on/off) — EVAL-0055 범위.
- home "만회 찬스 대기" 섹션 등 다른 화면 통합.

## Acceptance Criteria

| 기준                                           | 검증 방법                                              |
| ---------------------------------------------- | ------------------------------------------------------ |
| notifications.tsx StyleSheet 토큰화            | 코드 검토                                              |
| 카테고리 탭 4개·빈 상태 렌더 비파괴            | `pnpm --filter @withkey/mobile test`                   |
| screenshot acceptance 375/320 + 체크리스트 5항 | PR 첨부 + 수동 side-by-side 확인(spec §B, 자동화 불가) |
| typecheck·lint 이상 없음                       | 아래 verify 커맨드                                     |
| harness 추적성                                 | `pnpm harness:check`                                   |

## Verification Commands

```bash
pnpm --filter @withkey/mobile test
pnpm --filter @withkey/mobile exec tsc --noEmit
pnpm --filter @withkey/mobile lint
pnpm harness:check
pnpm validate:docs
# manual: 375pt·320pt 뷰포트에서 PWA/RN 알림 센터 화면 side-by-side 비교(카테고리 탭 4종+빈 상태), spec §B-3 체크리스트 1~5 확인 후 PR 첨부
```

## Expected Output Summary

토큰화 내역, 카테고리 탭 4종 parity 판단, 빈 상태 확인, 375·320 screenshot 비교 결과를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? No.
2. Did this task introduce a new naming convention? No.
3. Did this task introduce a new dependency? 없음.
4. Did this task change verification commands? screenshot 수동 비교 절차 신규 — drift-reports 노트.
5. Did this task reveal that the current harness instructions are outdated? 판단 필요.
6. Should any `.agents/` document be updated? → yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- 토큰화 완료 + 카테고리 탭·빈 상태 비파괴 + typecheck·lint green + `pnpm harness:check` 통과 + screenshot acceptance(375·320) 증거 첨부 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 태스크 과대, split-work-packages 로 분할.
