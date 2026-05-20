# ADR-0009: Pending Invite Window and Explicit Challenge Start

**Date**: 2026-05-20
**Status**: accepted
**Deciders**: pistachio8

## Context

초대 기반 첫 가입 플로우에서 오너가 챌린지 생성 중 서명하면 참가자가 오너 1명뿐인 경우 즉시 `active` 로 전이됐다. 이후 친구가 카카오 로그인으로 초대를 수락하면 `group_members` 에는 들어가지만 이미 `active` 인 챌린지의 `challenge_participants` 에는 들어가지 않아, `/home` 에서는 내 챌린지처럼 보이지만 상세/인증에서는 “참가자가 아님” 상태가 됐다.

이 동작은 “친구에게 초대 링크를 공유하고 전원이 서명한 뒤 시작한다”는 사용자 기대와 맞지 않았다. 동시에 이미 시작된 챌린지의 코호트를 중간에 바꾸면 인증 기록, 푸시, 분석 이벤트가 흔들린다.

## Decision

`pending` 을 초대/서명/시작 멤버 확정 창으로 정의하고, `active` 는 코호트가 고정된 시작 상태로 유지한다.

- `sign_and_maybe_activate` 는 기존 이름을 유지하되 더 이상 자동 활성화하지 않고 서명만 기록한다.
- 오너가 `start_challenge_with_signed_participants` RPC 를 호출할 때만 `active` 로 전이한다.
- 시작 시점에는 `signed_at is not null` 인 참가자만 현재 챌린지 코호트로 유지하고, 미서명 참가자는 현재 챌린지에서 제외한다. 그들은 그룹 멤버로 남아 다음 챌린지부터 함께한다.
- `accept_invite` 는 신규/기존 그룹 멤버 모두 최신 `pending` 챌린지의 참가자로 idempotent 편입한다.
- `active` 챌린지 이후의 초대 수락은 그룹 멤버 합류만 수행한다.
- `action_logs` INSERT RLS 는 `active` 기간뿐 아니라 `challenge_participants` 멤버십도 직접 확인한다.
- 홈에서는 그룹 멤버지만 active 코호트에 없는 챌린지를 “다음 챌린지부터 함께해요” 상태로 별도 표시한다.

## Consequences

초대 유입자는 카카오 로그인 후 `/home` 으로 떨어지지 않고, pending 챌린지가 있으면 바로 서약서 화면으로 간다. 오너는 친구 응답을 기다리다가 “혼자 시작하기” 또는 “서명한 멤버로 시작하기”를 명시적으로 눌러 챌린지를 시작한다.

기존 `sign_and_maybe_activate` 이름은 일시적으로 의미와 어긋난다. 클라이언트 호출부와 타입 표면을 크게 흔들지 않기 위한 호환 선택이며, v1에서 `sign_pledge` 같은 명확한 RPC 명으로 정리할 수 있다.

시작 푸시와 `challenge_activated` 이벤트는 서명 액션이 아니라 오너 시작 액션에서만 발생한다. 따라서 자동 활성화에 따른 중복 발화와 active 되돌림은 발생하지 않는다.
