# ADR-0013: Notification Prefs Default Off

**Date**: 2026-05-21
**Status**: proposed
**Deciders**: pistachio8

## Context

운영 환경에서 `notification_prefs.start=true` ∧ `push_subscriptions=∅` 정합 깨짐 상태가 발견됨 (정우정 user, 2026-05-21).

- `users.notification_prefs` DB column default 가 `'{"start":true,"deadline":true}'::jsonb` (migration 0014) → 신규 가입자가 자동으로 토글 ON 상태로 보임
- 그러나 `push_subscriptions` row 는 사용자가 명시적으로 토글 ON 클릭 + iOS 권한 허용까지 해야 생성됨
- 즉 "토글은 켜져 있지만 푸시는 안 옴" 함정이 코드/DB 흐름상 신규 가입자 모두에게 적용
- `dispatch.loadTargets` 가 `push_subscriptions` row 없는 사용자를 `targets.length===0` 으로 제외하므로, 친구가 인증해도 푸시 발화 자체가 일어나지 않음 (PRD §6.2 AC 위반)

추가로, client `subscribed` state staleness 우회로 인해 기존 사용자도 같은 상태로 빠질 수 있음 — 이 경로는 본 PR 의 `push-settings.tsx` `ensureSubscription` 재설계로 별도 처리.

## Decision

`users.notification_prefs` column 의 DB default 를 `'{"start":false,"deadline":false}'::jsonb` 로 변경 (migration 0031).

- 신규 가입자는 두 토글 모두 OFF 상태로 시작
- /me 진입 시 사용자가 직접 토글 ON → iOS 시스템 권한 프롬프트 트리거 → 허용 시 `push_subscriptions` row 생성 → prefs.true 가 DB 에 박힘
- 기존 row 는 `ALTER COLUMN SET DEFAULT` 의 특성상 영향 없음 (future INSERT 만 적용)
- 코드 측 `src/lib/db/reads/notification-prefs.ts` 의 `DEFAULT_PREFS` 도 동일 OFF 로 변경 — UI fallback 정합

## Alternatives Considered

### 1. DB default 변경 안 함 (코드 `DEFAULT_PREFS` 만 OFF)

- **Pros**: migration 불필요, ADR 불필요, PR scope 작음
- **Cons**: `notification_prefs` 가 NOT NULL + 기존 DB default = ON 이라 신규 가입자 DB row 에 여전히 `{start:true,deadline:true}` 박힘. `fetchNotificationPrefs` 가 fallback 까지 도달하지 않아 `DEFAULT_PREFS` 변경 효과가 없다.
- **Why not**: 본 결정의 핵심 목표(신규 가입자 함정 해결)가 달성되지 않는다.

### 2. 기존 사용자 데이터도 일괄 OFF 로 migration

- **Pros**: 함정에 빠진 모든 기존 사용자의 토글 표시가 정합 회복
- **Cons**: 실제로 알림 받고 있던 사용자도 OFF 로 바뀌어 푸시 끊김 — 명시적 사용자 의사 무시
- **Why not**: 기존 사용자 중 `push_subscriptions` row 가 정상으로 박혀 있는 그룹은 알림 받는 게 의도된 동작. 일괄 변경은 명시 동의 없는 데이터 alteration 이라 부적절.

## Consequences

### 긍정적

- 신규 가입자의 "토글 켜져 있지만 푸시 안 옴" 함정 차단
- iOS 권한 프롬프트가 명시적 사용자 의사 시점에 트리거되어, 권한 거부 학습 데이터(이미 거부했으면 다시 안 뜸)와 정합
- `prefs.start=true` 와 `push_subscriptions` row 존재가 같은 사용자 액션으로 함께 만들어지는 invariant 회복

### 부정적 / 비용

- 신규 가입자 onboarding 시 알림 활성화에 1 회 추가 클릭 필요
- 기존에 "가입 직후 자동 ON" UX 를 가정한 회원 안내 문구가 있다면 재검토 (현재 없음)
- POC 단방향 정책상 down migration 없음 — 롤백 필요 시 0032 추가 migration 으로 처리

### 후속 영향

- `src/lib/db/reads/notification-prefs.ts` 의 `DEFAULT_PREFS` 도 OFF 로 동기 (동일 PR 포함)
- `src/app/(app)/me/_components/push-settings.tsx` 의 `ensureSubscription` / 분기 재설계 (동일 PR — stale state 우회 차단)
- (후속 PR 후보) onboarding flow 에 "알림 받으려면 /me 에서 토글 ON" 안내 추가 검토
