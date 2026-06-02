# ADR-0004: 챌린지 종료일 사용자 선택 + 최소 1주 제약

**Date**: 2026-05-14
**Status**: accepted
**Deciders**: ian.jung@gbike.io (PO)

## Context

이전 grill round 에서 모킹업 §3-A calendar 아이콘을 "number input 트리거"로 처리하기로 결정 (date-picker 라이브러리 미도입). 사용자 review 후 의도 재확인 — **종료일이 필요하고 최소 1주 이상**.

Q13 grill round 에서 다음 의미 명확화:

- 종료일 절대 날짜 선택 (캘린더) → 시스템이 `duration_days` 변환
- 시작일은 서버 결정 유지 (전원 서명 시점)
- 최소 1주 기준은 오늘 (사용자 입력 시점)

## Decision

- **react-day-picker + date-fns 도입** (~40KB gzipped)
- `EndDatePicker` 컴포넌트 신설 (3 preset pill + 캘린더)
- `validators.durationDays.min(7)` — 1주 미만 차단
- `start_at` 서버 결정 유지 (현 transition model 무변경)
- `duration_days = endDate - today` 계산 (생성 시점 기준)
- 모킹업 §3-A "최대 3개월" 카피 그대로 (max 90 유지)

## Alternatives Considered

### 1. 사용자가 시작일도 선택 (Q13-B-ii)

- **Pros**: 챌린지 시간 윈도우 완전 사용자 제어
- **Cons**: 현 transition model(전원 서명 = active) 충돌, ADR 추가 + RPC 갱신
- **Why not**: POC 범위 초과

### 2. 시작일 = 생성일 (Q13-B-iii)

- **Pros**: 가장 단순
- **Cons**: 전원 서명 model 폐기 = PRD §3 그룹 서약서 §3.3 AC 다수 영향
- **Why not**: PRD 큰 변경, 기능 핵심 (서약서 → 동시 시작) 손상

### 3. number input 유지 (이전 결정)

- **Pros**: 라이브러리 도입 없음, 코드 단순
- **Cons**: 사용자가 절대 날짜 인식 어려움, "언제 끝나는지" 직관 ↓
- **Why not**: PO review 후 의도 재확인 — 종료일 캘린더 UX 가치 ↑

## Consequences

### 긍정적

- 모킹업 §3-A calendar 아이콘 의도 충실 구현
- 종료일 시각 명확 ("2026-06-12 (목)" 표기)
- 1주 미만 챌린지 차단으로 의미 있는 dataset 보장
- POC v1 이후 시작일 선택 등 확장 자연스러움

### 부정적 / 비용

- `react-day-picker` + `date-fns` 의존성 추가 (~40KB)
- `validators/challenge.ts` 변경 → spec-required + spec 작성 (2026-05-14-challenge-validators-revision)
- migration CHECK 갱신 가능성 → `0024_challenge_validators_revision.sql`
- PRD §3.3·§8.2 D-006 (duration_days "POC 고정: 7") 갱신 (PR8)

### 후속 영향

- PRD §3.3 AC 갱신 — "최소 1주" 명시
- PRD §8.2 challenges.duration_days 비고 "POC 고정: 7" → "7~90"
- BE_SCHEMA §5.5 D-006 갱신
- migration 0024 신설 (CHECK 변경 필요 시)
