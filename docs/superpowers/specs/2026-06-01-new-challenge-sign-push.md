# Spec: 새 서약서 생성 → 기존 멤버 서명 유도 push + 초대 full 벽 개선

**Date**: 2026-06-01
**Status**: accepted
**Author**: pistachio8
**관련 plan**: [2026-06-01-new-challenge-sign-push](../plans/2026-06-01-new-challenge-sign-push.md)

이 문서는 grill-me 인터뷰(2026-06-01)로 합의된 알림 정책 결정을 기록한다. 마이그레이션·스키마 변경이 없어 ADR(되돌리기 비용 큰 결정) 대신 spec 으로 둔다.

## Context (배경)

이미 소속된 그룹에서 오너가 새 챌린지(서약서)를 만들면 다음 문제가 있었다.

- `create_challenge`(0022) RPC 는 생성 시 **그룹 멤버 전원을 `challenge_participants` 로 시드**(미서명)한다. 즉 기존 멤버는 이미 참가자이고 **서명만 안 한 상태**다.
- 홈 `InvitedChallengeBanner`(미서명 pending 챌린지가 있으면 `/challenge/[id]/pledge` 로 보내는 인앱 배너)는 이미 있지만, **`createChallenge` 액션은 어떤 push 도 보내지 않아** 앱 밖 멤버를 다시 부를 채널이 없었다.
- 오너는 멤버를 부르려 초대 링크를 공유하지만, 초대 링크는 *신규 모집용*이라 정원 찬(4명) 그룹에선 초대 프리뷰 페이지가 "그룹이 가득 찼어요" 막다른 화면을 띄웠다. `fetchInvitePreview` 의 `full` 은 그룹 멤버 수만 보고 클릭자가 이미 멤버인지는 따지지 않는다.

## Decision (결정)

### 1. 새 서약서 생성 시 기존 멤버에게 서명 유도 push

- `createChallenge` 성공 직후 `after()` 로 `dispatchNewChallengeCreatedNotification(challengeId, ownerUserId, title)` 를 1회 발사한다.
- 수신 대상은 **새 챌린지 참가자 전원 − 오너**(생성 직후라 사실상 미서명 전원). 기존 `dispatch(kind="start", excludeUserId)` 참가자 fan-out 헬퍼를 재사용한다.
- 옵트인은 기존 `start` prefs 키, 분석 `notification_sent.type` 도 `"start"` 를 재사용한다 — **prefs zod · PRD §9.1 이벤트 union 변경 없음**(PO 승인 불필요).
- 딥링크는 `/challenge/[id]/pledge`(서명 화면 직행 — 홈 배너와 동일 타겟).
- **dedup 컬럼 불필요**: 챌린지 생성은 1회성 이벤트라 발사도 1회. `after()` fire-and-forget + `catch(console.error)`. 미옵트인/미구독/실패 시 인앱 `InvitedChallengeBanner` 가 fallback.

### 2. 초대 full 화면 → 앱 동선 안내

- 초대 프리뷰 페이지(`invite/[token]/page.tsx`)의 `preview.full` 화면을 막다른 카피에서 안내 + "홈으로 가기" CTA 로 교체한다.
- **auth/멤버십 감지에 의존하지 않는다.** 카카오톡 인앱브라우저는 세션 쿠키가 없어 익명으로 진입하므로([ADR-0008](../../adr/0008-kakao-oauth-introduction.md) — 인앱뷰 OAuth/세션 보존 이슈로 외부 브라우저 유도) 서버가 클릭자가 이미 멤버인지 판정할 수 없다. 그래서 카피로 "이미 멤버라면 홈에서 확인" 동선만 제공한다.

## Trade-offs (받아들인 한계)

- **도달률**: 알림 prefs 기본 OFF([ADR-0013](../../adr/0013-notification-prefs-default-off.md))라 생성 push 실제 도달은 옵트인한 멤버만 — **주 채널은 인앱 `InvitedChallengeBanner`, push 는 보조**. (`AcceptForm` 의 수락 시 "알림 켜두면 좋아요" 토스트가 옵트인 유도 경로로 이미 존재.)
- **분리 측정 불가**: `type="start"` 재사용이라 이 push 효과(생성→서명 전환)가 다른 start 계열 push 와 분리 측정되지 않는다. (nudge [ADR-0028](../../adr/0028-all-signed-owner-start-nudge.md)와 동일 한계.)
- **full 화면의 부분적 도움**: 카톡 익명 제약상 멤버 자동 판정·자동 라우팅은 못 하고 "홈에서 확인" 안내까지만. 실제 재참여는 push·인앱 배너가 담당.

## Alternatives rejected (기각한 대안)

- **신규 prefs 키(`new_challenge`)** — notification_prefs zod 스키마 + 설정 UI + PO 승인 필요. 기본 OFF 도달률 이슈도 동일해 이득이 작다.
- **신규 analytics type(`sign_request`)** — 분리 측정은 되나 PRD §9.1 표 + zod union + parity 테스트 + PO 승인 필요. POC 범위에서 과함.
- **auth 기반 full 벽 수정**(이미 멤버 감지 → /pledge 자동 라우팅) — 카톡 인앱뷰 익명 제약(ADR-0008)으로 주 공유 채널에서 동작하지 않아 복잡도 대비 효과 낮음.
- **dedup 컬럼 추가** — 생성이 1회성이라 불필요. 마이그레이션 비용(단방향)만 늘어난다.

## 검증

- 단위: `dispatch.new-challenge.spec.ts`(오너 제외·payload·quiet) · `new/_actions.spec.ts`(생성 성공 시 push 발사).
- typecheck · lint · 전체 test · validate:docs.
- 모바일 viewport 수동(후속): 기존 멤버 그룹에서 새 챌린지 생성 → (옵트인 시) 멤버 push 도착 · `/challenge/[id]/pledge` 진입 · 정원 찬 그룹 초대 링크 full 화면에 "홈으로 가기" 노출.

## 용어집

- **fan-out**: 한 이벤트로 여러 수신자에게 동시에 보내는 발송 방식.
- **prefs(notification_prefs)**: 사용자별 알림 옵트인 설정(`start` · `deadline` · `kudos`).
- **dedup**: 같은 알림이 중복 발송되지 않도록 막는 중복 제거.
