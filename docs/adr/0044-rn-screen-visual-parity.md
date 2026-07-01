# ADR-0044: RN 화면 시각 parity 정책 (screenshot acceptance)

**Date**: 2026-07-01
**Status**: proposed <!-- accepted / superseded / deprecated -->
**Deciders**: pistachio8 (PO 승인 대기)

이 ADR은 PWA(Progressive Web App)의 각 화면을 RN(React Native)으로 옮길 때 "결과가 시각적으로 어느 수준까지 원본과 같아야 하는가"를 정의한다. 결론부터: **UI는 계속 native 로 재작성하되, 각 화면의 시각적 목표를 "대응 PWA 화면과의 parity"로 못 박고 이를 화면별 screenshot acceptance 로 검증한다.** 이는 기존 "기계적 번역 금지" 규칙을 뒤집는 것이 아니라 강화하는 것이다.

## Context

배경과 현재의 빈틈을 정리한다.

- **현행 전환 전략은 "로직 보존 · UI 재작성"이다.** `docs/migration/00-rn-conversion-plan.md §12` (전환의 핵심은 UI 변환이 아니라 Server Action/RSC/PWA 플랫폼 책임을 API·native capability 로 치환하는 것) 와 `docs/migration/03-rn-migration-rules.md §5` 는 "웹 CSS 를 RN StyleSheet 로 기계적으로 번역하지 않는다", "shadcn/ui 웹 컴포넌트 그대로 이전 불가" 를 명시한다. 즉 **기계적 포팅은 금지**다.
- **그러나 "재작성 결과의 시각 충실도"는 명문화돼 있지 않다.** 시각 parity(원본과의 시각적 동등성)는 리스크 항목(`00-rn-conversion-plan.md §5`)과 아키텍처 노트(`04-rn-architecture.md` A10, L252 — "시각 parity 는 팔레트 수동 포팅 + screenshot QA 로")에서 **best-effort QA** 로만 언급될 뿐, 화면이 "옮겨졌다"고 인정받기 위한 **필수 게이트가 아니다**.
- **관련 PO(Product Owner) 결정이 두 곳에서 열린 채 방치돼 있다.** `docs/migration/04-rn-architecture.md:308` 과 `docs/migration/05-rn-harness-decisions.md:265` 모두 "남은 PO 결정: 새 IA 승인 + 핵심 플로우 screenshot acceptance" 를 open 으로 기재한다.
- **백로그에 화면 시각 컨버팅 task 는 없다.** `evals/tasks/` 전수 확인 결과, PWA 화면을 시각·스타일 동일하게 옮기는 전용 task 는 존재하지 않는다. 가장 근접한 `0058·0059`(RN 정산 디자인시스템 SL0)는 신규 "정산" 범위의 토큰·프리미티브 미러링이고, Non-goals 에 "기존 화면 마이그레이션은 후속 슬라이스" 라고 의도적으로 범위 밖으로 뒀다.
- **요청**: 각 PWA 화면을 RN 에서 시각·스타일 그대로 컨버팅하는 작업을 백로그에 추가하고 싶다.
- **핵심 긴장**: "화면 그대로"를 "CSS 기계 번역"으로 해석하면 `03-rn-migration-rules` 위반이다. 따라서 요청을 실행 가능한 형태로 바꾸려면 정의를 "**native 재작성 + 시각 parity 목표 + screenshot acceptance 검증**"으로 고정해야 한다. 이 정의 고정이 본 ADR 의 목적이다.

## Decision

**RN 전환에서 UI 는 계속 native 로 재작성하되, 각 화면의 시각적 목표를 "대응 PWA 화면과의 parity"로 명시하고, 이를 화면별 screenshot acceptance criteria 로 검증한다.** 이 결정은 `03-rn-migration-rules` 의 "기계적 번역 금지"를 유지·강화하는 것이지 뒤집는 것이 아니다.

세부 규칙·범위·예외:

- **범위** — 시각 parity 목표 대상은 핵심 사용자 플로우 화면(홈, 챌린지 상세, 액션 로그/사진 인증, 피드, 정산, 알림 센터/설정 등)이다. 확정 목록·우선순위는 동반 spec 에서 정한다. **왜**: 화면 30개 이하 POC 에서 전 화면 일괄 지정은 범위 폭발을 부른다.
- **parity 의 정의** — "시각 parity" = 레이아웃 구조 · 정보 위계 · 색/타이포/간격 등 디자인 토큰 · 핵심 인터랙션이 PWA 와 일치함을 뜻한다. **픽셀 완전 동일(pixel-perfect)이 아니라** "동일 디자인 언어 + native 관용(safe-area · 탭바 · 제스처)" 이다. **왜**: 픽셀 동일은 RN 에 DOM 이 없어 성립 불가하고, native 관용을 무시하면 UX 가 오히려 나빠진다.
- **IA(정보구조, Information Architecture) 예외** — RN 은 Bottom Tabs 기반이라 PWA 와 화면 구성이 다른 지점이 있다(`docs/migration/01-rn-mvp-prd.md §6.3` — "PWA 에 없던 새 IA"). 이런 화면은 "1:1 parity" 대상이 아니라 "**IA 재배치 + 컴포넌트 parity**" 대상으로 분류한다. **왜**: 탭 구조에 맞춘 재배치를 "원본과 다르다"고 실패 처리하면 안 된다.
- **검증 게이트** — 각 화면 컨버팅 task 는 screenshot acceptance 를 DoD(Definition of Done, 완료 정의)에 포함한다. 비교 뷰포트 · 허용 오차 · 비교 방법(수동 vs 자동)은 동반 spec 에서 표준화한다. **왜**: "화면이 떠도 보존 eval 을 통과 못 하면 옮겨진 게 아니다"(`02-rn-migration-harness.md:113`)라는 하네스 원칙과 정렬한다.
- **구현 방법 금지 유지** — CSS→StyleSheet 기계 번역, shadcn 웹 컴포넌트 직수입은 **여전히 금지**다(`03-rn-migration-rules §5`). parity 는 결과의 시각적 목표이지 구현 수단이 아니다. **왜**: 목표(시각 동등)와 수단(기계 번역)을 혼동하면 규칙 위반으로 되돌아간다.
- **선행 의존** — 전 화면 parity 는 RN 디자인 토큰이 정산 SL0 를 넘어 전체로 확장돼야 가능하다(`04-rn-architecture.md` A10 — 디자인 토큰 status: spec 미작성). 따라서 **토큰 확장이 화면 parity task 의 선행 조건**이다. **왜**: 토큰 없이 화면부터 칠하면 하드코딩 스타일이 흩어져 parity 를 나중에 강제할 수 없다.

## Alternatives Considered

### 1. 기계적 포팅 (픽셀 parity · CSS→StyleSheet 번역)

- **Pros**: 시각 일치를 빠르게 달성한 듯한 착시, 화면당 판단 비용 적음.
- **Cons**: `03-rn-migration-rules §5` 정면 위반, native 관용(safe-area · 제스처) 무시로 UX 저하, 웹 레이아웃 가정이 그대로 남아 유지보수 부채.
- **Why not**: 규칙 SoT(Single Source of Truth) 위반인 데다 RN 에 DOM 이 없어 애초에 성립하지 않는다.

### 2. 현행 유지 (시각 parity = best-effort QA, 게이트 아님)

- **Pros**: 유연함, 추가 문서·기준 작성 비용 없음.
- **Cons**: 화면별 품질 편차, "옮겨졌다"의 기준 모호, 요청된 일관 컨버팅을 지원하지 못함, 열린 PO 결정 방치.
- **Why not**: 사용자가 명시적으로 화면 전반의 일관 parity 를 원하고, 미결 PO 결정을 계속 미루는 상태를 종료해야 한다.

### 3. 공유 디자인 토큰 패키지(`packages/tokens`) 선(先)구축 후 parity

- **Pros**: web·RN 이 토큰을 공유하는 이상적 SoT 구조.
- **Cons**: `04-rn-architecture.md` A10 에서 공유 토큰은 cutover 후로 이미 연기됨, 지금 착수하면 범위 폭발.
- **Why not**: 순서상 mobile-local 토큰 확장이 먼저이고, 공유화는 cutover 후 후속 결정이다. 본 ADR 은 mobile-local 토큰 확장까지만 선행으로 요구한다.

## Consequences

### 긍정적

- "화면이 옮겨졌다"의 객관적 DoD(screenshot acceptance) 확보 — 화면 품질이 균일해진다.
- 미결 PO 결정(새 IA 승인 + screenshot acceptance)을 종료한다.
- 요청("화면 그대로 컨버팅")과 기존 규칙("기계 번역 금지")의 관계를 공식적으로 정렬해, 이후 오해·재논쟁을 없앤다.

### 부정적 / 비용

- 화면별 screenshot 기준 작성·유지 비용이 든다(뷰포트 · 오차 · 참조 이미지 관리).
- 디자인 토큰을 정산 SL0 밖으로 확장하는 선행 작업이 필요하다.
- IA 가 다른 화면을 "1:1" vs "재배치 + 컴포넌트 parity" 로 나누는 판단 비용이 화면마다 발생한다.

### 후속 영향

- **동반 spec 작성(초안 완료)** — screenshot acceptance 표준(대상 화면 목록 · 비교 뷰포트 375/320 · parity 체크리스트 · 판정 방법)을 [`2026-07-01-rn-screen-parity-acceptance`](../superpowers/specs/2026-07-01-rn-screen-parity-acceptance.md) 로 작성(status: draft).
- **열린 PO 결정 닫기** — 승인 시 `docs/migration/04-rn-architecture.md:308` · `docs/migration/05-rn-harness-decisions.md:265` 의 open 항목을 "ADR-0044 로 resolved" 로 표기.
- **task 분해** — `create-agent-tasks` 로 화면별 컨버팅 EVAL task 생성. 이미 native 구현된 화면(`0017` 홈/챌린지 read-only 등)은 "re-skin" task, 미구현 화면은 신규 build task 로 구분.
- **선행 토큰 task 편성** — 디자인 토큰 확장을 화면 parity task 의 선행으로 백로그에 먼저 넣는다.
- **규칙 상호참조** — 승인 후 `03-rn-migration-rules` 에 "재작성의 시각 목표 = parity + screenshot acceptance (ADR-0044)" 한 줄 상호참조를 추가.

## 용어집

- **DoD (Definition of Done)**: 작업이 "완료"로 인정받기 위한 조건. 여기서는 각 화면 컨버팅 task 의 screenshot acceptance 통과.
- **IA (Information Architecture, 정보구조)**: 화면·메뉴·탭이 어떻게 배치·연결되는지의 구조. RN 은 Bottom Tabs 기반이라 PWA 와 다른 지점이 있다.
- **parity**: 원본(PWA)과의 동등성. 본 ADR 에서는 픽셀 완전 동일이 아니라 "동일 디자인 언어 + native 관용" 수준의 시각적 동등을 뜻한다.
- **PO (Product Owner)**: 제품 결정권자. 새 IA 승인·acceptance 기준 채택의 최종 게이트.
- **PWA (Progressive Web App)**: 브라우저로 설치 가능한 현행 웹 앱. 전환의 원본.
- **RN (React Native)**: 전환 대상 네이티브 앱 플랫폼.
- **screenshot acceptance**: 구현 화면의 스크린샷을 참조 기준과 비교해 통과/실패를 판정하는 검증.
- **SL0**: 정산(settlement) 디자인시스템의 첫 슬라이스(slice 0). `0058·0059` 산출물.
- **SoT (Single Source of Truth)**: 중복 없이 기준으로 삼는 단일 원본.
