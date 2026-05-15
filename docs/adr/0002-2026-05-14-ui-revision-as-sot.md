# ADR-0002: 2026-05-14 UI 리비전 — 모킹업이 시각·IA·플로우 SoT

**Date**: 2026-05-14
**Status**: accepted
**Deciders**: ian.jung@gbike.io (PO)

## Context

POC 1주차 종료, 2주차 dogfood 직전에 디자인 리비전 v4
(`docs/mockups/2026-05-14-ui-revision.html`)를 받음. 단순 시각 교체가 아니라
정보 구조(IA)·플로우 재설계가 포함됨. 예:

- 참여완료 화면 별도 라우트 폐기 → 서명 직후 redirect + 보너스 배너
- 외부 공유는 별도 화면이 아니라 og:image 동적 라우트로 처리
- BottomNav 탭 재정의 (구: 홈/인증/서약서 → 신: 홈/그룹/FAB/피드/마이)

기존 PRD는 시각 리비전 전 IA에 정렬돼 있어 모킹업과 다수 충돌.

## Decision

UI 리비전 작업(`docs/superpowers/plans/2026-05-14-ui-revision.md`) 기간 동안
**모킹업이 시각·정보구조·플로우의 Single Source of Truth**.

- 시각(레이아웃·색·간격·아이콘·typography): 모킹업 우선
- 정보 구조·카피·유저 플로우: 모킹업 우선
- 충돌 시 PRD를 모킹업에 맞춰 후행 업데이트 (PR8 cleanup)
- 결정적 충돌(데이터 모델·RLS·인증 플로우 등 되돌리기 비용이 큰 영역)은
  자동 결정 금지 → PO 확인 후 진행
- WCAG AA contrast 검증에서 모킹업 컬러가 fail이면 → PO에게 미세조정 안 제시 후 결정

## Alternatives Considered

### 1. PRD를 사전에 일괄 업데이트한 뒤 시각 PR 진행

- **Pros**: 코드와 문서 항상 sync
- **Cons**: PRD 업데이트 자체가 큰 단일 PR이 되고, 시각 구현이 그만큼 지연
- **Why not**: dogfood 직전 일정 압박, 모킹업 의도가 구현 과정에서 추가 검증되어야
  PRD를 한 번에 정확히 쓸 수 있음

### 2. 시각 PR마다 그 화면의 PRD 섹션을 같이 갱신

- **Pros**: 매 PR 코드/문서 sync
- **Cons**: PR 본문 비대, 시각 변경과 IA 결정이 한 PR에 섞임
- **Why not**: 가드레일 §"외과적 수정" — 시각/문서 변경 분리가 리뷰 효율 ↑

## Consequences

### 긍정적

- 시각 PR은 시각만 → 리뷰 부담 최소, 회귀 추적 명확
- PRD cleanup PR이 "실제 머지된 결과"를 보고 일괄 정리 → drift 사이클 단축
- 정책이 코드보다 먼저 머지되어 도구·사람 합류 시 혼란 없음

### 부정적 / 비용

- PR0~PR7 기간(예상 7~10일) 동안 PRD가 stale
  → 이 ADR이 stale 사실과 cleanup 일정을 명시함으로써 허용

### 후속 영향

- PR8(`docs: UI 리비전 PRD 동기화`)에서 PRD §2·§3·§4·§5·§9.1 영향 영역 갱신
- 키워드 풀(`src/lib/keywords/pool.ts`)은 POC freeze 정책 유지
- `src/lib/analytics/track.ts`는 IA 변경이 이벤트 송신 지점에 영향 줄 수 있음 → PR6/PR7에서 발견 시 spec 동반
