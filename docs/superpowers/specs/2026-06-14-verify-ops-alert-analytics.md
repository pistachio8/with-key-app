---
spec: 2026-06-14-verify-ops-alert-analytics
title: 검증 운영 알림 + AnalyticsEvent (EVAL-0026) — 집계 경보 유지 + 건별 반려 통지 추가
author: pistachio8
date: 2026-06-14
status: draft
---

## Summary

P2 사진 검증(자동검증 θ + 익명 피어 반려)의 결과를 **분석 가능하게** 만들고, 부정탐지 오작동·그룹 갈등을 **조기 감지**한다. 두 축이다.

1. **신규 AnalyticsEvent 2종** — `verify_auto_resolved`(자동검증 판정 기록)·`verify_peer_rejected`(피어 과반 반려 전이 기록). PRD §9.1 union과 1:1로 추가(PO 승인 선행).
2. **운영 알림 2종**(기존 `notification_sent` 파이프라인에 type 2개 추가) —
   - **집계 ops 경보**(`verify_ops_alert`, `AC-owner-load-3`): 한 챌린지의 **반려/실패 *비율*이 임계 초과**하면 그룹장에게 1회 알림. "이 그룹 뭔가 이상한데?"(부정탐지 오작동·갈등) 조기경보.
   - **건별 반려 통지**(`action_rejected`, 신규): 한 인증이 **피어 과반으로 `peer_rejected` 전이**하면 **작성자 본인에게만** 친근한 정정 안내. "이번 인증은 멤버 판단으로 카운트에서 빠졌어요" — 망신 최소, 다시 찍기 유도.

집계 경보(시스템 이상 신호)와 건별 통지(개별 결과 안내)는 **목적이 달라 공존**한다. 두 알림 모두 **익명성 불변**(누가 반려했는지 payload·문구에 미포함) + **본문 미로깅**(메타만)을 지킨다. 본 spec이 머지된 뒤 구현 PR(EVAL-0026)이 따라온다.

## Why

- **반려 결과가 분석 불가 상태다** — 현 `AnalyticsEvent` union(`apps/web/src/lib/analytics/track.ts`)에 검증 이벤트가 **하나도 없다**. 자동검증 false-flag율(G1 PoC)·피어 반려 빈도를 측정할 이벤트가 없으면 Week 2 GO/NO-GO 판단 근거가 빈다.
- **건별 알림만으론 시스템 이상을 못 잡는다** — 인증 1건 반려는 정상이지만, *10건 중 4건 반려*는 θ 자동검증이 멀쩡한 사진을 무더기 오판(false-reject 폭증)했거나 그룹이 서로 무더기 반려(브리깅·갈등)하는 신호다. 이건 **비율**을 봐야 잡힌다(`AC-owner-load-3` 괄호 의도 = "부정탐지 오작동·갈등 신호").
- **반려 당사자에게 결과 피드백이 없다** — 피드의 `peer_rejected` status·카운트는 수동적이라 작성자가 놓친다. 건별 통지로 "카운트에서 빠졌으니 다시 찍어보라"를 능동 전달하면 정정 기회를 준다(사용자 결정 2026-06-14).
- **union 변경은 PRD §9.1 1:1을 깬다** — 임의 이벤트 추가는 가드레일 위반이라 **spec + PO 승인이 선행 게이트**다([ADR-0038 §범위 경계](../../adr/0038-reaction-storage-model.md)가 본 알림·이벤트를 EVAL-0026으로 명시 위임).
- **익명성은 양보 불가** — 반려 *결과*는 이미 viewer에게 노출되지만([ADR-0038](../../adr/0038-reaction-storage-model.md) §2 카운트 노출), 알림이 voter 신원을 끼우면 `AC-peer-reject-1` 익명성이 깨진다. payload·문구에 voter 미포함을 가드레일로 못박는다.

## Impact Scope

### 변경 경로

- 신규:
  - `docs/superpowers/specs/2026-06-14-verify-ops-alert-analytics.md`(본 문서)
- 수정(구현 PR에서):
  - `apps/web/src/lib/analytics/track.ts` — `AnalyticsEvent` union에 `verify_auto_resolved`·`verify_peer_rejected` 추가 + `notification_sent.type` enum에 `verify_ops_alert`·`action_rejected` 추가
  - `apps/web/src/lib/analytics/schema.ts` — 위 union의 zod 미러 추가
  - `apps/web/src/lib/analytics/schema-union-parity.spec.ts` — 신규 이벤트 parity 케이스 확장
  - `docs/PRD.md` §9.1 이벤트 표 — 이벤트 3종(2 신규 + notification_sent type 확장) 추가(PO 승인 게이트)
  - 알림 발사 경로 — 자동검증 judge(`apps/web/src/lib/verify/judge.ts` 인근)·피어 반려 RPC(`toggle_peer_rejection`) 후처리에서 `track()` + 알림 트리거

### src/ 영향

- `apps/web/src/lib/analytics/**` — union·zod·parity 테스트(이벤트 계약의 SoT)
- 알림 발사 callsite — 자동검증 판정 직후·피어 과반 전이 직후. **본문(사진/일기/voter) 미로깅, 메타만**
- 집계 경보 트리거 — 챌린지 단위 비율 계산(read) + dedup 마커. `owner_nudge`의 `start_nudge_sent_at`(0040) 패턴 재사용

### Supabase / RLS / migration 영향

- **dedup 마커용 컬럼 1개 가능성**: 집계 경보의 "챌린지당 1회" 보장에 `challenges.verify_ops_alerted_at timestamptz` 같은 마커가 필요할 수 있다(0040 `start_nudge_sent_at` 동형). 건별 통지의 "로그당 1회"는 `action_logs`에 마커 컬럼 또는 `events` 조회로 갈음 — **구현 PR에서 ADR/migration으로 확정**(append-only 번호, forward-only).
- 신규 RLS·RPC 없음(기존 `notification_sent` 파이프라인·`is_group_member()` 재사용). 집계 비율 read는 admin hydrate 경계([ADR-0024](../../adr/0024-admin-cache-after-layer1-visibility.md)) 안.

### 외부 서비스

- Web Push(VAPID) / Expo push — 기존 알림 발송 채널 재사용. 신규 채널 없음.

## Design

검증 결과를 **두 계층**으로 기록한다 — (A) 분석용 AnalyticsEvent, (B) 사용자향 알림. 둘은 분리된 관심사다: 이벤트는 **검증 사실**을 항상 기록(분석), 알림은 **전달**을 기록(quiet hours 등으로 suppress 가능).

### C1. `verify_auto_resolved` — 자동검증 판정 이벤트

자동검증 judge가 status를 write할 때마다(**매 제출 1회**) 발사한다.

```ts
| {
    name: "verify_auto_resolved";
    props: {
      actionLogId: string;
      status: "passed" | "failed" | "manual_review";
      score: number;                 // θ 판정 점수(0~1)
      modelVersion: string;          // auto_verify_model_version
      signals: {                     // 결정론 신호(메타만 — 사진/EXIF 원본 미포함)
        phashDup: boolean;
        exifMismatch: boolean;
        screenshot: boolean;
      };
    };
  }
```

- **왜 `passed`도 발사**: G1 false-flag rate(정상 사진을 `failed`로 오판하는 비율)는 `passed`/`failed` 분포가 있어야 계산된다. `passed`를 빼면 분모가 사라진다. 볼륨은 `action_logged` 1:1(POC 규모 수용).
- **왜 signals 불린만**: phash/EXIF 원본은 사진 메타라 본문 로깅 금지. "어떤 신호가 켜졌나"만 분석에 필요.
- `peer_rejected`는 자동검증 산물이 아니므로 이 이벤트의 `status`에 **포함하지 않는다**(C2가 담당).

### C2. `verify_peer_rejected` — 피어 과반 반려 이벤트

`toggle_peer_rejection` RPC가 **`passed` → `peer_rejected` 전이**를 일으킬 때 발사한다.

```ts
| {
    name: "verify_peer_rejected";
    props: {
      actionLogId: string;
      rejectCount: number;        // 과반 도달 시점 반려 수
      participantCount: number;   // N = 서약 완료 참가자(ADR-0038 §3a)
    };
  }
```

- **익명성**: `voter_id`·"누가 반려했는지" 절대 미포함. `rejectCount`(집계)·`participantCount`만 — 이미 노출되는 카운트와 동일 정보량.
- **복원**(`peer_rejected` → `passed`, 토글 미달)은 **1차 범위 밖**(후속). 발사는 전이 IN(반려 성립)에 한정 — 토글 churn 이벤트 폭증 방지.

### C3. `verify_ops_alert` — 집계 운영 경보 (`AC-owner-load-3`)

한 챌린지의 **반려/실패 비율**이 임계를 넘으면 **그룹장에게 1회** 알림. `notification_sent.type` enum에 `verify_ops_alert` 추가.

- **범위**: 챌린지 단위
- **비율 정의**: `(failed + peer_rejected) / 판정된 인증 수`
  - 분자에 둘 다 포함 — `failed`=기계 오작동 신호, `peer_rejected`=그룹 갈등 신호. `AC-owner-load-3` 문구 "`failed`·반려율" 양쪽.
- **최소 표본**: 판정된 인증 **≥ 5건**일 때만 평가. 작은 N 노이즈 차단(2건 중 1건=50% 오발사 방지).
- **임계(잠정)**: 비율 **≥ 0.40**. **θ(자동검증 임계)와 별개 값**(Non-goal: "반려율 임계와 운영 알림 임계는 별개"). spec 잠정값 — dogfood 운영 데이터 후 PO 튜닝.
- **수신자**: **그룹장 1명**. "오작동·갈등"은 운영 신호라 owner-load 계열이고, 전원 발송은 갈등을 부채질할 위험이 있어 제외.
- **dedup**: 챌린지당 1회. `challenges.verify_ops_alerted_at`(또는 동형 마커)로 `owner_nudge`의 `start_nudge_sent_at`(0040) 패턴 그대로 — for-update lock으로 정확히 1회 보장.
- **발사 시점**: 비율을 변동시키는 판정 직후(자동검증 `failed`/`manual_review` 기록, 피어 `peer_rejected` 전이)에 재계산 → 임계 교차 && 미발사면 발사.

### C4. `action_rejected` — 건별 반려 통지 (작성자 본인)

한 인증이 **피어 과반으로 `peer_rejected` 전이**하면 **작성자 본인에게만** 친근한 정정 안내. `notification_sent.type` enum에 `action_rejected` 추가.

- **수신자**: 반려된 인증의 작성자(`action_logs.user_id`) 1명. **전원 발송 안 함** — 그룹 투명성은 피드(`peer_rejected` status·카운트)가 이미 담당, 전원 push는 망신만 가중(작은 친구 그룹일수록 민감).
- **문구(예)**: "이번 인증은 멤버들 판단으로 이번 주 카운트에서 빠졌어요. 다음엔 더 또렷한 사진으로 다시 도전해봐요 💪"
  - **익명**: "몇 명이/누가 반려" 미포함. "멤버들 판단"으로 추상화.
- **dedup**: 로그당 1회. 토글로 `passed`↔`peer_rejected`를 오가도 재발송 안 함.
- **범위 한정**: **피어 반려에만**. 자동검증 기계 `failed` 시 작성자 통지는 **범위 밖**(후속) — 사용자 요청이 "과반 투표" 한정이라 스코프 봉인(scope creep 방지).

### data flow 요약

```
[자동검증 judge]  status write ──> track(verify_auto_resolved)            (C1, 매 제출)
                                └─> 비율 재계산 ──> 임계 교차? ──> verify_ops_alert (C3, 그룹장)

[toggle_peer_rejection RPC]  passed→peer_rejected ──> track(verify_peer_rejected)  (C2)
                                                    ├─> action_rejected (C4, 작성자)
                                                    └─> 비율 재계산 ──> verify_ops_alert (C3, 그룹장)
```

## Alternatives Considered

1. **이벤트 1개 통합(`verification_resolved` + source/result enum)** — union 추가 최소(+1). 그러나 auto(score/modelVersion)와 peer(rejectCount/participantCount)의 props가 겹치지 않아 대부분 optional이 되고 source별 의미가 섞인다. **기각**: PRD §9.1 1:1·tight props 원칙 위반. (Split 채택)
2. **건별 통지 전원 발송** — 그룹 과반 결정을 명시 공표(투명성↑). **기각**: 결과는 피드가 이미 노출 → 중복이고, 좁은 친구 그룹에 망신 가중. 익명성 취지와 충돌.
3. **자동검증 `failed`도 작성자 통지** — 일관성(모든 카운트 제외를 알림). **기각(후속)**: 사용자 요청은 피어 과반 한정. 기계 오판 통지는 false-reject 비용·재촬영 UX와 함께 별도 설계.
4. **집계 경보 없이 건별 통지만** — 단순. **기각**: `AC-owner-load-3`(PRD AC)이 요구하는 시스템 이상 조기감지를 건별로는 못 잡음. PO가 "집계 유지 + 건별 추가" 확정(2026-06-14).

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test -- analytics      # union ↔ zod parity + 알림 임계 트리거
pnpm harness:check
```

### 시나리오

- **parity**: `verify_auto_resolved`·`verify_peer_rejected`·확장된 `notification_sent.type`가 `schema-union-parity.spec.ts` 통과(TS union ↔ zod 동형).
- **C1 정상**: judge가 `passed`/`failed`/`manual_review` write 시 각각 `verify_auto_resolved` 발사, `score`·`signals` 포함, 본문 부재.
- **C2 정상**: 피어 과반 도달 → `verify_peer_rejected` 1회, `rejectCount`/`participantCount` 정확, voter 신원 부재.
- **C3 임계**: 판정 5건 미만이면 미발사(노이즈 차단). 5건 중 2건 반려/실패(40%) → 그룹장 1회 발사, 추가 판정에도 재발사 안 함(dedup).
- **C4 건별**: `peer_rejected` 전이 → 작성자 본인만 수신, 문구에 voter/카운트 미포함, 토글 재전이 시 재발송 안 함.
- **본문 미로깅**: 모든 이벤트 payload·알림 문구에 사진 URL·일기 본문·voter_id 부재(grep 검증).

## Rollout

1. 본 spec 머지 + **PO 승인**(PRD §9.1 union 추가 승인) → EVAL-0026 `[spec:verify-analytics][po:verify-analytics]` 차단 해제.
2. 구현 PR(EVAL-0026, `feat/rn-verify-ops`): union·zod·parity → 알림 발사 callsite → dedup 마커(migration/ADR 필요 시) → PRD §9.1 표 갱신.
3. dogfood: 집계 임계(0.40·최소 5건)는 **잠정값** — Week 2 운영 데이터(반려율 분포)로 PO 재검토·튜닝. θ와 독립이라 코드 변경 없이 값 조정 가능하게 둔다.
4. 후속(범위 밖): 피어 반려 **복원** 이벤트, 자동검증 `failed` 작성자 통지, 집계 경보 그룹 전원 옵션.

### 롤백

- union·zod 추가는 append 성격 — 이벤트 발사 callsite를 제거하면 데이터 적재만 멈추고 기존 이벤트엔 영향 없음.
- 알림 발사는 feature flag 또는 callsite 제거로 비활성(이벤트 union은 남겨도 무해).
- dedup 마커 컬럼은 forward-only(POC 정책) — 추가 후 미사용이어도 데이터 무결성 영향 없음.

## 용어집

- **θ(세타)**: 자동검증 false-flag 임계 — 정상 사진을 부정으로 오판하는 비율의 상한 + 제출 단위 판정 임계([spec 2026-06-05-false-flag-threshold-theta](./2026-06-05-false-flag-threshold-theta.md)). 본 spec의 **운영 알림 임계와는 별개 값**.
- **peer_rejected**: 익명 피어 과반 반려로 `doneCount`에서 빠진 인증 status([ADR-0038](../../adr/0038-reaction-storage-model.md)).
- **false-flag rate**: 정상 인증을 자동검증이 `failed`로 오판하는 비율. G1 게이트 수용 기준(PRD §0·§7 Q1).
- **dedup 마커**: 알림 1회 발송 보장용 timestamp 컬럼(`owner_nudge`의 `start_nudge_sent_at`, 0040 패턴).
- **admin hydrate 경계**: Layer 1 visibility 통과 후 service-role read로 카운트 집계하는 캐시 경계([ADR-0024](../../adr/0024-admin-cache-after-layer1-visibility.md)).
