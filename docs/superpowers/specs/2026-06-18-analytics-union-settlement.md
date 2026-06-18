---
spec: 2026-06-18-analytics-union-settlement
title: 정산·잔액 AnalyticsEvent union 계약 (EVAL-0009, spec:analytics-union)
author: pistachio8
date: 2026-06-18
status: accepted
---

## Summary

포인트 정산·잔액 경로(EVAL-0009)의 측정을 위해 **신규 AnalyticsEvent 2종**(`settlement_completed`·`points_balance_view`)을 추가하는 이벤트 계약을 확정한다. 정산은 "그룹장 수동 확정"과 "마감 후 72h cron auto-settle" 두 경로로 일어나지만 **결과는 동일한 `settlements` 스냅샷**이므로, 이를 별도 2종(`settlement_triggered`·`settlement_auto`)으로 쪼개지 않고 `trigger: "manual" | "auto"` discriminant를 가진 **단일 `settlement_completed`**로 표현한다. 이는 저장소의 기존 선례(`notification_sent.type`·`auto_verify_result.status` — 동일 결과·상이 원인을 단일 이벤트 + discriminant로 모음)와 정합한다.

이 spec은 **계약(이벤트 이름·props·emit 위치·once-only·parity·SoT)**만 못 박는다. 실제 union/zod/test 코드는 후속 구현(EVAL-0009 본체)에서 따라오며, 그 머지는 `[gate:G2]`(법무) + `[po:analytics-union]`(PO 승인)이 해소된 뒤다. 본 문서는 EVAL-0009의 `[spec:analytics-union]` 게이트 해소 산출물이다 — **자동 생성이 아니라 grill-me 검증을 거친 사람 초안**이며, 게이트 토큰 제거(task Blocked-by에서)와 PO 승인은 사람이 트리거한다.

> 약어: **AnalyticsEvent**(분석 이벤트 — `docs/PRD.md §9.1` 표가 SoT) · **discriminant**(union을 가르는 식별 필드, 여기선 `name`·`trigger`) · **parity**(TS union ↔ zod schema 1:1 동치) · **emit**(이벤트 발사) · **auto-settle**(그룹장이 안 눌러도 마감 후 자동 정산하는 fallback) · **closed-loop 포인트**(앱 안에서만 도는 현금화 불가 포인트). 나머지는 [용어집](#용어집).

## Why

- **정산은 P1의 핵심 전환점인데 현재 측정 신호가 0이다** — "정산이 몇 번, 수동 vs 자동 비율, 한 번에 얼마가 오가나"를 분석하려면 이벤트가 남아야 한다. `settlements` 스냅샷은 DB에만 쌓이고 `track()` 이벤트를 내지 않는다.
- **잔액 화면 사용도 신호가 없다**(`AC-deposit-gauge-3`) — closed-loop 포인트가 실제로 "다음 보증금"으로 재사용되는지 보려면 누가 잔액을 조회하는지부터 알아야 한다.
- **가드레일상 임의 이벤트 추가 금지** — `AnalyticsEvent` union은 `docs/PRD.md §9.1` 표와 1:1이어야 하고, 변경은 PO 승인 + spec 선행이 강제된다(`AGENTS.md §AnalyticsEvent`). 그래서 코드보다 이 계약 문서가 먼저다.
- **이름 비대칭이 오해를 부른다** — task가 잠정 명명한 `settlement_triggered`(행위 기준)와 `settlement_auto`(성질 기준)는 축이 달라, union을 읽는 사람이 "triggered는 auto가 아닌가?"로 헷갈린다. 단일 이벤트 + `trigger`로 정리하면 사라진다.
- **본문 미로깅 원칙의 분석 확장** — 사진 URL·일기 본문은 payload에서 배제한다. 금액은 **현금이 아니라 closed-loop 포인트**라 민감정보가 아니며, 앱은 이미 `challenge_created.penaltyAmount`로 금액을 기록 중이다(선례).

## Impact Scope

### 변경 경로

- 신규: `docs/superpowers/specs/2026-06-18-analytics-union-settlement.md` (본 문서)
- 수정(후속 구현 — `[po:analytics-union]` 승인 후): `apps/web/src/lib/analytics/track.ts` · `apps/web/src/lib/analytics/schema.ts` · analytics parity 테스트 · `docs/PRD.md §9.1` 표
- 수정(PO 승인 항목 — 본 spec은 **제안만**, 아래 [PO 승인 항목](#po-승인-항목) 참조): `evals/tasks/0009-points-use-balance-screen.md`(3종→2종·이름) · `evals/tasks/0006-settlement-rpc-balance.md`(`settlement_triggered` 참조) · `docs/migration/01-rn-mvp-prd.md §6.4`(후보 목록)

### src/ 영향

이벤트 emit 지점은 EVAL-0009 본체가 만드는 경로에 한정한다(신규 폴더·네이밍 컨벤션 없음).

- `settlement_completed` — 정산 RPC를 호출하는 **두 콜사이트**가 emit한다: 수동(그룹장 "정산 확정" Server Action) · 자동(72h auto-settle cron route handler). 단, RPC가 **실제로 새 `settlements` 행을 INSERT한 경우에만**(아래 C2).
- `points_balance_view` — 잔액·이력 화면(`apps/web/src/app/(app)/me`)의 서버 렌더에서 emit. `track()`은 server-side(`feed_view` 선례와 동형)이므로 RSC에서 그대로 호출한다.

### Supabase / RLS / migration 영향

**없음.** 이벤트는 기존 `events` 테이블에 `track()`(service_role)로 적재한다. 정산 RPC·원장(`point_ledger`)·스냅샷(`settlements`)은 선행 WP(EVAL-0005·0006·0008, migration)에서 정의되며 본 spec은 스키마를 건드리지 않는다.

> ⚠️ 단, C2(once-only emit)는 정산 RPC가 "freshly settled 여부"를 **반환값으로 노출**할 것을 요구한다. 이는 RPC 시그니처 계약이므로 EVAL-0006/0008 구현에 1줄짜리 의존을 만든다 — migration이 아니라 RPC 반환 형태 합의다.

### 외부 서비스

**없음.** OpenAI·Web Push 계약 변경 없음.

## Design

### C1. `settlement_completed` — 정산 완료 (신규 이벤트, 단일 + `trigger` discriminant)

정산 RPC가 한 챌린지의 `settlements` 스냅샷을 처음 기록(환급·미달분 귀속·이월 확정)한 시점에 emit한다.

```ts
| {
    name: "settlement_completed";
    props: {
      challengeId: string;            // uuid
      groupId: string;                // uuid
      trigger: "manual" | "auto";     // 그룹장 수동 확정 vs 72h cron auto-settle
      actorUserId?: string;           // uuid — trigger="manual"일 때만(확정한 그룹장). auto는 행위자 없음 → 생략
      participantCount: number;       // 정산 대상 인원
      achieverCount: number;          // 달성·환급 인원 (≤ participantCount)
      refundedAmount: number;         // 달성자에게 환급된 총 포인트(closed-loop)
      potAmount: number;              // 미달분으로 공동 주머니에 귀속된 총 포인트 = 다음 챌린지 이월액
      sinceCloseMs: number;           // 마감(closed_at ?? end_at) → 정산 경과 ms
    };
  }
```

- **단일 이벤트 + discriminant 근거**: manual/auto는 *개시 방법*일 뿐 결과(`settlements` 1행)는 동일하다. `notification_sent`(type 6종)·`auto_verify_result`(status 3종) 선례와 같은 모양 → union 행 1개, prop 1벌, 정산 funnel 분절 없음.
- **`actorUserId?`는 manual 전용**: `notification_sent.actorUserId?`와 동일한 optional-actor 패턴. auto(cron)는 행위자가 없으므로 생략한다. 타입상 "auto엔 actor 없음"은 런타임 규약으로 남기고(아래 시나리오에서 검증), discriminated literal로 강제하지는 않는다 — `notification_sent`의 기존 관례를 따른다.
- **금액은 closed-loop 포인트**(현금 아님): `refundedAmount + potAmount`가 이번 챌린지가 hold한 보증금 총액과 정합한다. `challenge_created.penaltyAmount` 선례대로 정수 포인트로 기록한다.
- **`sinceCloseMs`**: `challenge_activated.signToActiveMs` 류의 latency 신호. auto는 정의상 ~72h, manual은 가변이라 "그룹이 얼마나 빨리 정산하나"를 본다.
- **zod 제약(구현 시)**: 카운트·금액은 선례대로 `z.number().int().min(0)`(음수 불가). `achieverCount ≤ participantCount`는 비자명 상한 — zod refine 또는 주석으로 남긴다. `actorUserId`는 `uuid().optional()`.

### C2. once-only emit — 실제 정산됐을 때만 (이중정산 no-op은 미발사)

정산은 `settlements` PK(=challenge_id) + `ON CONFLICT DO NOTHING`으로 **결정론적 1회**가 보장된다(eng-story). 그룹장이 이미 auto-settle된 챌린지에 "정산 확정"을 눌러도 RPC는 no-op이다.

- **규칙**: `settlement_completed`는 RPC가 **새 행을 INSERT한 호출에서만** emit한다. no-op(이미 정산됨)이면 emit하지 않는다. **왜**: 안 그러면 정산 횟수가 부풀어 "한 챌린지 = 정산 1회"가 깨지고 수동/자동 비율도 왜곡된다.
- **계약 요구**: 정산 RPC(`settle_challenge` — 현재 `returns void`, `migrations/0044`)가 `settled: boolean`(또는 inserted row)을 돌려주어, 콜사이트가 `settled === true`일 때만 emit하도록 한다. 콜사이트(Server Action·cron)는 `trigger`·`actorUserId`를 알고, RPC 반환에 **금액·인원 + `closedAt`(또는 계산된 `sinceCloseMs`)**를 포함시켜 콜사이트가 `sinceCloseMs`를 산출한다 — 반환 형태는 EVAL-0006/0008과 합의(아래 PO 승인 항목 4).

### C3. `points_balance_view` — 잔액·이력 조회 (신규 이벤트)

잔액·이력 화면(`app/(app)/me`)이 서버 렌더될 때 emit한다.

```ts
| {
    name: "points_balance_view";
    props: {
      balance: number;          // 조회 시점 잔액 = Σ(point_ledger.delta), closed-loop 포인트
      ledgerEntryCount: number; // 이력 행 수 — 사용 깊이(거래가 쌓인 정도) 신호
    };
  }
```

- **`balance`는 잔액 스냅샷**: 화면이 어차피 잔액을 읽어 그리므로(`SUM(delta)`) emit에 추가 쿼리가 없다. "잔액이 큰 사람이 더 자주 보나" 같은 분석 가능.
- **본문 미로깅**: 개별 거래 사유·금액 명세는 넣지 않는다. 집계치(`balance`·`ledgerEntryCount`)만.

### C4. parity + SoT

- **parity 테스트**: 신규 2종을 `track.ts`의 `AnalyticsEvent` TS union과 `schema.ts`의 `analyticsEventSchema`(zod `discriminatedUnion("name", …)`) **양쪽에 추가**한다. 기존 analytics parity 테스트(`pnpm test -- analytics`)가 TS union ↔ zod 1:1을 강제하므로, 한쪽만 추가하면 RED. (구현 시점 검증 — 본 spec은 코드 미머지.)
- **SoT 방향(저장소 내 표현이 엇갈림 — 주의)**: `AnalyticsEvent` zod union(`analyticsEventSchema`)과 `docs/PRD.md §9.1` 표는 **1:1로 유지**해야 한다(`AGENTS.md §AnalyticsEvent`). 단 "무엇이 SoT인가"는 저장소 안에서 엇갈린다 — `AGENTS.md`는 "분석 SoT=PRD, 코드는 미러"라 하고, `docs/PRD.md:557`(§9.1 표 머리말)은 "SoT는 `analyticsEventSchema` 유니온"이라 한다. 운영상 결론은 같다: **둘을 한 PR에서 함께 갱신하고 parity 테스트가 union 쪽을 강제**한다. 따라서 구현 PR은 union/zod 추가 + `docs/PRD.md §9.1` 표 2행 추가를 같이 한다.
  > ⚠️ **기존 표 drift도 함께 reconcile**: 현재 §9.1 표는 코드 union과 이미 어긋나 있다 — `kudos_given`(표 `feedItemId` ↔ 코드 `actionLogId`, `track.ts:81`) · `account_copied`(코드 `track.ts:12`엔 있으나 표 누락) · `challenge_created.participantCount`(코드에 있으나 표 누락) 등. 표를 신뢰 가능한 미러로 두려면 신규 2행 추가 시 이 선재 drift도 같이 정정한다(아니면 새 행도 곧 drift). → [PO 승인 항목](#po-승인-항목) 3에 reconcile 포함.
  > 문서 정합 메모: EVAL-0009 Parent Links는 "01-rn-mvp-prd.md §9.1"을 가리키지만 그 PRD엔 §9.1 이벤트 *표*가 없다(이벤트는 §6.4). union-mirror 표는 `docs/PRD.md §9.1`이다. `docs/migration/01-rn-mvp-prd.md §6.4` 후보 목록(`settlement_triggered`·`settlement_auto`·`points_balance_view`)도 `settlement_completed`·`points_balance_view`로 정정한다. 이 참조 불일치도 구현 PR에서 함께 바로잡는다.

## Alternatives Considered

1. **별도 2종 유지 (`settlement_triggered` + `settlement_auto`)** — task AC 문구 그대로지만 **미채택**. 이름 축이 비대칭이고 prop이 사실상 중복되며 정산 funnel을 둘로 쪼갠다. 저장소 선례(discriminant)와도 어긋난다. (grill-me Q1 → A 합의)
2. **버튼 누를 때마다 emit(no-op 포함)** — 구현이 더 단순하지만 **미채택**. 정산 횟수가 부풀어 분석 신뢰도가 깨진다. (grill-me Q3 → "실제 정산 때만" 합의)
3. **금액 prop 생략(이벤트 발생만 기록)** — 더 보수적이지만 **미채택**. 금액은 정산 분석의 핵심이고 closed-loop 포인트라 민감하지 않으며 선례(`penaltyAmount`)가 있다. (grill-me Q2 → "금액 적기" 합의)
4. **SoT를 `01-rn-mvp-prd.md §6.4`로 이동** — **미채택**. union-mirror 표는 `docs/PRD.md §9.1`이고 verify-analytics spec이 같은 표를 SoT로 확정했다. 표를 옮기면 두 PRD가 경합한다.

## Verification

본 spec은 **문서 단독**이라 코드 검증이 없다. 아래는 (a) 지금 spec 머지용, (b) 구현 PR(PO 승인 후)용으로 나눈다.

### 명령

```bash
# (a) 본 spec 머지 — 지금
pnpm validate:docs          # 내부 링크 깨짐 확인
pnpm harness:check          # traceability. EVAL-0009는 토큰 잔존 시 여전히 blocked가 정상

# (b) 구현 PR — [po:analytics-union] 승인 후
pnpm typecheck && pnpm lint
pnpm test -- analytics      # TS union ↔ zod parity (신규 2종 1:1)
```

### 시나리오

- **정상 — 수동 정산**: 그룹장이 마감 후 "정산 확정" → RPC가 새 `settlements` INSERT → `settlement_completed { trigger:"manual", actorUserId:<그룹장>, refundedAmount, potAmount, … }` 1건.
- **정상 — 자동 정산**: 마감 후 72h cron → 새 INSERT → `settlement_completed { trigger:"auto" }`, `actorUserId` 없음.
- **엣지 — 이중정산 시도**: auto-settle 끝난 챌린지에 그룹장이 "정산 확정" → RPC no-op → **이벤트 미발사**(C2). 정산 카운트 불변.
- **엣지 — 전원 달성**: `potAmount=0`·`achieverCount==participantCount` 이벤트 1건. (이월액 0도 정상 기록.)
- **엣지 — auto + actorUserId**: `trigger:"auto"`인데 `actorUserId`가 채워지면 **버그**(타입 optional이라 컴파일로 못 막음 — 콜사이트 규약). cron emit 경로 리뷰에서 잡는다.
- **엣지 — 잔액 화면 cache hit**: `app/(app)/me`에 `"use cache"`가 붙으면 재렌더 없이 캐시 서빙되어 `track()`이 스킵될 수 있다. 구현 PR에서 cache miss/hit 양쪽 emit 보장을 확인한다.
- **정상 — 잔액 조회**: `app/(app)/me` 진입 → `points_balance_view { balance, ledgerEntryCount }` 1건.
- **parity(구현 시)**: 신규 2종을 union에만 추가하고 zod 누락 → `pnpm test -- analytics` RED로 잡힘.

## Rollout

1. (지금) 본 spec draft 머지 → grill-me 검증 완료 표기. **EVAL-0009 Blocked-by의 `[spec:analytics-union]` 토큰 제거는 사람이 수동으로** 한다(게이트 값은 사람용 핸들, 기계 미검증).
2. PO가 [PO 승인 항목](#po-승인-항목)을 검토·승인 → `[po:analytics-union]` 제거.
3. `[gate:G2]`(법무) 해소 후 EVAL-0009 구현 PR: `track.ts`·`schema.ts`·parity 테스트·`docs/PRD.md §9.1`·emit 콜사이트 + task/PRD 정정.
4. dogfood에서 `settlement_completed`·`points_balance_view` 실발생 확인 후 분석 대시보드 합류.

### 롤백

본 spec은 코드 무변경이므로 **단일 commit revert**로 되돌린다. 구현 PR 롤백은 그 PR에서 별도로 다룬다(union 행 제거 = parity 테스트가 동반 보호).

## Out of scope

- `track.ts`·`schema.ts`·parity 테스트 **코드 머지** — `[po:analytics-union]` 승인 후 EVAL-0009 본체.
- 정산 RPC·원장·auto-settle cron 자체 — EVAL-0006·0008(본 spec은 emit 계약과 RPC 반환값 요구만).
- `[gate:G2]`(법무) 및 사용자향 잔액·정산 화면 활성 노출.
- 구독 할인·현금화 — POC 범위 밖(closed-loop 유지).
- EVAL-0009 task / PRD 본문의 **실제 편집** — 아래 PO 승인 항목으로 제안만 하고, 승인 후 구현 PR에서 반영.

## PO 승인 항목

`[po:analytics-union]` 승인 시 함께 확정할 것 — 본 spec은 **제안만** 하고 직접 수정하지 않는다(자동 생성 금지·사람 트리거 원칙).

1. **이벤트 합치기(3종→2종)**: `settlement_triggered`·`settlement_auto` → `settlement_completed { trigger }`. + `points_balance_view`. 총 2종.
2. **금액 prop 포함**: `refundedAmount`·`potAmount`·`participantCount`·`achieverCount`·`sinceCloseMs`(정산), `balance`·`ledgerEntryCount`(잔액). closed-loop 포인트 기준 민감정보 아님 확인.
3. **문서 갱신 대상**: `docs/PRD.md §9.1` 표(신규 2행 추가 **+ 기존 drift reconcile**: `kudos_given.feedItemId→actionLogId` · `account_copied` 누락 행 · `challenge_created.participantCount` 누락 등) · `01-rn-mvp-prd.md §6.4` 후보 목록 정정 · `evals/tasks/0009`(AC·Goal·Target Files·**Verification line·Output 요약**까지 "3종"·이름이 `:24·:40·:49·:65·:80`에 흩어짐 — 누락 주의) · `evals/tasks/0006:57`의 `settlement_triggered` 참조.
4. **RPC 반환 계약**: 정산 RPC가 `settled` 여부를 노출(once-only emit 전제) — EVAL-0006/0008과 합의.

## 용어집

- **auto-settle**: 그룹장이 정산을 누르지 않아도 마감 후 72h cron이 사전 규칙대로 자동 정산하는 fallback.
- **closed-loop 포인트**: 앱 안에서만 도는 현금화 불가 포인트. 규제(전자금융·에스크로) 우회용이라 금액 로깅이 민감정보가 아니다.
- **discriminant**: union을 가르는 식별 필드. 여기선 이벤트 `name`과 `settlement_completed.trigger`.
- **emit**: 분석 이벤트를 `track()`으로 발사하는 것.
- **parity**: `track.ts`의 TS `AnalyticsEvent` union과 `schema.ts`의 zod `analyticsEventSchema`가 1:1로 동치인 상태. 테스트로 강제.
- **point_ledger**: 포인트 이동을 append-only로 쌓는 원장. 잔액 = Σ delta.
- **settlements 스냅샷**: 챌린지당 1행(PK=challenge_id)의 불변 정산 결과. `ON CONFLICT DO NOTHING`으로 이중정산 차단.
- **SoT(Source of Truth)**: 중복 정의 없이 기준으로 삼는 단일 원본. AnalyticsEvent union의 SoT는 `docs/PRD.md §9.1` 표.
