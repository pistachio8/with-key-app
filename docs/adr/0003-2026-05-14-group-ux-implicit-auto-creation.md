# ADR-0003: 그룹 UX — 자동 그룹 생성 + 명시 UI 폐기

**Date**: 2026-05-14
**Status**: accepted, extended by [ADR-0012](./0012-group-persistent-crew-model.md)
**Deciders**: ian.jung@gbike.io (PO)

## Context

2026-05-14 UI 리비전 모킹업은 "그룹" 개념을 UX에서 **숨김**:

- 챌린지 생성 wizard에 그룹 입력 UI 없음
- 모킹업 13개 섹션 어디에도 "그룹 만들기" 화면 없음
- 사용자에게 챌린지가 1차 시민, 그룹은 데이터 모델 차원만

그러나 `groups` 테이블은 BE_SCHEMA §5.2의 1차 시민이며 migration 23개·RPC·RLS·계좌 암호화가 모두 그룹 단위. 데이터 모델 차원의 그룹 제거는 POC 범위 초과.

## Decision

**데이터 모델은 유지, UX 차원에서만 그룹을 숨김:**

- 첫 챌린지 생성 시 `createChallenge` Server Action이 그룹을 **자동 생성** (이름: `{displayName}님과 친구들`, 계좌 없이)
- `/group/new` 명시 라우트 **폐기** (PR5)
- `/group/[id]/page.tsx` **신설** (PR7) — 그룹 상세 = 챌린지 리스트 + 멤버 + 계좌 설정
- **계좌 입력은 lazy** — 정산 시점 (§11 "정산 요청" 클릭 시 계좌 없으면 inline prompt) + `/me` 안 group 카드 두 곳에서 가능
- 헤더 chevron-down sheet으로 그룹 전환 (BottomNav 없음 — ADR-0004 참조)

## Alternatives Considered

### 1. 그룹 = 챌린지 1:1 매핑 강제

- **Pros**: UX 단순
- **Cons**: BE_SCHEMA §5.2 모델과 충돌, migration 다수 + RLS 재작성 = POC 범위 초과
- **Why not**: 비용 ↑↑

### 2. 현 코드 유지 + 모킹업 카피만 톤다운

- **Pros**: 코드 변경 최소
- **Cons**: 모킹업 §3 챌린지 생성 wizard에 그룹 입력이 없는데 현 코드는 명시 — IA 갭 그대로
- **Why not**: ADR-0002 "모킹업 SoT" 정신과 충돌

## Consequences

### 긍정적

- 데이터 모델·RLS·migration 무손상 → 가드레일 §3 §Supabase/RLS 준수
- 모킹업 의도(그룹 명시 UI 없음)를 시각 레이어에서 구현
- 사용자 onboarding 마찰 ↓ (그룹 만들기 단계 생략, 계좌 lazy)

### 부정적 / 비용

- `createChallenge` Server Action에 그룹 자동 생성 로직 추가
- 계좌 입력 lazy 트리거 카피 신설 (정산 시점)
- `/group/new` 옛 라우트 deprecation — 외부 링크 보존 위해 redirect

### 후속 영향

- `createChallenge` Server Action 변경 → `src/lib/validators/challenge.ts` spec 동반 가능 (PR5)
- `/group/new/_actions.ts` `createGroup` 함수는 `/group/[id]` settings 내부에서 metadata edit·계좌 추가용으로 재활용
- PRD §3 그룹 서약서 섹션 — 시각·UX 카피 갱신 (PR8)
