# ADR-0028: 전원 서명 완료 시 오너 시작 nudge

**Date**: 2026-06-01
**Status**: accepted
**Deciders**: pistachio8

## Context

오너는 전원이 서명을 마친 뒤에도 `StartChallengeCard`를 직접 눌러야 챌린지를 시작한다. 멤버가 마지막으로 서명을 끝낸 경우 오너는 앱 밖에 있어 "전원 서명 완료"를 모를 수 있다. "전원 서명 시 자동 시작"은 [ADR-0009](0009-pending-invite-explicit-start.md)가 막은 늦은 가입자 코호트 freeze 버그(72h 오픈 초대 링크라 "전원 서명"이 "모집 완료"를 보장하지 못함)를 재발시킨다.

## Decision

자동 시작 대신 오너에게 1탭 시작을 유도(nudge)한다. `active` 전이는 여전히 오너의 명시적 `start_challenge_with_signed_participants` 호출로만 일어난다(ADR-0009 유지).

- `sign_and_maybe_activate`(0040)가 서명 직후 "전원 서명 && 참가자 ≥2 && 마지막 서명자 ≠ 오너"를 판정해 `should_nudge_owner`를 반환한다.
- 중복 발송은 `challenges.start_nudge_sent_at` + challenge row `for update` lock 으로 정확히 1회 보장한다.
- 오너가 마지막 서명자면 푸시 없이 인앱 `StartChallengeCard`로 처리한다(이미 시작 화면에 진입).
- 푸시 옵트인은 기존 `start` prefs 키를 재사용하고 분석 type 도 `"start"`를 쓴다(스키마 변경 없음).
- info 탭의 `StartChallengeCard` 중복(layout 헤더 + startSlot)을 layout 헤더로 일원화한다.

## Consequences

- prefs 기본 OFF([ADR-0013](0013-notification-prefs-default-off.md))라 푸시 실제 도달률은 낮고, 인앱 `StartChallengeCard`가 주 채널이다.
- `notification_sent.type`을 `"start"`로 재사용하므로 nudge 효과(푸시→시작 전환)는 실제 시작 푸시와 분리 측정되지 않는다.
- 푸시 실패/미구독 시 `start_nudge_sent_at`이 이미 set 되어 재발송하지 않는다(kudos 식 보상 로직 없음) — 인앱 카드 fallback이 강력하기 때문이다.
- `accept_invite`로 nudge 후 새 멤버가 합류·서명해 다시 전원 서명이 되어도 재발송하지 않는다 — "1회 알림"의 의도된 한계.
- D-day 작업(`start_challenge_with_signed_participants`·RLS·표시)과 DB 객체·파일 교집합이 없어 독립적으로 머지 가능하다.
