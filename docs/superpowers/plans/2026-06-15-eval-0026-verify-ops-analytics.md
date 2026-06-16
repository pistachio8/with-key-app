# EVAL-0026 구현 Plan — 자동검증·피어반려 AnalyticsEvent + 운영 이상 알림

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사진 자동검증(P2) 측정 가능성을 위해 신규 AnalyticsEvent 2종(`auto_verify_result`·`peer_reject`)을 추가하고, 운영 이상 알림(`AC-owner-load-3`)을 기존 `notification_sent` 의 `verify_anomaly` enum 확장으로 발송한다.

**Architecture:** spec(`docs/superpowers/specs/2026-06-15-verify-analytics-events.md`)의 C1~C5 계약을 그대로 구현한다. 이벤트 계약(union ↔ zod ↔ parity fixture)을 먼저 못 박고, emit producer 2곳(`judge.ts`·`togglePeerRejection`)을 연결한 뒤, 운영 알림은 기존 `deadline-push` cron + `dispatchGoalUnreachableNotification` 패턴(events 테이블 dedup, **migration 없음**)을 복제한다.

**Tech Stack:** TypeScript · zod discriminated union · Vitest · Next.js 16 Server Action · Supabase service_role(`track()`) · Web Push.

---

## 🚦 게이트 (구현 착수 전 필수)

`evals/tasks/0026-verify-ops-alert-analytics.md` 의 `Status: blocked`. 두 게이트가 풀려야 코드 착수 가능하다.

- `[spec:verify-analytics]` — spec 머지(`status: draft → accepted`). **이벤트 union 변경은 spec 선행이 가드레일**(`AGENTS.md §AnalyticsEvent`).
- `[po:verify-analytics]` — PO 승인. PRD §9.1 표 갱신이 PO 검토 대상이고, **아래 §열린 결정**(알림 수신자·임계 기본값)도 이 게이트에서 확정된다.

> 게이트 전이라도 이 plan 작성과 union/zod/parity 테스트 **초안**은 가능하다(spec Rollout 4 / task Stop Condition). union 추가·emit **활성화**는 게이트 해소 후.

이 plan은 EVAL-0026을 **두 WP**로 쪼갠다. 둘은 같은 analytics union 표면을 공유하지만 **별도 PR로 분리 롤백 가능**(spec Rollout §롤백).

- **WP1 — 이벤트 계약 + producer** (C1·C2·C4 신규 이벤트·C5). 위험 낮음, 측정 가치 대부분(G1 false-flag·갈등 분석). Task 1~3.
- **WP2 — 운영 이상 알림** (C3 enum 확장 + 임계 로직 + dedup). `AC-owner-load-3`. Task 4~7.

---

## 열린 결정 (PO 게이트에서 확정 — 아래는 plan 기본값)

| #   | 결정                    | plan 기본값(권장)                                                                                                       | 대안                 |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------- |
| D1  | `verify_anomaly` 수신자 | **그룹 오너 1명**(AC-owner-load-3 = 오너 정찰 부담 경감, `dispatchOwnerStartNudge`/`goal_unreachable` 단일 수신자 패턴) | 전 참가자            |
| D2  | 옵트인 prefs 키         | **`deadline`** 재사용(운영 리마인더 계열, `goal_unreachable` 과 동일)                                                   | `start`              |
| D3  | 임계 기본값             | `VERIFY_OPS_FAILED_RATE=0.3`·`VERIFY_OPS_REJECT_RATE=0.3`·`VERIFY_OPS_MIN_SAMPLE=3` (provisional, 노이즈 방지 최소표본) | PO/운영이 env로 교체 |

기본값은 코드에 두되 env override 가능. D1·D2 가 PO에서 뒤집히면 영향 파일은 `dispatch.ts` 1곳(WP2 Task 6)뿐이다.

---

## 파일 구조

| 파일                                                     | 책임                                                                           | WP  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ | --- |
| `apps/web/src/lib/analytics/track.ts`                    | `AnalyticsEvent` union — 2종 추가 + `notification_sent.type` 확장              | 1·2 |
| `apps/web/src/lib/analytics/schema.ts`                   | zod discriminated union — 동일 변경                                            | 1·2 |
| `apps/web/src/lib/analytics/schema-union-parity.spec.ts` | parity fixture + verify_anomaly variant 테스트                                 | 1·2 |
| `docs/PRD.md` §9.1                                       | 이벤트 표 — 2행 추가 + `notification_sent` type 목록 확장                      | 1·2 |
| `apps/web/src/lib/verify/judge.ts`                       | `judgeAndRecordVerifyStatus` 에 `challengeId` 추가 + `auto_verify_result` emit | 1   |
| `apps/web/src/lib/verify/judge.spec.ts`                  | emit 단위 테스트 + 시그니처 갱신                                               | 1   |
| `apps/web/src/lib/action-log/submit-core.ts`             | judge 콜사이트 `challengeId` 주입                                              | 1   |
| `apps/web/src/lib/action-log/submit-core.spec.ts`        | mock 시그니처 갱신                                                             | 1   |
| `apps/web/src/app/(app)/challenge/[id]/_actions.ts`      | `togglePeerRejection` 익명 `peer_reject` emit                                  | 1   |
| `apps/web/src/app/(app)/challenge/[id]/_actions.spec.ts` | emit 단위 테스트 (기존 파일, 3.7KB — describe 추가)                            | 1   |
| `apps/web/src/lib/verify/config.ts`                      | `loadVerifyOpsConfig` (θ와 별개 운영 노브)                                     | 2   |
| `apps/web/src/lib/verify/config.spec.ts`                 | ops config 테스트                                                              | 2   |
| `apps/web/src/lib/verify/index.ts`                       | `loadVerifyOpsConfig`·`VerifyOpsConfig` re-export                              | 2   |
| `apps/web/src/lib/push/dispatch.ts`                      | `dispatchVerifyAnomalyNotification`                                            | 2   |
| `apps/web/src/lib/push/dispatch.spec.ts`                 | dedup·shadow·옵트인 테스트                                                     | 2   |
| `apps/web/src/app/api/cron/deadline-push/route.ts`       | running 루프에 rate 산정 + 알림 트리거                                         | 2   |
| `apps/web/src/app/api/cron/deadline-push/route.spec.ts`  | 임계 초과 → dispatch 호출 테스트                                               | 2   |
| `apps/web/.env.example`                                  | `VERIFY_OPS_*` 주석                                                            | 2   |

**Supabase/RLS/migration: 없음.** dedup은 `events` 테이블 조회(goal_unreachable 패턴) — 신규 컬럼 불필요.

---

# WP1 — 이벤트 계약 + producer

## Task 1: `auto_verify_result` 이벤트 + judge.ts emit (C1)

**Files:**

- Modify: `apps/web/src/lib/analytics/track.ts`
- Modify: `apps/web/src/lib/analytics/schema.ts`
- Modify: `apps/web/src/lib/analytics/schema-union-parity.spec.ts`
- Modify: `apps/web/src/lib/verify/judge.ts`
- Test: `apps/web/src/lib/verify/judge.spec.ts`
- Modify: `apps/web/src/lib/action-log/submit-core.ts`
- Modify: `apps/web/src/lib/action-log/submit-core.spec.ts`

- [ ] **Step 1: union 멤버 추가 (track.ts)**

`notification_opened` 멤버 뒤, `penalty_displayed` 앞에 추가:

```ts
// apps/web/src/lib/analytics/track.ts
  | {
      name: "auto_verify_result";
      props: {
        actionLogId: string; // uuid
        challengeId: string; // uuid — 콜사이트 주입
        status: "passed" | "failed" | "manual_review"; // 판정기 출력(peer_rejected 없음)
        phashDup: boolean; // 동일 user/group near-match 존재 (decision.reason 파생)
        exifMissing: boolean; // advisory
        screenshot: boolean; // advisory
        score: number | null; // advisorySignalScore(signals). signals=null(손상)→null
        modelVersion: string; // JUDGE_MODEL_VERSION
        enforced: boolean; // config.enforce. shadow면 failed라도 doneCount 미제외
      };
    }
```

- [ ] **Step 2: zod 멤버 추가 (schema.ts)**

`notification_opened` 스키마 뒤에 추가:

```ts
// apps/web/src/lib/analytics/schema.ts
  z.object({
    name: z.literal("auto_verify_result"),
    props: z.object({
      actionLogId: uuid,
      challengeId: uuid,
      status: z.enum(["passed", "failed", "manual_review"]),
      phashDup: z.boolean(),
      exifMissing: z.boolean(),
      screenshot: z.boolean(),
      // advisorySignalScore — 현재 0~2(advisory 신호 2개: exifMissing·screenshot). max 미고정은
      // 의도(spec C1 — θ 튜닝 해상도 보존). 신호 추가 시 이 주석으로 범위 추적.
      score: z.number().int().min(0).nullable(),
      modelVersion: z.string(),
      enforced: z.boolean(),
    }),
  }),
```

- [ ] **Step 3: parity fixture 추가 (schema-union-parity.spec.ts)**

`fixtures` 객체에 한 항목 추가(누락 시 `Record<AnalyticsEvent["name"], …>` 타입 에러):

```ts
// apps/web/src/lib/analytics/schema-union-parity.spec.ts (fixtures 내부)
  auto_verify_result: {
    name: "auto_verify_result",
    props: {
      actionLogId: "11111111-1111-4111-8111-111111111111",
      challengeId: "22222222-2222-4222-8222-222222222222",
      status: "passed",
      phashDup: false,
      exifMissing: false,
      screenshot: false,
      score: 0,
      modelVersion: "verify-judge-theta-v1",
      enforced: false,
    },
  },
```

- [ ] **Step 4: parity 테스트 실행 → 통과 확인**

Run: `pnpm --filter web test -- schema-union-parity`
Expected: PASS (`Zod schema accepts auto_verify_result` 포함). zod/union/fixture 누락 시 FAIL.

- [ ] **Step 5: judge emit 실패 테스트 작성 (judge.spec.ts)**

`judgeAndRecordVerifyStatus` describe 안에 추가. `track` 모듈을 mock 하고 emit props를 검증한다. 파일 상단 mock 블록에 추가:

```ts
// apps/web/src/lib/verify/judge.spec.ts (상단 vi.mock 영역)
const trackMock = vi.fn();
vi.mock("@/lib/analytics/track", () => ({ track: (...a: unknown[]) => trackMock(...a) }));
```

테스트(기존 service_role write describe 안):

```ts
it("판정 후 auto_verify_result 를 emit 한다 (challengeId·enforced 포함)", async () => {
  trackMock.mockClear();
  await judgeAndRecordVerifyStatus({
    actionLogId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    challengeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    groupId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    signals: null, // 손상 이미지 → manual_review, score:null
    config: { phashFailMax: 6, phashReviewMax: 10, enforce: false },
  });
  expect(trackMock).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "auto_verify_result",
      props: expect.objectContaining({
        challengeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        status: "manual_review",
        score: null,
        enforced: false,
      }),
    }),
  );
});
```

> 기존 `judge.spec.ts` 의 `judgeAndRecordVerifyStatus` 호출 4곳(line ~201·222·235·253)에 `challengeId` 인자를 추가해야 컴파일된다 — Step 7 에서 시그니처 변경 후 일괄 갱신.

- [ ] **Step 6: 테스트 실행 → 실패 확인**

Run: `pnpm --filter web test -- judge`
Expected: FAIL (`challengeId` 인자 타입 에러 또는 emit 미발생).

- [ ] **Step 7: judge.ts 구현 — 시그니처 + emit**

`signals.ts` 에서 `advisorySignalScore` 를 value import 하고 `track` 을 import. 시그니처에 `challengeId` 추가, UPDATE 직후·return 전에 emit:

```ts
// apps/web/src/lib/verify/judge.ts
import { advisorySignalScore, type VerifySignals } from "./signals"; // type-only → value+type
import { track } from "@/lib/analytics/track"; // 신규 import

// 시그니처: actionLogId 뒤에 challengeId 추가
export async function judgeAndRecordVerifyStatus(args: {
  actionLogId: string;
  challengeId: string; // 신규 — emit 용
  userId: string;
  groupId: string;
  signals: VerifySignals | null;
  config?: VerifyConfig;
}): Promise<JudgeDecision> {
```

`if (error) throw error;` 뒤, `if (decision.status !== "passed")` 경고 블록 다음, `return decision;` 직전에 삽입:

```ts
// C1 — 모든 제출(passed 포함) emit. false-flag rate 는 분모(전체)가 필요하다.
// phashDup = "동일 user/group near-match 존재"(spec C1). decision.reason 파생.
// global_near_match(cross-user 전역)·signal_error·clean 은 제외 — 전역은 생판 남 충돌이라
// dup 으로 세면 안 된다(judgeVerifyStatus 매핑 3). 본문(사진) 미로깅 — 메타만.
const phashDup =
  decision.reason === "same_user_reuse" ||
  decision.reason === "same_group_reuse" ||
  decision.reason === "near_duplicate";
void track({
  name: "auto_verify_result",
  props: {
    actionLogId: args.actionLogId,
    challengeId: args.challengeId,
    status: decision.status,
    phashDup,
    exifMissing: args.signals ? !args.signals.exifPresent : false,
    screenshot: args.signals ? args.signals.screenshot.suspected : false,
    score: args.signals ? advisorySignalScore(args.signals) : null,
    modelVersion: JUDGE_MODEL_VERSION,
    enforced: config.enforce,
  },
});
```

기존 `judge.spec.ts` 호출 4곳에 `challengeId: "...-cccc-..."` 인자 추가.

- [ ] **Step 8: 콜사이트 + mock 갱신 (submit-core)**

`submit-core.ts` line ~234 콜에 `challengeId` 주입:

```ts
// apps/web/src/lib/action-log/submit-core.ts
await judgeAndRecordVerifyStatus({
  actionLogId: data.id,
  challengeId: parsed.input.challengeId, // 신규
  userId: user.id,
  groupId: ch.group_id,
  signals,
});
```

`submit-core.spec.ts` 의 mock(`judgeAndRecordVerifyStatus: vi.fn()...`)은 인자 무관이라 수정 불필요하나, 호출 인자를 단언하는 테스트가 있으면 `challengeId` 포함하도록 갱신.

- [ ] **Step 9: 테스트 실행 → 통과 확인**

Run: `pnpm --filter web test -- judge submit-core schema-union-parity`
Expected: PASS 전부.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib/analytics apps/web/src/lib/verify/judge.ts apps/web/src/lib/verify/judge.spec.ts apps/web/src/lib/action-log/submit-core.ts apps/web/src/lib/action-log/submit-core.spec.ts
git commit -m "feat(analytics): auto_verify_result 이벤트 + judge emit (EVAL-0026 C1)"
```

---

## Task 2: `peer_reject` 이벤트 + togglePeerRejection emit (C2, 익명)

**Files:**

- Modify: `apps/web/src/lib/analytics/track.ts`
- Modify: `apps/web/src/lib/analytics/schema.ts`
- Modify: `apps/web/src/lib/analytics/schema-union-parity.spec.ts`
- Modify: `apps/web/src/app/(app)/challenge/[id]/_actions.ts`
- Modify: `apps/web/src/app/(app)/challenge/[id]/_actions.spec.ts` (기존 파일에 describe 추가)

- [ ] **Step 1: union 멤버 추가 (track.ts)**

`auto_verify_result` 멤버 뒤에 추가:

```ts
// apps/web/src/lib/analytics/track.ts
  | {
      name: "peer_reject";
      props: {
        actionLogId: string; // uuid — 반려 대상
        challengeId: string; // uuid
        rejectCount: number; // RPC peer_reject_count (총 반려 수)
        status: "passed" | "peer_rejected" | "failed" | "manual_review" | "pending"; // RPC status raw
        action: "add" | "remove"; // viewer_rejected 파생
      };
    }
```

- [ ] **Step 2: zod 멤버 추가 (schema.ts)**

`auto_verify_result` 스키마 뒤에 추가:

```ts
// apps/web/src/lib/analytics/schema.ts
  z.object({
    name: z.literal("peer_reject"),
    props: z.object({
      actionLogId: uuid,
      challengeId: uuid,
      rejectCount: z.number().int().min(0),
      status: z.enum(["passed", "peer_rejected", "failed", "manual_review", "pending"]),
      action: z.enum(["add", "remove"]),
    }),
  }),
```

> status enum 은 domain `peerRejectionToggleResultSchema`(`validators/peer-rejection.ts:13`)와 동일 5값 — 의도된 미러.

- [ ] **Step 3: parity fixture 추가**

```ts
// apps/web/src/lib/analytics/schema-union-parity.spec.ts (fixtures 내부)
  peer_reject: {
    name: "peer_reject",
    props: {
      actionLogId: "11111111-1111-4111-8111-111111111111",
      challengeId: "22222222-2222-4222-8222-222222222222",
      rejectCount: 1,
      status: "passed",
      action: "add",
    },
  },
```

- [ ] **Step 4: parity 테스트 실행 → 통과**

Run: `pnpm --filter web test -- schema-union-parity`
Expected: PASS (`Zod schema accepts peer_reject` 포함).

- [ ] **Step 5: emit 실패 테스트 작성 (\_actions.spec.ts)**

`togglePeerRejection` 이 RPC row 를 받은 뒤 **익명**(`options.userId` 없이) `peer_reject` 를 emit하는지 검증. `track`·`@/lib/supabase/server`·`@/lib/auth/with-user` mock. 핵심 단언:

```ts
// emit 인자: name=peer_reject, props.action='add'(viewer_rejected=true), challengeId 포함
expect(trackMock).toHaveBeenCalledWith(
  expect.objectContaining({
    name: "peer_reject",
    props: expect.objectContaining({
      action: "add",
      status: "passed",
      challengeId: expect.any(String),
    }),
  }),
); // 두 번째 인자(options) 없음 → 익명
expect(trackMock.mock.calls[0][1]).toBeUndefined();
```

- [ ] **Step 6: 테스트 실행 → 실패 확인**

Run: `pnpm --filter web test -- _actions`
Expected: FAIL (emit 미발생).

- [ ] **Step 7: 구현 — author lookup 확장 + 익명 emit**

⚠️ **외과적 변경은 2곳뿐**(`_actions.ts:155-170` 의 기존 author lookup·revalidate·safeParse 블록은 **이미 존재** — 재작성·이동·복붙 금지):

1. author lookup select `"user_id"` → `"user_id, challenge_id"` (1줄)
2. 기존 `if (!parsedResult.success) return ...` 다음·`return success(...)` 전에 emit 블록 **삽입만**

아래는 변경 후 최종 형태(맥락 표시용 — safeParse 블록을 새로 추가하지 말 것):

```ts
// apps/web/src/app/(app)/challenge/[id]/_actions.ts (togglePeerRejection 내부)
const { data: log, error: logErr } = await supabase
  .from("action_logs")
  .select("user_id, challenge_id") // challenge_id 추가
  .eq("id", actionLogId)
  .maybeSingle();
if (logErr) console.error("[togglePeerRejection] author lookup failed", logErr);
if (log?.user_id) revalidateTag(`user-${log.user_id}-home-feed`, "max");

const parsedResult = peerRejectionToggleResultSchema.safeParse({
  peerRejectCount: row.peer_reject_count,
  viewerRejected: row.viewer_rejected,
  status: row.status,
});
if (!parsedResult.success) return failure("upstream_error");

// C2 — 익명 peer_reject emit. options.userId 미전달 → events.user_id=null.
// RPC 반환만으로 완성(추가 read 없음). 본문 미로깅 — id·count·status 만.
if (log?.challenge_id) {
  void track({
    name: "peer_reject",
    props: {
      actionLogId,
      challengeId: log.challenge_id as string,
      rejectCount: parsedResult.data.peerRejectCount,
      status: parsedResult.data.status,
      action: parsedResult.data.viewerRejected ? "add" : "remove",
    },
  });
}
return success(parsedResult.data);
```

- [ ] **Step 8: 테스트 실행 → 통과**

Run: `pnpm --filter web test -- _actions schema-union-parity`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/analytics "apps/web/src/app/(app)/challenge/[id]"
git commit -m "feat(analytics): 익명 peer_reject 이벤트 + toggle emit (EVAL-0026 C2)"
```

---

## Task 3: PRD §9.1 표 동기화 (C4)

**Files:**

- Modify: `docs/PRD.md` (§9.1 이벤트 표, line ~558~576)

- [ ] **Step 1: 이벤트 표에 2행 추가**

`| 이벤트 | 발생 시점 | 주요 속성 |` 표에 추가(기존 행 포맷 일치):

```markdown
| `auto_verify_result` | 사진 자동검증 판정(모든 제출) | actionLogId, challengeId, status, phashDup, exifMissing, screenshot, score, enforced |
| `peer_reject` | 피어 반려 토글(익명, user_id=null) | actionLogId, challengeId, rejectCount, status, action |
```

- [ ] **Step 2: `notification_sent` type 목록 확장 (WP2 와 공유 — 여기서 함께 명시)**

line ~576 `notification_sent` 행의 type 목록에 `verify_anomaly` 추가:

```markdown
| `notification_sent` | 알림 발송 | type (start / deadline / friend_action / kudos_received / goal_unreachable / verify_anomaly), week (goal_unreachable·verify_anomaly), anomalyReason (verify_anomaly) |
```

- [ ] **Step 3: SoT 계층 주석 확인**

§9.1 의 "SoT는 analyticsEventSchema 유니온"(line ~556) 문구를 건드리지 않는다 — 표는 **존재 단위 요약 미러**지 필드 SoT 아님(spec C4). props 전체가 아니라 주요 속성만 싣는다.

- [ ] **Step 4: 문서 링크 검증**

Run: `pnpm validate:docs`
Expected: PASS (내부 링크 무손상).

- [ ] **Step 5: Commit**

```bash
git add docs/PRD.md
git commit -m "docs(prd): §9.1 auto_verify_result·peer_reject·verify_anomaly 행 추가 (EVAL-0026 C4)"
```

---

# WP2 — 운영 이상 알림 (C3)

> 별도 PR 권장. WP1 머지 후 진행. `notification_sent` enum 확장(Task 4)은 WP1 Task 3 Step 2 의 PRD 행과 짝을 이룬다.

## Task 4: `notification_sent` verify_anomaly enum 확장 (C3 계약)

**Files:**

- Modify: `apps/web/src/lib/analytics/track.ts`
- Modify: `apps/web/src/lib/analytics/schema.ts`
- Modify: `apps/web/src/lib/analytics/schema-union-parity.spec.ts`

- [ ] **Step 1: union `notification_sent` 멤버 수정 (track.ts)**

기존 멤버의 `type` enum 과 optional props 확장:

```ts
// apps/web/src/lib/analytics/track.ts — notification_sent props 변경분
        type:
          | "start" | "deadline" | "friend_action" | "kudos_received"
          | "goal_unreachable" | "verify_anomaly"; // 추가
        challengeId: string;
        suppressed: boolean;
        outcome: "sent" | "cleaned" | "failed" | "suppressed";
        actionLogId?: string;
        actorUserId?: string;
        // goal_unreachable·verify_anomaly 가 채움 — dedup 키(주차). 1-based.
        week?: number;
        // verify_anomaly 만 채움 — failed_rate(자동검증) vs reject_rate(그룹 갈등).
        anomalyReason?: "failed_rate" | "reject_rate"; // 추가
```

- [ ] **Step 2: zod `notification_sent` 수정 (schema.ts)**

```ts
// apps/web/src/lib/analytics/schema.ts — notification_sent props
      type: z.enum([
        "start", "deadline", "friend_action", "kudos_received",
        "goal_unreachable", "verify_anomaly", // 추가
      ]),
      challengeId: uuid,
      suppressed: z.boolean(),
      outcome: z.enum(["sent", "cleaned", "failed", "suppressed"]),
      actionLogId: uuid.optional(),
      actorUserId: uuid.optional(),
      week: z.number().int().min(1).optional(),
      anomalyReason: z.enum(["failed_rate", "reject_rate"]).optional(), // 추가
```

- [ ] **Step 3: verify_anomaly variant 테스트 추가 (parity spec)**

기존 `notification_sent kudos_received variant` describe 패턴을 따라 추가:

```ts
// apps/web/src/lib/analytics/schema-union-parity.spec.ts (파일 끝)
describe("notification_sent verify_anomaly variant (EVAL-0026)", () => {
  it("type=verify_anomaly + anomalyReason + week 채운 fixture 통과", () => {
    const fixture: AnalyticsEvent = {
      name: "notification_sent",
      props: {
        type: "verify_anomaly",
        challengeId: "11111111-1111-4111-8111-111111111111",
        suppressed: false,
        outcome: "sent",
        anomalyReason: "reject_rate",
        week: 1,
      },
    };
    const r = analyticsEventSchema.safeParse(fixture);
    expect(r.success, JSON.stringify(r, null, 2)).toBe(true);
  });
});
```

- [ ] **Step 4: 테스트 실행 → 통과**

Run: `pnpm --filter web test -- schema-union-parity`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/analytics
git commit -m "feat(analytics): notification_sent verify_anomaly enum 확장 (EVAL-0026 C3)"
```

---

## Task 5: 운영 임계 env 노브 `loadVerifyOpsConfig` (C3)

**Files:**

- Modify: `apps/web/src/lib/verify/config.ts`
- Test: `apps/web/src/lib/verify/config.spec.ts`
- Modify: `apps/web/src/lib/verify/index.ts`
- Modify: `apps/web/.env.example`

- [ ] **Step 1: 실패 테스트 작성 (config.spec.ts)**

```ts
// apps/web/src/lib/verify/config.spec.ts
import { loadVerifyOpsConfig } from "./config";

describe("loadVerifyOpsConfig", () => {
  it("기본값 — failed 0.3 / reject 0.3 / minSample 3", () => {
    expect(loadVerifyOpsConfig({})).toEqual({ failedRate: 0.3, rejectRate: 0.3, minSample: 3 });
  });
  it("env override 를 zod coerce 한다", () => {
    const c = loadVerifyOpsConfig({ VERIFY_OPS_FAILED_RATE: "0.5", VERIFY_OPS_MIN_SAMPLE: "5" });
    expect(c.failedRate).toBe(0.5);
    expect(c.minSample).toBe(5);
  });
  it("빈 문자열은 기본값 폴백", () => {
    expect(loadVerifyOpsConfig({ VERIFY_OPS_REJECT_RATE: "" }).rejectRate).toBe(0.3);
  });
});
```

- [ ] **Step 2: 실행 → 실패**

Run: `pnpm --filter web test -- config`
Expected: FAIL (`loadVerifyOpsConfig` not exported).

- [ ] **Step 3: 구현 (config.ts 끝에 추가)**

θ 스키마(`verifyEnvSchema`)와 **분리** — 운영 임계는 θ 무관(spec C3):

```ts
// apps/web/src/lib/verify/config.ts (파일 끝)
// 운영 이상 알림 임계 — θ(판정)와 별개. AC-owner-load-3. 값은 PO/운영 env.
const verifyOpsEnvSchema = z
  .object({
    VERIFY_OPS_FAILED_RATE: z.coerce.number().min(0).max(1).default(0.3),
    VERIFY_OPS_REJECT_RATE: z.coerce.number().min(0).max(1).default(0.3),
    // 최소 표본 — 1/1=100% 같은 노이즈 알림 방지.
    VERIFY_OPS_MIN_SAMPLE: z.coerce.number().int().min(1).default(3),
  })
  .transform((env) => ({
    failedRate: env.VERIFY_OPS_FAILED_RATE,
    rejectRate: env.VERIFY_OPS_REJECT_RATE,
    minSample: env.VERIFY_OPS_MIN_SAMPLE,
  }));

export type VerifyOpsConfig = z.output<typeof verifyOpsEnvSchema>;

export function loadVerifyOpsConfig(env: VerifyEnvSource = process.env): VerifyOpsConfig {
  return verifyOpsEnvSchema.parse({
    VERIFY_OPS_FAILED_RATE: env.VERIFY_OPS_FAILED_RATE || undefined,
    VERIFY_OPS_REJECT_RATE: env.VERIFY_OPS_REJECT_RATE || undefined,
    VERIFY_OPS_MIN_SAMPLE: env.VERIFY_OPS_MIN_SAMPLE || undefined,
  });
}
```

- [ ] **Step 4: barrel re-export (index.ts)**

```ts
// apps/web/src/lib/verify/index.ts — config export 확장
export {
  loadVerifyConfig,
  loadVerifyOpsConfig,
  type VerifyConfig,
  type VerifyOpsConfig,
} from "./config";
```

- [ ] **Step 5: .env.example 주석**

기존 `VERIFY_PHASH_*` 블록(line ~64-70) 바로 아래에 추가(같은 "서버 전용" 주석 컨벤션 유지):

```bash
# 운영 이상 알림 임계 (θ 무관, AC-owner-load-3). 모두 서버 전용 — NEXT_PUBLIC_ 접두 금지
# (임계가 클라 번들에 노출되면 우회 가능). 미설정 시 0.3/0.3/3 기본값.
VERIFY_OPS_FAILED_RATE=              # 주차 표본 중 failed 비율 임계 (enforce=true 에서만 알림)
VERIFY_OPS_REJECT_RATE=             # 주차 표본 중 peer_rejected 비율 임계 (enforce 무관)
VERIFY_OPS_MIN_SAMPLE=              # 최소 표본 — 1/1=100% 노이즈 알림 방지
```

- [ ] **Step 6: 실행 → 통과 + Commit**

Run: `pnpm --filter web test -- config`
Expected: PASS.

```bash
git add apps/web/src/lib/verify/config.ts apps/web/src/lib/verify/config.spec.ts apps/web/src/lib/verify/index.ts apps/web/.env.example
git commit -m "feat(verify): 운영 이상 알림 임계 env 노브 loadVerifyOpsConfig (EVAL-0026 C3)"
```

---

## Task 6: `dispatchVerifyAnomalyNotification` (C3 — dedup·shadow·익명 emit)

**Files:**

- Modify: `apps/web/src/lib/push/dispatch.ts`
- Test: `apps/web/src/lib/push/dispatch.spec.ts`

- [ ] **Step 1: 실패 테스트 작성 (dispatch.spec.ts)**

`dispatchGoalUnreachableNotification` 테스트 패턴 복제. 3개 단언:

```ts
// 1) dedup — 같은 (challengeId, week, anomalyReason) prior 존재 시 미발송 (recipientCount 0)
// 2) 옵트인 deadline=false 면 미발송
// 3) 발송 시 notification_sent{type:verify_anomaly, anomalyReason, week} 를 ownerUserId 로 emit
expect(trackMock).toHaveBeenCalledWith(
  expect.objectContaining({
    name: "notification_sent",
    props: expect.objectContaining({
      type: "verify_anomaly",
      anomalyReason: "reject_rate",
      week: 1,
    }),
  }),
  { userId: "owner-id" },
);
```

- [ ] **Step 2: 실행 → 실패**

Run: `pnpm --filter web test -- dispatch`
Expected: FAIL (함수 없음).

- [ ] **Step 3: 구현 (dispatch.ts — goal_unreachable 함수 인접에 추가)**

기존 helper(`isQuietHoursKST`·`notificationPrefsSchema`·`DispatchTarget`·`safeSend`·`Outcome`·`PushPayload`)를 재사용:

```ts
// apps/web/src/lib/push/dispatch.ts
// C3 — 검증 이상 신호 알림(AC-owner-load-3). 오너 1명 수신(D1), deadline 옵트인 재사용(D2).
// dedup 은 events 조회((challengeId, week, anomalyReason) 1회) — 신규 컬럼 불필요(goal_unreachable 패턴).
// shadow 게이트(failed_rate enforce-only)는 호출자(cron)가 판단 — 이 함수는 받은 reason 을 발송만 한다.
export async function dispatchVerifyAnomalyNotification(args: {
  challengeId: string;
  ownerUserId: string;
  week: number;
  anomalyReason: "failed_rate" | "reject_rate";
}): Promise<DispatchSummary> {
  const { challengeId, ownerUserId, week, anomalyReason } = args;
  const quietHours = isQuietHoursKST();
  const admin = adminClient();

  // dedup 키는 spec C3 대로 (challengeId, week, anomalyReason) 3개 — user_id 의도적 미포함.
  // goal_unreachable 은 per-participant 라 .eq("user_id") 가 필요했지만 verify_anomaly 는
  // per-challenge(오너 1명)라 challenge·week·reason 만으로 유일. 챌린지당 오너가 1명이므로
  // 같은 키에 다른 user_id row 가 생길 수 없다(테스트에서 오너 교체 시뮬레이션이면 .eq 추가 가능).
  const { data: prior } = await admin
    .from("events")
    .select("id")
    .eq("name", "notification_sent")
    .contains("props", { type: "verify_anomaly", challengeId, week, anomalyReason })
    .limit(1);
  if ((prior ?? []).length > 0) return { recipientCount: 0, quietHours };

  const { data: owner } = await admin
    .from("users")
    .select("notification_prefs")
    .eq("id", ownerUserId)
    .maybeSingle();
  const prefs = notificationPrefsSchema.safeParse(owner?.notification_prefs);
  if (!prefs.success || !prefs.data.deadline) return { recipientCount: 0, quietHours };

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .eq("user_id", ownerUserId);
  const targets: DispatchTarget[] = (subs ?? []).map((s) => ({
    userId: s.user_id as string,
    endpoint: s.endpoint as string,
    p256dh: s.p256dh as string,
    auth: s.auth as string,
  }));
  if (targets.length === 0) return { recipientCount: 0, quietHours };

  const targetUrl = `/challenge/${challengeId}/dashboard`;
  const body =
    anomalyReason === "failed_rate"
      ? "자동 검증 실패가 늘고 있어요 · 확인이 필요해요"
      : "멤버 반려가 늘고 있어요 · 확인이 필요해요";
  const payload: PushPayload = {
    title: "검증 이상 신호",
    body,
    url: targetUrl,
    type: "penalty_added",
    category: "penalty",
    targetUrl,
    challengeId,
  };

  await Promise.allSettled(
    targets.map(async (target) => {
      const outcome: Outcome = quietHours ? "suppressed" : await safeSend(target, payload);
      void track(
        {
          name: "notification_sent",
          props: {
            type: "verify_anomaly",
            challengeId,
            week,
            anomalyReason,
            suppressed: quietHours,
            outcome,
          },
        },
        { userId: ownerUserId },
      );
    }),
  );

  return { recipientCount: targets.length, quietHours };
}
```

- [ ] **Step 4: 실행 → 통과 + Commit**

Run: `pnpm --filter web test -- dispatch`
Expected: PASS.

```bash
git add apps/web/src/lib/push/dispatch.ts apps/web/src/lib/push/dispatch.spec.ts
git commit -m "feat(push): dispatchVerifyAnomalyNotification — 검증 이상 알림 dedup·익명 emit (EVAL-0026 C3)"
```

---

## Task 7: cron 트리거 — running 챌린지 rate 산정 + 알림 (C3)

**Files:**

- Modify: `apps/web/src/app/api/cron/deadline-push/route.ts`
- Test: `apps/web/src/app/api/cron/deadline-push/route.spec.ts`

- [ ] **Step 1: 실패 테스트 작성 (route.spec.ts)**

기존 `vi.mock("@/lib/push/dispatch", …)` 블록에 `dispatchVerifyAnomalyNotification: (...a) => dispatchVerifyAnomalyNotification(...a)` 추가하고 `beforeEach` 에서 `mockReset()`+`mockResolvedValue({ recipientCount: 1, quietHours: false })`. `actionLogsPlan.rows` 에 `auto_verify_status` 컬럼 포함. route.spec 은 `@/lib/verify` 를 mock 하지 않으므로 실제 `loadVerifyConfig`/`loadVerifyOpsConfig` 가 `process.env` default 로 동작 — shadow 게이트 검증은 `process.env.VERIFY_ENFORCE` 를 set/unset 한다. ⚠️ env 오염 방지: `afterEach` 에서 `delete process.env.VERIFY_ENFORCE`(또는 원래 값 restore)로 다른 테스트에 누수되지 않게 한다.

픽스처: 현재 주차 action_logs 4건 중 `peer_rejected` 2건(reject_rate 0.5 > 0.3, sample 4 ≥ 3) → reject_rate 알림 1회 호출. failed 는 `enforce=false`(기본 shadow)면 미호출.

```ts
expect(dispatchVerifyAnomalyNotification).toHaveBeenCalledWith(
  expect.objectContaining({ anomalyReason: "reject_rate", week: expect.any(Number) }),
);
expect(dispatchVerifyAnomalyNotification).not.toHaveBeenCalledWith(
  expect.objectContaining({ anomalyReason: "failed_rate" }),
);
```

- [ ] **Step 2: 실행 → 실패**

Run: `pnpm --filter web test -- deadline-push`
Expected: FAIL.

- [ ] **Step 3: import + running select 확장**

```ts
// apps/web/src/app/api/cron/deadline-push/route.ts (상단)
import { dispatchVerifyAnomalyNotification } from "@/lib/push/dispatch";
import { loadVerifyConfig, loadVerifyOpsConfig } from "@/lib/verify";
import {
  toKstDayKey,
  dayIndexOf,
  weekIndexOf,
  unreachableParticipants,
  type CutoffContext,
} from "@withkey/domain";
```

running select 에 `groups!inner(owner_id)` 추가, 루프 내 logs select 에 `auto_verify_status` 추가:

```ts
const { data: running } = await admin
  .from("challenges")
  .select("id, goal_count, duration_days, penalty_amount, start_at, groups!inner(owner_id)")
  .eq("status", "active")
  .gt("end_at", new Date(now).toISOString())
  .not("start_at", "is", null);
```

```ts
const { data: logs } = await admin
  .from("action_logs")
  .select("user_id, created_at, auto_verify_status") // auto_verify_status 추가
  .eq("challenge_id", ch.id as string);
```

- [ ] **Step 4: config hoist + rate 산정 + 알림**

먼저 config 로드를 **running 루프 밖**으로 끌어올린다(루프마다 `zod.parse(process.env)` 재실행 방지). `const { data: running } = ...` 직전에:

```ts
const opsConfig = loadVerifyOpsConfig();
const verifyConfig = loadVerifyConfig();
```

그다음 `for (const t of targets)` 블록 다음, `}` (running 루프 끝) 직전에 삽입:

```ts
// 검증 이상 신호 — 현재 주차 failed_rate / reject_rate 임계 초과 시 오너 알림(AC-owner-load-3).
// 주의: 이 운영 트리거 rate 는 action_logs.auto_verify_status 컬럼 직접 집계다.
//   spec C2 가 말한 분석 반려율(분모=challenge_activated.participantCount, events 재구성)과는
//   별개 정의 — 운영 알림 트리거 ≠ 분석 지표. 두 수치를 동일시하지 말 것.
const currentWeek = weekIndexOf(todayDayIndex);
const weekLogs = (logs ?? []).filter(
  (l) => weekIndexOf(dayIndexOf(toKstDayKey(l.created_at as string), startKey)) === currentWeek,
);
const sample = weekLogs.length;
const ownerId = (Array.isArray(ch.groups) ? ch.groups[0] : ch.groups)?.owner_id as
  | string
  | undefined;
if (ownerId && sample >= opsConfig.minSample) {
  const failed = weekLogs.filter((l) => l.auto_verify_status === "failed").length;
  const rejected = weekLogs.filter((l) => l.auto_verify_status === "peer_rejected").length;
  // failed_rate: shadow(enforce=false)에선 미발사 — would-be failed 는 차단 없어 그룹 혼란.
  if (verifyConfig.enforce && failed / sample > opsConfig.failedRate) {
    await dispatchVerifyAnomalyNotification({
      challengeId: ch.id as string,
      ownerUserId: ownerId,
      week: currentWeek,
      anomalyReason: "failed_rate",
    });
  }
  // reject_rate: enforce 무관 항상 발사 — 피어 반려는 사람의 실제 결정.
  if (rejected / sample > opsConfig.rejectRate) {
    await dispatchVerifyAnomalyNotification({
      challengeId: ch.id as string,
      ownerUserId: ownerId,
      week: currentWeek,
      anomalyReason: "reject_rate",
    });
  }
}
```

> `todayDayIndex`·`startKey` 는 기존 루프에서 이미 계산됨(line ~98). dedup·옵트인·발송은 Task 6 함수가 책임진다.

- [ ] **Step 5: 실행 → 통과**

Run: `pnpm --filter web test -- deadline-push`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/cron/deadline-push
git commit -m "feat(cron): running 챌린지 검증 이상 rate 산정 + 오너 알림 트리거 (EVAL-0026 C3)"
```

---

## 최종 검증 (양 WP 후)

- [ ] **Step 1: 전체 게이트**

```bash
pnpm typecheck
pnpm lint
pnpm --filter web test -- analytics verify dispatch deadline-push _actions submit-core
pnpm validate:docs
pnpm harness:check
```

Expected: 전부 PASS. `harness:check` 가 EVAL-0026 traceability(AC ↔ 산출물) 확인.

- [ ] **Step 2: 본문 미로깅 가드 확인 (C5)**

신규 payload 3종에 사진 URL·phash 원본 문자열·일기 본문·키워드 텍스트가 없는지 grep 으로 재확인:

```bash
git diff main -- apps/web/src/lib/analytics apps/web/src/lib/verify apps/web/src/lib/push
```

Expected: props 는 id·bool·수치·enum·modelVersion 만. `score`(수치) 허용, phash 문자열 부재.

- [ ] **Step 3: dogfood 실측 (spec Rollout 4)**

배포 후: 사진 제출 → `events` 에 `auto_verify_result` 1건; 반려 토글 → `peer_reject`(user_id=null); reject_rate 임계 초과 → 오너 알림 1회 + `notification_sent{verify_anomaly}` + 같은 주차 재초과 시 dedup 미발송.

---

## 검증 매핑 (task AC ↔ plan)

| task AC                        | 충족 task                |
| ------------------------------ | ------------------------ |
| 임계 초과 알림 AC-owner-load-3 | Task 6·7                 |
| 이벤트 union 1:1 (PRD §9.1)    | Task 3                   |
| union ↔ zod parity             | Task 1·2·4 (parity spec) |
| 본문 미로깅                    | 최종검증 Step 2 (C5)     |
| spec 선행                      | 🚦 게이트                |
| harness traceability           | 최종검증 Step 1          |

## 후속 / 범위 밖 (spec Out of scope)

- 판정 로직(EVAL-0022)·반려 저장(EVAL-0025) — 본 plan 은 결과 소비(emit)만.
- 알림 트리거 정량값(rate·threshold·window)의 analytics 적재 — Option A 트레이드오프, 필요 시 별도 spec.
- 개인 단위 반려 악용 탐지(attribution) — 익명 채택으로 범위 밖.
- `failed`/`manual_review` 로그의 피어 과반 도달 정밀 측정 — RPC `v_n` 미반환(0048), 필요 시 migration spec 승격.
