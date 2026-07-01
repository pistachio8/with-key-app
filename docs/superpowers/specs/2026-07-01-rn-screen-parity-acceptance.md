---
spec: 2026-07-01-rn-screen-parity-acceptance
title: RN 화면 시각 parity — screenshot acceptance 표준
author: pistachio8
date: 2026-07-01
status: approved
---

## Summary

[ADR-0044](../../adr/0044-rn-screen-visual-parity.md)가 채택한 "RN 화면은 native 로 재작성하되 시각 목표는 대응 PWA 화면과 parity" 방침을 **실행 가능한 검증 기준**으로 구체화한다. 이 spec 은 세 가지를 고정한다: (1) 시각 parity 대상 화면 목록과 각 화면의 parity 분류, (2) 각 화면 컨버팅 task 가 통과해야 하는 **screenshot acceptance criteria**(비교 뷰포트 · 판정 방법 · parity 체크리스트), (3) 화면 parity 작업의 선행 의존과 우선순위.

이 spec 이 머지되면 `create-agent-tasks` 로 화면별 컨버팅 EVAL task 를 분해하고, 각 task 는 여기 정의된 acceptance 체크리스트를 DoD(Definition of Done, 완료 정의)로 인용한다. **본 spec 은 문서이며 코드·스키마를 변경하지 않는다.**

## Why

- **"옮겨졌다"의 기준이 없다** — 현재 시각 parity 는 `04-rn-architecture.md` A10 에서 "screenshot QA best-effort" 로만 언급되고 화면별 통과 기준이 없어, 화면마다 완성도가 들쭉날쭉해진다.
- **요청을 규칙 위반 없이 실행하려면 정의가 필요하다** — "PWA 그대로 컨버팅" 요청을 `03-rn-migration-rules §5`("CSS→StyleSheet 기계 번역 금지")와 충돌 없이 실행하려면, parity 를 "구현 방법"이 아니라 "검증 가능한 결과 목표"로 못 박아야 한다.
- **IA(정보구조)가 다른 화면을 구분해야 한다** — RN 은 Bottom Tabs 기반이라(`01-rn-mvp-prd §6.3`) 일부 화면은 PWA 와 1:1 대응하지 않는다. 이를 "실패"로 오판하지 않으려면 분류 기준이 선행돼야 한다.
- **선행 의존을 드러내야 한다** — 전 화면 parity 는 RN 디자인 토큰이 정산 SL0 를 넘어 확장돼야 가능한데(`04-rn-architecture` A10, status: spec 미작성), 이 순서를 명시하지 않으면 화면부터 하드코딩 스타일로 칠해져 나중에 parity 를 강제할 수 없다.
- **자동 pixel-diff 인프라가 없다** — RN screenshot 자동 회귀 도구가 아직 없어, POC 단계 판정 방법을 현실적으로(수동 비교) 고정해야 과약속을 피한다.

## Impact Scope

### 변경 경로

- 신규: `docs/superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md` (본 문서)
- 수정: 없음 (승인 후 후속 PR 에서 `docs/migration/03-rn-migration-rules.md` 상호참조 · `evals/tasks/` 신규 task 는 별건)

### src/ 영향

없음 (문서 only). 후속 구현 task 는 `apps/mobile/src/app/**` · `apps/mobile/src/features/**` · `apps/mobile/src/shared/{theme,ui}/**` 를 다루지만 본 spec 범위 밖.

### Supabase / RLS / migration 영향

없음.

### 외부 서비스

없음.

## Design

핵심은 세 부분이다: **(A) 대상 화면 목록 + 분류**, **(B) screenshot acceptance criteria**, **(C) 우선순위·선행 의존**.

### A. 대상 화면 목록 + parity 분류

출처: PWA 라우트 인벤토리 `docs/migration/00-rn-conversion-plan.md §1.1`(17개 user-facing). RN 현재 구현: `apps/mobile/src/app/**`(EVAL-0017·0018·0019 산출).

분류 정의:

- **1:1 parity** — PWA 화면과 RN 화면이 직접 대응. 레이아웃·토큰·인터랙션을 parity 목표로 검증.
- **IA 재배치 + 컴포넌트 parity** — 화면이 RN 탭/스택 구조에 맞춰 재배치되나, 내부 컴포넌트(카드·리스트·버튼)는 parity 목표. "전체 레이아웃 동일"은 기대하지 않음.
- **비대상** — 시각 parity 검증에서 제외(사유 명시).

| PWA 화면 (`§1.1`)                    | RN 현재 상태               | parity 분류                                         | 우선순위 |
| ------------------------------------ | -------------------------- | --------------------------------------------------- | -------- |
| `/home`                              | native 구현(re-skin)       | IA 재배치(탭 셸) + 컴포넌트 parity                  | **P0**   |
| `/challenge/[id]` (feed)             | native 구현(re-skin)       | IA 재배치(challenge 탭 navigator) + 컴포넌트 parity | **P0**   |
| `/challenge/[id]/dashboard`          | native 구현                | IA 재배치 + 컴포넌트 parity                         | **P0**   |
| `/challenge/[id]/info`               | native 구현                | IA 재배치 + 컴포넌트 parity                         | **P0**   |
| `/challenge/[id]/action` (사진 인증) | native 구현                | 1:1 parity                                          | **P0**   |
| `/challenge/[id]/pledge` (서약)      | native 구현                | 1:1 parity                                          | **P0**   |
| `/challenge/[id]/recap` (정산)       | native 구현                | 1:1 parity                                          | **P0**   |
| `/challenge/new` (+`/done/[id]`)     | native 구현                | 1:1 parity                                          | P1       |
| `/login`                             | native 구현                | 1:1 parity                                          | P1       |
| `/invite/[token]`                    | native 구현                | 1:1 parity                                          | P1       |
| `/me` (프로필/설정)                  | native 구현                | IA 재배치(탭) + 컴포넌트 parity                     | P1       |
| `/group/[id]`                        | 부분(features/group reads) | 1:1 parity                                          | P1       |
| `/notifications` (알림 센터)         | 미구현(EVAL-0054 blocked)  | 1:1 parity                                          | P2       |
| `/me/challenges`                     | 미구현                     | 1:1 parity                                          | P2       |
| `/legal/privacy` · `/legal/terms`    | 미구현                     | **비대상** — WebView/웹 링크 유지(`§1.1` 분류)      | —        |

Legacy redirect(`/action`·`/feed`·`/pledge`·`/recap`·`/settings` 등 `§1.2`)는 RN 에서 deep link alias 로만 존재 → **화면 parity 비대상**. Route handler·OG·share endpoint(`§1.3`)는 서버 유지 → 비대상.

**왜 P0 가 핵심 루프 화면인가**: `01-rn-mvp-prd §3` 의 검증된 핵심 루프 5종(서약·인증·AI일기·피드·정산)에 대응하는 화면이라, parity 를 먼저 고정해야 dogfood 시각 품질이 확보된다.

### B. screenshot acceptance criteria

각 화면 컨버팅 task 의 DoD 로 인용되는 공통 기준.

**B-1. 비교 뷰포트** (모바일 세로형 전제)

- **기준(필수)**: 375pt 폭 — iPhone 표준(iOS 시뮬레이터 예: iPhone 15). PWA 는 모바일 Safari/DevTools 375px.
- **소형(필수)**: 320pt 폭 — 최소 지원 폭. clipping·overflow·줄바꿈 깨짐 확인용.
- **대형(권장)**: 768pt 이상(태블릿) 은 P0 범위 밖. 필요 화면만 선택 확인.
- Android 는 P0 에서 iOS 기준 통과 후 육안 확인(전면 필수 아님) — **왜**: POC dogfood 는 iOS 실기기 중심(`project_rn_ios_device_build`).

**B-2. 판정 방법** — **수동 side-by-side 비교 + 체크리스트**

- 각 화면의 PWA screenshot 과 RN screenshot 을 같은 뷰포트에서 나란히 놓고 아래 B-3 체크리스트로 판정.
- **자동 pixel-diff 는 채택하지 않는다** — **왜**: RN screenshot 회귀 인프라가 없고, ADR-0044 가 pixel-perfect 를 목표로 하지 않으므로(색·간격 토큰 일치가 목표이지 픽셀 동일이 아님) 수동 판정이 적절. 자동화는 Out of scope.
- task PR 에 두 뷰포트(375·320) screenshot 을 **증거로 첨부**(PWA/RN 쌍). **왜**: harness review-evidence 원칙 — "화면이 떠도 증거 없으면 옮겨진 게 아니다"(`02-rn-migration-harness.md:113`).

**B-3. parity 체크리스트** (화면당 전 항목 충족 = acceptance PASS)

1. **레이아웃 구조 · 정보 위계** — 주요 섹션의 순서·상대 크기·강조가 PWA 와 일치(1:1 화면). IA 재배치 화면은 "화면 내 컴포넌트"에 한해 적용.
2. **디자인 토큰** — 색(팔레트) · 타이포(크기/굵기 위계) · 간격 리듬 · radius 가 RN 토큰(`shared/theme`)과 일치, PWA `globals.css` 토큰값과 parity(`0058` 방식의 값 parity).
3. **핵심 인터랙션** — CTA · 상태 전이(로딩/성공/실패) · 선택 UI(서약 체크·키워드 picker 등)가 PWA 와 동등하게 동작.
4. **상태 화면 parity** — 로딩 · 빈(empty) · 오류(error) 상태가 각각 존재하고 PWA 와 위계·문구 톤 일치. **왜**: QUALITY_GATE §리뷰 기준 "사용자 플로우를 깨는 로딩/빈/오류 상태" 방지.
5. **native 관용 반영** — safe-area 인셋 · 탭바/헤더 · 스크롤·제스처가 native 관용을 따름(웹 max-width 가정 잔재 없음). **이 항목은 "PWA 와 다름"이 정상** — 위 1~4 와 상충 시 native 관용이 우선.

**판정**: 1~4 는 parity 충족, 5 는 native 적합. 5 를 이유로 1~4 를 희생하지 않고, 1~4 를 이유로 5(웹 레이아웃 잔재)를 남기지 않는다.

### C. 우선순위 · 선행 의존

- **선행(블로커)**: RN 디자인 토큰을 정산 SL0(`0058·0059`) → **전 화면 공통 토큰으로 확장**(`04-rn-architecture` A10, 현재 status: spec 미작성). 이 토큰 확장 task 가 P0 화면 parity 의 선행. **왜**: 토큰 없이 화면부터 칠하면 하드코딩 스타일이 흩어져 B-3 #2 를 사후 강제할 수 없다.
- **순서**: 토큰 확장 → P0(핵심 루프 7화면 re-skin) → P1(생성/인증진입/프로필/그룹) → P2(알림 센터[EVAL-0054 후]·내 챌린지·기타).

## Alternatives Considered

1. **자동 pixel-diff 회귀(예: Playwright/Detox screenshot + 임계 diff)** — Pros: 객관적·재현 가능. Cons: RN screenshot 안정화 인프라 부재, flake 위험, pixel-perfect 목표 아님(ADR-0044). Why not: POC 단계 과투자 — 수동 side-by-side 로 시작하고 인프라는 후속 결정.
2. **화면 목록·기준 없이 "육안 QA"만** — Pros: 즉시 착수. Cons: 화면별 완성도 편차, DoD 부재로 "옮겨졌다" 판정 불가. Why not: ADR-0044 가 요구하는 "게이트화"를 충족 못 함.
3. **전 화면 1:1 parity(IA 재배치 화면도 레이아웃 동일 강제)** — Pros: 단순 규칙. Cons: RN Bottom Tabs 와 충돌, native UX 저하. Why not: `01-rn-mvp-prd §6.3` 의 새 IA 결정과 모순.

## Verification

### 명령

```bash
pnpm validate:docs   # 본 spec 내부 링크 무결성
```

구현 task 의 실제 화면 검증은 각 task PR 에서 수행(아래 시나리오). 본 spec 자체는 문서 검증만 해당.

### 시나리오

- **정상(PASS)**: P0 화면 X 를 375pt 에서 PWA/RN 나란히 비교 → B-3 체크리스트 1~5 전 항목 충족, 두 뷰포트 screenshot 을 PR 에 첨부.
- **엣지 — 소형 폭**: 320pt 에서 clipping·overflow·줄바꿈 깨짐 없음(B-1 소형 필수).
- **엣지 — 상태 화면**: 빈/오류 상태를 강제(네트워크 차단·빈 데이터)해 각 상태의 parity 확인(B-3 #4).
- **엣지 — IA 재배치 화면**: `/home`·`/challenge/[id]` 는 전체 레이아웃 동일이 아니라 "내부 컴포넌트 parity + 탭 IA 적합"으로 판정(FAIL 오판 방지).
- **FAIL 예시**: RN 화면에 웹 max-width 여백 잔재(B-3 #5 위반) 또는 토큰 대신 하드코딩 색(B-3 #2 위반) → 반려.

## Rollout

- 도입 순서: 본 spec 머지 → 토큰 확장 task → P0 → P1 → P2 (Design §C).
- dogfood: P0 화면부터 iOS 실기기 dev build 에서 screenshot QA. 뷰포트 375 우선, 320 clipping 확인.
- 재검토: P0 완료 후 자동 pixel-diff 도입 여부와 공유 `packages/tokens` 승격(`04-rn-architecture` A10)을 재논의.

### 롤백

문서 spec 이므로 1 commit revert. 구현 task 는 각 task 브랜치 단위로 독립 롤백.

## Out of scope

- **자동 pixel-diff / screenshot 회귀 인프라** — 후속 결정(Rollout 재검토 시점).
- **공유 `packages/tokens`** — cutover 후(`04-rn-architecture` A10).
- **legal 화면(`/legal/*`)의 시각 parity** — WebView/웹 링크 유지 방침이라 대상 아님.
- **route handler · OG 이미지 · share clip endpoint(`§1.3`)** — 서버 유지, UI 화면 아님.
- **화면별 구현 자체** — 본 spec 은 acceptance 기준만 정의. 구현은 후속 EVAL task.

## 용어집

- **acceptance criteria**: 작업이 통과로 인정받기 위한 검증 기준. 여기서는 screenshot 비교 + parity 체크리스트.
- **DoD (Definition of Done, 완료 정의)**: task 가 "완료"로 인정받기 위한 조건.
- **dogfood**: 팀이 실제 사용자로서 앱을 써 보며 검증하는 단계.
- **IA (Information Architecture, 정보구조)**: 화면·탭·메뉴의 배치·연결 구조. RN 은 Bottom Tabs 기반이라 PWA 와 다른 지점이 있다.
- **parity**: 원본(PWA)과의 동등성. 본 spec 에서는 픽셀 동일이 아니라 "동일 디자인 언어(토큰·위계) + native 관용" 수준.
- **PWA (Progressive Web App)**: 현행 웹 앱. 시각 parity 의 원본.
- **RN (React Native)**: 전환 대상 네이티브 앱.
- **re-skin**: 이미 native 로 구현된 화면의 스타일을 parity 기준에 맞춰 다시 입히는 작업.
- **SL0**: 정산(settlement) 디자인시스템 첫 슬라이스. `0058·0059` 산출물.
- **뷰포트**: 화면 비교 기준 폭(375pt 기준 · 320pt 소형).
