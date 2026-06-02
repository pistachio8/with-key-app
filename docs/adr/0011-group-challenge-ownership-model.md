# ADR-0011: 그룹·챌린지 책임 분리 · 동시 1개 제약

**Date**: 2026-05-20
**Status**: accepted
**Deciders**: ian
**Related**: ADR-0003 (auto-group), ADR-0009 (pending-invite explicit start), spec [2026-05-20-group-challenge-concept](../superpowers/specs/2026-05-20-group-challenge-concept.md)

## Context

PRD·코드·UI 가 "그룹 = 챌린지" 인 양 혼용되어 카피·상태머신·동시성에 모순이 누적되었다. 특히:

- `StatusCard.socialProof` 가 `participantCount === 1` 만 보고 "혼자 시작했어요" 를 출력해 `pending+솔로` 에서도 같은 카피가 노출.
- `DashboardTab` 의 3번째 KPI 가 `daysRemaining === null` 을 "종료" 로 표시하지만, `end_at IS NULL` 은 사실 `pending|accepted` 에서 더 흔하다 — 의미가 정확히 반전.
- RPC `create_challenge` 와 RLS `challenges_insert_owner` 가 owner-only 를 이미 강제하고 있으나, 그룹당 동시 챌린지 1개 제약은 어디에도 없어 동시성 race 가 발생 가능.

## Decision

- 그룹과 챌린지를 1:N + 직렬(동시 1개) 모델로 재정의.
- partial unique index `challenges_one_open_per_group` 로 `status in ('pending','accepted','active')` 챌린지가 그룹당 1개를 넘지 못하도록 DB 레벨에서 강제.
- `StatusCard.socialProof` 카피를 status × isSolo × isOwner 3축으로 분기.
- `DashboardTab` daysPill 라벨을 status 로 직접 분기.
- `/challenge/new` 의 RSC layout 이 owner 의 open challenge 가 있으면 그 챌린지로 redirect.
- `challenges.created_by` 컬럼은 도입하지 않는다 (owner=creator 모델 유지).

## Alternatives Considered

- `challenges.created_by` 도입 + 모든 멤버에게 챌린지 생성 허용: POC 범위 초과.
- `accepted` 상태를 재활성화하여 자동 전이 트리거 추가: 현 PRD 와 wording 충돌. POC 이후로 미룸.
- `"already_open"` 신규 ErrorCode 도입: `ErrorCode` union·`mapSupabaseError`·UI 카피 매핑 전부 변경 → 컨텍스트 분기로 대체.

## Consequences

긍정:
- DB 레벨에서 동시성 race 차단.
- `pending+솔로`·`accepted+솔로`·`active+솔로`·`closed+솔로` 모두 의미와 카피가 정합.
- KPI 라벨이 `endAt` 파생 신호 대신 status 직접 분기 → 회귀 재발 가능성 ↓.

부정 / 비용:
- 같은 그룹 내에서 "다음 챌린지를 미리 준비" 는 불가 (active 끝난 뒤에만 새 챌린지 가능). 사용자 흐름상 자연스러우나 명시적으로 받아들임.
- `accepted` 상태가 dead state 임을 받아들이고 매트릭스에 안전망 카피만 유지.

## Rollback

`drop index challenges_one_open_per_group;` 한 줄로 즉시 무효화 (별도 migration 권장). UI 변경은 PR revert.
