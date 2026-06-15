---
spec: 2026-06-15-verify-analytics-events
title: 자동검증·피어 반려 AnalyticsEvent + 운영 알림 이벤트 계약 (WP6)
author: pistachio8
date: 2026-06-15
status: draft
---

## Summary

사진 자동검증(P2)의 측정 가능성을 확보하기 위해 **신규 AnalyticsEvent 2종**(`auto_verify_result`·`peer_reject`)을 추가하고, 운영 알림(`AC-owner-load-3`)을 기존 `notification_sent` 이벤트의 **type enum 확장**(`verify_anomaly`)으로 표현하는 이벤트 계약을 확정한다.

이 spec은 **계약(이벤트 이름·props·emit 위치·parity·PRD 갱신)**만 못 박는다. 실제 union/zod/test 코드와 운영 알림 임계 로직은 후속 구현 WP(EVAL-0026)에서 따라온다. 본 spec은 EVAL-0026의 `[spec:verify-analytics]` 게이트 해소 산출물이며, `[po:verify-analytics]`(PO 승인)는 별도 게이트로 남는다.

> 약어: **AnalyticsEvent**(분석 이벤트 — PRD §9.1 표가 SoT) · **parity**(union ↔ zod 1:1 동치) · **emit**(이벤트 발사) · **θ**(theta — 자동검증 false-flag 임계) · **phash**(perceptual hash, 사진 유사도 해시). 나머지는 [용어집](#용어집).

## Why

- **자동검증은 G1(부정탐지 정밀도) 게이트가 걸려 있다** — false-flag rate(정상 사진 오판율)를 실측하려면 판정 결과가 이벤트로 남아야 한다. 현재 `lib/verify/judge.ts`는 status를 DB 컬럼에만 쓰고 **어떤 track() 이벤트도 emit하지 않는다**.
- **피어 반려는 그룹 갈등 신호다**(`AC-owner-load-3`) — 반려율·과반 도달을 분석하려면 토글 단위 이벤트가 필요하다.
- **가드레일상 임의 이벤트 추가 금지** — `AnalyticsEvent` union은 PRD §9.1 표와 1:1이어야 하고, 변경은 PO 승인 + spec 선행이 강제된다(`AGENTS.md §AnalyticsEvent`). 그래서 코드보다 이 계약 문서가 먼저다.
- **본문 미로깅 원칙** — 사진 URL·일기 본문·키워드 텍스트는 사용자 사생활이라 payload에서 배제해야 한다(`§AI 일기` 원칙의 분석 확장).

## Impact Scope

### 변경 경로

- 신규: `docs/superpowers/specs/2026-06-15-verify-analytics-events.md` (본 문서)
- 수정(후속 구현 WP에서): `apps/web/src/lib/analytics/track.ts` · `schema.ts` · `schema-union-parity.spec.ts` · `docs/PRD.md` §9.1 표 · `lib/verify/record.ts` · `apps/web/src/app/(app)/challenge/[id]/_actions.ts` · 운영 알림 경로

### src/ 영향

이벤트 emit 지점은 기존 파일에 한정한다(신규 폴더·네이밍 컨벤션 없음).

- `lib/verify/record.ts` — 자동검증 결과 기록 직후 `auto_verify_result` emit.
- `app/(app)/challenge/[id]/_actions.ts` — 피어 반려 토글 액션에서 `peer_reject` emit.
- 운영 알림 경로(owner_nudge 패턴 재사용) — 알림 발송 시 `notification_sent { type:"verify_anomaly" }` emit.

### Supabase / RLS / migration 영향

**없음.** 이벤트는 기존 `events` 테이블에 `track()`(service_role)로 적재한다. 자동검증 status enum·반려 reaction 저장은 선행 작업(EVAL-0020·0022·0025, migration 0045)에서 이미 완료됐고 본 spec은 스키마를 건드리지 않는다.

운영 알림 dedup 컬럼이 필요하면(아래 D3) 후속 구현 WP에서 migration 1건이 추가될 수 있으나, 그 결정은 구현 WP의 ADR/migration 영역으로 미룬다.

### 외부 서비스

**없음.** OpenAI·Web Push 계약 변경 없음. (운영 알림은 기존 Web Push 발송 경로를 재사용한다.)

## Design

### C1. `auto_verify_result` — 자동검증 판정 결과 (신규 이벤트)

판정기(`lib/verify/judge.ts`)가 status를 확정해 `lib/verify/record.ts`가 기록하는 직후, **모든 제출에서**(passed 포함) emit한다.

```ts
| { name: "auto_verify_result"; props: {
    actionLogId: string;   // uuid
    challengeId: string;   // uuid
    status: "passed" | "failed" | "manual_review";
    phashDup: boolean;     // 동일 user/group near-match 존재
    exifMissing: boolean;  // advisory 신호
    screenshot: boolean;   // advisory 신호
    score: number | null;  // auto_verify_score 원시값. 신호 계산 불가(손상 이미지)면 null → manual_review
    modelVersion: string;  // JUDGE_MODEL_VERSION
    enforced: boolean;     // VERIFY_ENFORCE. shadow 모드면 failed라도 doneCount 미제외
  } }
```

- **status에 `peer_rejected` 없음** — `peer_rejected`는 판정기 출력이 아니라 피어 다수결 결과다(`judge.ts`의 `AutoVerifyStatus` 정의와 일치). 반려 결과는 C2에서 다룬다.
- **모든 판정 emit인 이유**: false-flag rate는 `failed/전체`라 분모가 필요하고, "passed인데 EXIF 누락·screenshot이던 경계 신호" 분포는 passed에서만 관측된다. non-passed만 남기면 이 분모·경계 분포를 잃는다.
- **score 원시값인 이유**: G1 PoC 임계(θ) 튜닝은 분포 전체를 봐야 한다. band로 묶으면 구간 경계를 미리 정해야 하고 해상도가 깎인다. score는 phash 거리·신호 점수라 사생활 정보가 아니다.

### C2. `peer_reject` — 피어 반려 토글 (신규 이벤트, 익명)

반려 토글 액션(`challenge/[id]/_actions.ts`)에서 **토글 1회마다** emit한다. **반려자 식별자를 남기지 않는다** — `track()`에 `options.userId`를 넘기지 않아 `events.user_id = null`.

```ts
| { name: "peer_reject"; props: {
    actionLogId: string;     // uuid — 반려 대상 인증 로그
    challengeId: string;     // uuid
    rejectCount: number;     // 토글 반영 후 현재 반려 수
    eligibleVoters: number;  // 본인 제외 분모(과반 기준)
    reachedMajority: boolean;// 이번 토글이 과반을 넘겨 peer_rejected가 됐는지
    action: "add" | "remove";
  } }
```

- **익명인 이유**: EVAL-0025·migration §5.B가 반려 reaction을 "집계만, 식별자 비노출"로 정했다. 분석 이벤트도 같은 원칙을 따라 일관성을 지킨다. 그룹 갈등 신호는 `rejectCount/eligibleVoters` 비율·`reachedMajority`로 충분히 관측된다. (개인 단위 악용 탐지는 본 spec 범위 밖 — Out of scope.)
- **토글마다 emit인 이유**: `action: add/remove` + `reachedMajority`로 반려 누적·복원(과반 미달 시 토글로 복원)의 동학을 추적한다. 결과 1건만 남기면 복원·재반려 패턴을 잃는다.
- **`eligibleVoters`는 본인 제외 분모**다. 과반 기준이 "본인 제외 참가자 과반"이므로 `participantCount`(전체)와 의미가 달라 별도 이름을 쓴다.

### C3. `verify_anomaly` — 운영 알림 (기존 `notification_sent` enum 확장)

`failed`·피어 반려율이 임계 초과 시 그룹에 알림(`AC-owner-load-3`). 별도 이벤트를 만들지 않고 기존 `notification_sent`의 `type`에 값을 추가한다.

```ts
// notification_sent.props 변경분
type: ... | "verify_anomaly"          // enum 값 추가
anomalyReason?: "failed_rate" | "reject_rate"  // verify_anomaly만 채움(type-특화 optional)
// week?: number — goal_unreachable과 동일하게 주간 dedup 키로 재사용
```

- **별도 이벤트 대신 enum 확장인 이유**: 알림 발송 사실은 이미 `notification_sent`가 책임진다. 독립 이벤트를 만들면 발송 사실이 중복된다(union 표면 최소화).
- **`anomalyReason` optional 추가인 이유**: `failed_rate`(자동검증 오판 신호)와 `reject_rate`(그룹 갈등 신호)는 운영 대응이 다르므로 분석에서 구분돼야 한다. `actionLogId`·`week`처럼 type-특화 optional 패턴을 따른다.
- **알림 트리거의 정량값(rate·threshold·window)은 analytics에 남기지 않는다** — 이는 Option A(2 이벤트 + enum 확장)의 의도된 트레이드오프다. 정량 트리거가 분석에 필요해지면 별도 spec으로 승격한다.
- **owner_nudge 패턴 재사용**: 1회 발송 보장(dedup 컬럼 + `for update` lock)은 0040(ADR-0028)을 따른다. 운영 임계는 **θ와 별개**인 env 노브(예: `VERIFY_OPS_FAILED_RATE`·`VERIFY_OPS_REJECT_RATE`); 본 spec은 노브 존재만 명시하고 값은 PO/운영이 정한다.

### C4. parity & 문서 동기화 (계약 강제 메커니즘)

신규 이벤트는 **세 곳을 동시에** 갱신해야 통과한다 — 이 동시성이 1:1을 강제한다.

1. `track.ts` `AnalyticsEvent` union — TypeScript 타입.
2. `schema.ts` `analyticsEventSchema` discriminated union — zod 런타임 검증.
3. `schema-union-parity.spec.ts` fixtures — union의 모든 `name`에 대해 fixture를 요구(`Record<AnalyticsEvent["name"], …>`)하므로 union에 추가하면 fixture도 강제되고, fixture는 zod로 검증돼 parity가 깨지면 테스트가 실패한다.

추가로 **PRD §9.1 표**에 `auto_verify_result`·`peer_reject` 행을 추가하고 `notification_sent` type에 `verify_anomaly`를 명시한다(표 = SoT, 1:1).

### C5. 본문 미로깅 가드

모든 신규 payload는 **메타·id·bool·수치만** 포함한다. 사진 URL·phash 원본 문자열·일기 본문·선택 키워드 텍스트는 넣지 않는다(`score`는 수치라 허용, phash 문자열은 금지). 검증은 AC "payload 사진/일기 본문 부재 확인"으로 한다.

## Alternatives Considered

- **3 이벤트(운영 알림도 독립 `verify_ops_alert`)**: 알림 트리거의 rate·threshold·window를 남길 수 있으나 `notification_sent`와 발송 사실이 중복되고 union이 1개 더 커진다. 정량 트리거가 당장 필요하지 않아 채택하지 않음(필요 시 승격).
- **1 이벤트(`auto_verify_result`에 `peer_rejected` status 포함)**: union이 가장 작지만 반려의 토글·복원 동학을 잃어 갈등 분석이 불가. 채택하지 않음.
- **score를 band로 묶기**: 과적합 방지·단순하지만 G1 임계 튜닝 해상도를 잃고 구간 경계를 미리 정해야 함. 원시 수치 채택.
- **peer_reject에 반려자 attribution**: 개인 단위 악용 탐지가 가능하지만 민감 행위(친구 사진 '가짜' 표시) 식별자를 저장 — trust 모델·프라이버시 리스크. 익명 채택.

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test -- analytics
pnpm harness:check
```

`pnpm test -- analytics`는 union ↔ zod parity(`schema-union-parity.spec.ts`)와 알림 임계 트리거를 함께 검증한다(구현 WP 시점).

### 시나리오

- **정상(자동검증)**: 인증 제출 → 판정 passed → `auto_verify_result {status:"passed", score, enforced}` 1건. failed/manual_review도 동일 1건.
- **정상(반려)**: 반려 토글 add → `peer_reject {action:"add", reachedMajority:false}`; 과반 도달 토글 → `reachedMajority:true`; 복원(remove) → `action:"remove"`.
- **정상(운영 알림)**: 반려율 임계 초과 → 그룹 알림 1회 + `notification_sent {type:"verify_anomaly", anomalyReason:"reject_rate"}`; 같은 주 재초과 → `week` dedup으로 미발송.
- **엣지**: 손상 이미지 → status `manual_review`, `score:null`(여전히 카운트). shadow 모드(`enforced:false`)에서 failed → 이벤트는 남되 doneCount 미제외.
- **실패 경로**: payload에 사진/일기 본문 없음 확인. parity 누락(union만 추가, zod 누락) 시 테스트 실패로 차단.

## Rollout

1. 본 spec 머지 → `[spec:verify-analytics]` 게이트 해소.
2. PO 승인 → `[po:verify-analytics]` 게이트 해소. (PRD §9.1 표 갱신 = PO 검토 대상.)
3. 두 게이트 후 harness-engineer가 EVAL-0026 Status flip(blocked → todo).
4. 구현 WP: union/zod/test + emit 지점 + 운영 알림 임계 로직. dogfood에서 이벤트 적재·알림 1회 발송 실측.
5. G1 PoC: `auto_verify_result` 분포로 false-flag rate 측정 → θ 튜닝(코드 변경 없이 주입값 교체).

### 롤백

spec은 문서라 1 commit revert. 구현 WP는 별도 PR이므로 분리 롤백 가능 — 이벤트 추가는 append-only(기존 이벤트 미변경)라 롤백 시 신규 행만 중단된다.

## Out of scope

- 자동검증 판정 로직(EVAL-0022) · 피어 반려 저장·집계(EVAL-0025) — 본 spec은 그 결과를 **소비(emit)**만 한다.
- 운영 알림 임계값(θ-무관) 결정 — env 노브 존재만 명시, 값은 PO/운영.
- 개인 단위 반려 악용 탐지(attribution 필요) — 익명 채택으로 범위 밖.
- 알림 트리거 정량값(rate·threshold·window)의 analytics 적재 — Option A 트레이드오프, 필요 시 별도 spec.

## 용어집

- **advisory 신호**: status를 단독으로 내리지 않고 score에 기록만 하는 보조 신호(EXIF 누락·screenshot 등).
- **AnalyticsEvent**: 분석 이벤트. PRD §9.1 표가 SoT이며 `track.ts` union·`schema.ts` zod가 1:1 미러.
- **emit**: 이벤트를 발사(track() 호출)하는 행위.
- **enforce / shadow 모드**: `VERIFY_ENFORCE=true`면 failed가 doneCount 제외로 해석, false(shadow)면 status는 기록하되 카운트 영향 없음.
- **parity**: union(타입) ↔ zod(런타임) ↔ fixture가 1:1로 동치인 상태. `schema-union-parity.spec.ts`가 강제.
- **peer_rejected**: 본인 제외 참가자 과반이 반려해 주간 카운트에서 제외된 인증(판정기 출력 아님, 피어 다수결 결과).
- **phash**: perceptual hash. 사진 유사도(재탕 탐지) 해시.
- **θ (theta)**: 자동검증 false-flag 임계(G1). 운영 알림 임계와는 별개.
