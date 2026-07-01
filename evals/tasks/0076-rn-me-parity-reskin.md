---
Task: EVAL-0076
Track: port
Kind: migration
Status: todo
Depends-on: [task:EVAL-0055] [task:EVAL-0067] — EVAL-0055(알림 설정 섹션)가 같은 파일(`me.tsx`)을 다루므로 충돌을 줄이려면 그 후 착수하고, 토큰 확장도 선행돼야 재작업이 없다(하드 게이트 아님, 순서 권장).
Parent: docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md
---

# EVAL-0076: RN me(프로필/설정) 화면 구현 + IA 재배치 parity (P1)

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0076` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: TS SoT 없음 — AT eval 흡수(05 §2 D10). spec: docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md §A(`/me` 행, IA 재배치+컴포넌트 parity, P1) / ADR: docs/adr/0044-rn-screen-visual-parity.md
- Parent Test Scenario: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Engineering Story: TS SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Work Package: `feat/rn-screen-parity-me` (base: develop, EVAL-0055·0067 머지 후)

## Goal

`apps/mobile/src/app/(app)/(tabs)/me.tsx`는 현재 이메일 표시 + 로그아웃만 있는 최소 스텁이다("프로필 · 설정 — 후속 task" 주석 명시) — spec §A 표는 이 화면을 "native 구현"으로 분류하지만 PWA `/me`의 카드 4종(프로필·내 챌린지 요약·알림 설정·약관)에는 크게 못 미친다. **알림 설정 섹션은 EVAL-0055 범위**이므로, 이 task 는 나머지 카드(프로필 요약·내 챌린지 요약·피드백 링크·약관 링크)를 구현하며 "IA 재배치(탭) + 컴포넌트 parity" 분류(spec §A)로 parity 를 적용한다. screenshot acceptance(spec §B)를 DoD 로 통과한다.

## Source Files to Inspect

- `apps/web/src/app/(app)/me/page.tsx` (및 `_components/profile-card.tsx` · `my-challenges-card.tsx` · `feedback-link.tsx` · `legal-links.tsx` · `logout-button.tsx`) — PWA 원본
- `apps/mobile/src/app/(app)/(tabs)/me.tsx` — 현재 최소 스텁(이메일+로그아웃)
- `apps/mobile/src/features/profile/api/profile-reads.ts` — 프로필 read 계약(재사용)
- `apps/mobile/src/features/challenge/api/challenge-reads.ts` — `fetchMyChallenges`(owner/member 분리, 이미 포팅됨) 재사용, count 는 `owner.length`/`member.length` 로 인라인 파생(web `deriveCounts` 는 web-local 이라 미이식)
- `evals/tasks/0055-rn-notification-prefs-settings.md` — 알림 설정 섹션(병행/후속 task, 중복 구현 금지)
- `apps/mobile/src/shared/theme/index.ts` — EVAL-0067 확장 토큰
- `docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md` §A·§B

## Target Files

- `apps/mobile/src/app/(app)/(tabs)/me.tsx`

## Requirements

- 프로필 요약(표시 이름·이메일·가입월) 카드를 `profile-reads.ts` 또는 `useSession`으로 구현.
- 내 챌린지 요약 카드 — `fetchMyChallenges(userId)` 로 owner/member count 만 표시(상세 목록·관리 UI 는 EVAL-0079 `/me/challenges` 범위, 여기선 요약 수치만).
- 피드백 링크·약관 링크(WebView 또는 웹 링크 유지, spec Out of scope 준수 — legal 화면 자체는 비대상).
- 로그아웃은 기존 `signOut` 흐름 유지.
- **알림 설정 섹션은 이 task 범위 밖** — EVAL-0055 가 별도로 채운다(같은 파일이므로 삽입 지점만 남겨두거나 병합 시 충돌 최소화).
- 카드 구성은 "화면 내 컴포넌트" 단위로 PWA 와 parity, 탭 IA 배치 자체는 실패 사유 아님(spec §A).
- StyleSheet 는 EVAL-0067 확장 토큰만 사용.

## Non-goals

- 알림 설정 카드 구현 — EVAL-0055.
- `/me/challenges` 상세 관리 화면 — EVAL-0079.
- 프로필 편집(표시 이름 변경 등) — PWA 에 없으면 신설 금지.

## Acceptance Criteria

| 기준                                           | 검증 방법                                              |
| ---------------------------------------------- | ------------------------------------------------------ |
| 프로필·내 챌린지 요약·피드백·약관 링크 렌더    | `pnpm --filter @withkey/mobile test`                   |
| 알림 설정 섹션 미포함(EVAL-0055 과 미중복)     | 코드 검토                                              |
| 로그아웃 기존 흐름 비파괴                      | `pnpm --filter @withkey/mobile test`                   |
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
# manual: 375pt·320pt 뷰포트에서 PWA/RN me 화면 side-by-side 비교(카드 구성 기준, 탭 IA 차이는 정상), spec §B-3 체크리스트 1~5 확인 후 PR 첨부
```

## Expected Output Summary

구현한 카드 목록(프로필·내 챌린지 요약·피드백·약관), EVAL-0055 와의 경계 처리 방식, IA 재배치+컴포넌트 parity 판단 근거, 375·320 screenshot 비교 결과를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1. Did this task introduce a new folder structure? No.
2. Did this task introduce a new naming convention? No.
3. Did this task introduce a new dependency? 없음(WebView 사용 시 expo-web-browser 재사용 여부 판단 필요 — drift-reports 노트).
4. Did this task change verification commands? screenshot 수동 비교 절차 신규 — drift-reports 노트.
5. Did this task reveal that the current harness instructions are outdated? spec §A 의 `/me` "native 구현" 분류가 실제 최소 스텁 상태와 불일치 — drift-reports 노트 권장.
6. Should any `.agents/` document be updated? → yes 항목은 `evals/drift-reports/` 노트.

## Stop Condition

- 프로필·내 챌린지 요약·피드백·약관 카드 구현 + 로그아웃 비파괴 + EVAL-0055 섹션 미중복 + typecheck·lint green + `pnpm harness:check` 통과 + screenshot acceptance(375·320) 증거 첨부 + Harness Impact Questions 답변 완료.
- pass@3 안에 green 못 만들면 → 태스크 과대, 카드별로 split-work-packages 분할.
