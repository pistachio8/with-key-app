# 친구 인증 완료 푸시 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 친구에게 가는 푸시를 "인증 화면 진입" 시점에서 "사진 인증 제출 완료" 시점으로 옮기고, 활동 종류별·첫제출/재제출별로 문구를 분기한다. 인앱 "운동" 문구도 활동 중립/분기로 정리한다.

**Architecture:** 푸시 발송을 `markActionStarted`(화면 진입) → `submitActionLog`(제출 성공 후 `after()`)로 이동한다. `dispatchActionStartNotification`을 `dispatchActionCompletedNotification`으로 대체하고 `activityType`·`isFirstOfDay`를 받아 문구를 분기한다. `action_started` 분석 이벤트와 진입 시 idempotency는 그대로 두되(분석 dedupe), 푸시 dispatch만 분리한다. 옵트아웃은 기존 `notification_prefs.start` 키를 재사용하고, 알림센터 분류는 `category:"friend_action"`을 유지한다(게이팅 축과 분류 축은 독립). 분석 `notification_sent.type`·`notification_opened.type` enum에 `friend_action`을 추가한다.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Supabase · web-push · zod · Vitest

---

## 배경: 왜 이 변경인가 (모순 해소 요약)

현재 코드는 사용자가 **인증 화면(`/challenge/[id]/action`)에 진입(mount)하는 순간** 그룹원에게 `"{name}님이 운동을 시작했어요!"`를 보낸다(`MarkActionStartedOnMount` → `markActionStarted` → `dispatchActionStartNotification`). **사진 인증을 제출 완료해도 그룹원에게 가는 푸시는 없다.** PRD §6.4가 정의한 `friend_action`(인증 완료) 푸시는 미구현 상태이고, PRD §6.2 `start` 행(운동 시작)은 코드와 어긋나 있다.

이 plan은 트리거를 "제출 완료"로 옮겨 PRD §6.4 의도에 맞추고, `meal`(식단) 등 비-운동 활동에도 맞는 문구로 분기한다.

**범위 밖 (별도 이슈):** `public/service-worker.js`가 클릭 시 POST하는 `/api/push/opened` 라우트가 존재하지 않는다(기존 죽은 경로, SW가 `catch`로 무시). 이번 PR에서 건드리지 않는다.

## 결정 사항 (인터뷰 합의)

- 발송 시점: **사진 제출 완료**(`submitActionLog` 성공 후 `after()`). 진입 푸시 제거.
- `action_started` 분석 이벤트: **유지** (진입 시 발사, 1일 1회 idempotency 유지 — 분석 dedupe).
- 빈도: **매 제출마다 발송**. 단 그 날 첫 인증(`todayWasNewDay`)이면 담백 문구, 같은 날 재제출이면 더 가벼운 문구.
- 문구(작성자 = `{name}`):
  - 첫 인증 title(활동별): `🏃 러닝 인증!` · `🏋️ 헬스 인증!` · `🧘 요가 인증!` · `🥗 식단 인증!` · `✨ 인증 도착!`(기타)
  - 첫 인증 body(공통): `{name}님이 오늘 인증을 완료했어요 💪`
  - 재제출 title(활동별): `🏃 러닝 또!` · `🏋️ 헬스 또!` · `🧘 요가 또!` · `🥗 식단 또!` · `✨ 또 인증!`(기타)
  - 재제출 body(공통): `{name}님이 한 번 더 인증했어요`
- payload: `type:"friend_action"` · `category:"friend_action"` 유지 (알림센터 "친구 인증" 탭).
- 옵트아웃 게이팅: 기존 `start` pref 키 재사용. 설정 토글 라벨 → **"그룹 활동 알림 / 챌린지 시작과 친구 인증을 알려드려요"**.
- 조용한 시간(02–07 KST): 기존대로 suppress.
- 분석: `notification_sent.type`·`notification_opened.type` enum에 `friend_action` 추가.
- 인앱: 결과 모달 활동별 분기, 폼 진입 헤딩은 중립("오늘의 활동을 인증하세요" — 진입 시점엔 활동 미선택), action page 헤딩 "AI 운동일기"→"AI 일기".

## File Structure

| 파일                                                                         | 역할                              | 작업                                                                                                                    |
| ---------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/lib/analytics/schema.ts`                                                | zod analytics SoT                 | `notification_sent.type`·`notification_opened.type`에 `friend_action` 추가                                              |
| `src/lib/analytics/track.ts`                                                 | TS union (schema 미러)            | 동일 union에 `friend_action` 추가                                                                                       |
| `src/lib/analytics/schema-union-parity.spec.ts`                              | parity 테스트                     | friend_action 분기 fixture 테스트 추가                                                                                  |
| `src/lib/push/dispatch.ts`                                                   | 푸시 dispatch                     | `dispatchActionStartNotification` 제거 + `dispatchActionCompletedNotification` 추가 + `dispatch()`에 `trackType` 디커플 |
| `src/lib/push/dispatch.spec.ts`                                              | dispatch 단위테스트               | 완료 푸시 first/repeat·활동별 테스트로 교체                                                                             |
| `src/app/(app)/challenge/[id]/_actions.ts`                                   | markActionStarted                 | 푸시 dispatch 제거(분석 전용), 고아 import 정리                                                                         |
| `src/app/(app)/challenge/[id]/mark-action-started.spec.ts`                   | markActionStarted 테스트          | dispatch 단언 제거                                                                                                      |
| `src/app/(app)/challenge/[id]/action/_actions.ts`                            | submitActionLog                   | displayName 항상 조회 + 제출 성공 후 완료 푸시 `after()`                                                                |
| `src/app/(app)/challenge/[id]/action/_actions.spec.ts`                       | submitActionLog 테스트            | 완료 푸시 dispatch 단언 추가                                                                                            |
| `src/app/(app)/me/_components/push-settings.tsx`                             | 알림 설정 UI                      | "시작 알림" 토글 라벨 변경                                                                                              |
| `src/app/(app)/challenge/[id]/action/_components/action-result-copy.ts`      | (신규) 결과 모달 문구 헬퍼 (pure) | 활동별 title 함수                                                                                                       |
| `src/app/(app)/challenge/[id]/action/_components/action-result-copy.spec.ts` | (신규) 문구 헬퍼 테스트           | 활동별 분기 검증                                                                                                        |
| `src/app/(app)/challenge/[id]/action/_components/action-result-dialog.tsx`   | 결과 모달                         | 활동별 title 적용 + `activityType` prop                                                                                 |
| `src/app/(app)/challenge/[id]/action/_components/action-form.tsx`            | 인증 폼                           | 진입 헤딩 중립화 + result에 activityType 전달                                                                           |
| `src/app/(app)/challenge/[id]/action/page.tsx`                               | action 페이지                     | 헤딩 "AI 운동일기"→"AI 일기"                                                                                            |
| `docs/PRD.md`                                                                | PRD                               | §6.2 표 · AC-2 · §6.4 edge 갱신                                                                                         |
| `docs/superpowers/specs/2026-05-29-friend-completion-push.md`                | (신규) spec                       | analytics 변경 근거 (AGENTS §4: track.ts 변경 → spec 필수)                                                              |

---

## Task 0: 브랜치 생성

**Files:** (없음 — git만)

- [ ] **Step 1: origin/develop 기준 브랜치 생성**

```bash
git fetch origin develop
git switch -c feat/friend-completion-push origin/develop
```

(이미 동명 브랜치가 비어 있으면 `git switch feat/friend-completion-push && git reset --hard origin/develop` 로 재사용)

Expected: `Switched to a new branch 'feat/friend-completion-push'`

---

## Task 1: 분석 enum에 friend_action 추가

**Files:**

- Modify: `src/lib/analytics/schema.ts:108-126`
- Modify: `src/lib/analytics/track.ts:82-97`
- Test: `src/lib/analytics/schema-union-parity.spec.ts`

- [ ] **Step 1: parity spec에 friend_action 변형 테스트 추가 (실패 케이스)**

`src/lib/analytics/schema-union-parity.spec.ts` 파일 맨 끝(마지막 `});` 뒤)에 추가:

```ts
describe("notification_sent friend_action variant", () => {
  it("type=friend_action fixture가 zod schema를 통과한다", () => {
    const fixture: AnalyticsEvent = {
      name: "notification_sent",
      props: {
        type: "friend_action",
        challengeId: "11111111-1111-4111-8111-111111111111",
        suppressed: false,
        outcome: "sent",
      },
    };
    expect(analyticsEventSchema.parse(fixture)).toEqual(fixture);
  });

  it("notification_opened type=friend_action fixture가 통과한다", () => {
    const fixture: AnalyticsEvent = {
      name: "notification_opened",
      props: {
        type: "friend_action",
        challengeId: "11111111-1111-4111-8111-111111111111",
      },
    };
    expect(analyticsEventSchema.parse(fixture)).toEqual(fixture);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test src/lib/analytics/schema-union-parity.spec.ts`
Expected: FAIL — `"friend_action"`가 enum에 없어 `analyticsEventSchema.parse`가 throw, 그리고 `AnalyticsEvent` 타입에 friend_action이 없어 타입 에러.

- [ ] **Step 3: schema.ts enum 확장**

`src/lib/analytics/schema.ts`의 `notification_sent` 블록(라인 ~108-119) `type` enum과 `notification_opened` 블록(라인 ~120-126) `type` enum을 수정:

```ts
  z.object({
    name: z.literal("notification_sent"),
    props: z.object({
      type: z.enum(["start", "deadline", "friend_action", "kudos_received"]),
      challengeId: uuid,
      suppressed: z.boolean(),
      outcome: z.enum(["sent", "cleaned", "failed", "suppressed"]),
      // kudos_received 만 채움. start/deadline/friend_action 발송에는 의미 없음.
      actionLogId: uuid.optional(),
      actorUserId: uuid.optional(),
    }),
  }),
  z.object({
    name: z.literal("notification_opened"),
    props: z.object({
      type: z.enum(["start", "deadline", "friend_action"]),
      challengeId: uuid,
    }),
  }),
```

- [ ] **Step 4: track.ts union 확장**

`src/lib/analytics/track.ts`의 `notification_sent`·`notification_opened` 멤버(라인 ~82-97)를 수정:

```ts
  | {
      name: "notification_sent";
      props: {
        type: "start" | "deadline" | "friend_action" | "kudos_received";
        challengeId: string;
        suppressed: boolean;
        outcome: "sent" | "cleaned" | "failed" | "suppressed";
        // kudos_received 만 채움 (ADR-0017). start/deadline/friend_action 발송에는 의미 없음.
        actionLogId?: string;
        actorUserId?: string;
      };
    }
  | {
      name: "notification_opened";
      props: { type: "start" | "deadline" | "friend_action"; challengeId: string };
    }
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm test src/lib/analytics/schema-union-parity.spec.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/lib/analytics/schema.ts src/lib/analytics/track.ts src/lib/analytics/schema-union-parity.spec.ts
git commit -m "feat(analytics): notification_sent·notification_opened type에 friend_action 추가"
```

---

## Task 2: 완료 푸시 dispatch 구현 (rename + 활동별 문구 + trackType 디커플)

**Files:**

- Modify: `src/lib/push/dispatch.ts` (라인 11: import / 13: NotificationKind / 103-133: dispatch / 148-169: 함수 교체)
- Test: `src/lib/push/dispatch.spec.ts:73, 226-269`

배경: 현재 `dispatch()`는 `kind`(="start")를 prefs 게이팅 키와 `notification_sent.type` **둘 다**에 쓴다. 완료 푸시는 게이팅 키는 `start`(재사용)지만 분석 type은 `friend_action`이어야 하므로 둘을 분리한다.

- [ ] **Step 1: dispatch.spec.ts의 완료 푸시 테스트로 교체 (실패 케이스)**

`src/lib/push/dispatch.spec.ts` 라인 73의 import를 교체:

```ts
import { dispatchActionCompletedNotification, dispatchStartNotification } from "./dispatch";
```

그리고 `describe("dispatchActionStartNotification", ...)` 블록 전체(라인 226-269)를 아래로 교체:

```ts
describe("dispatchActionCompletedNotification", () => {
  it("첫 인증(isFirstOfDay=true): 활동별 title + 완료 body, actor 제외", async () => {
    queueHappyPath({
      participants: [{ user_id: "actor" }, { user_id: "user-b" }, { user_id: "user-c" }],
      users: [
        { id: "user-b", notification_prefs: { start: true, deadline: true, kudos: false } },
        { id: "user-c", notification_prefs: { start: true, deadline: true, kudos: false } },
      ],
      subs: [
        { user_id: "user-b", endpoint: "ep-b", p256dh: "p", auth: "a" },
        { user_id: "user-c", endpoint: "ep-c", p256dh: "p", auth: "a" },
      ],
    });

    await dispatchActionCompletedNotification(
      CHALLENGE_ID,
      { userId: "actor", displayName: "민지" },
      { activityType: "gym", isFirstOfDay: true },
    );

    expect(sendPush).toHaveBeenCalledTimes(2);
    for (const [, payload] of sendPush.mock.calls) {
      expect((payload as { title: string }).title).toBe("🏋️ 헬스 인증!");
      expect((payload as { body: string }).body).toBe("민지님이 오늘 인증을 완료했어요 💪");
      expect((payload as { type: string }).type).toBe("friend_action");
      expect((payload as { category: string }).category).toBe("friend_action");
    }
    const recipientIds = trackCalls.map((c) => (c.options as { userId?: string }).userId);
    expect(recipientIds).toEqual(expect.arrayContaining(["user-b", "user-c"]));
    expect(recipientIds).not.toContain("actor");
    // notification_sent.type 은 friend_action (게이팅 키 start 와 분리)
    for (const c of trackCalls) {
      expect((c.event as { props: { type: string } }).props.type).toBe("friend_action");
    }
  });

  it("재제출(isFirstOfDay=false): 활동별 '또' title + 재제출 body", async () => {
    queueHappyPath({
      participants: [{ user_id: "actor" }, { user_id: "user-b" }],
      users: [{ id: "user-b", notification_prefs: { start: true, deadline: true, kudos: false } }],
      subs: [{ user_id: "user-b", endpoint: "ep-b", p256dh: "p", auth: "a" }],
    });

    await dispatchActionCompletedNotification(
      CHALLENGE_ID,
      { userId: "actor", displayName: "민지" },
      { activityType: "meal", isFirstOfDay: false },
    );

    expect(sendPush).toHaveBeenCalledTimes(1);
    const [, payload] = sendPush.mock.calls[0]!;
    expect((payload as { title: string }).title).toBe("🥗 식단 또!");
    expect((payload as { body: string }).body).toBe("민지님이 한 번 더 인증했어요");
  });

  it("기타(other) 활동은 활동명 없는 title", async () => {
    queueHappyPath({
      participants: [{ user_id: "actor" }, { user_id: "user-b" }],
      users: [{ id: "user-b", notification_prefs: { start: true, deadline: true, kudos: false } }],
      subs: [{ user_id: "user-b", endpoint: "ep-b", p256dh: "p", auth: "a" }],
    });

    await dispatchActionCompletedNotification(
      CHALLENGE_ID,
      { userId: "actor", displayName: "민지" },
      { activityType: "other", isFirstOfDay: true },
    );

    const [, payload] = sendPush.mock.calls[0]!;
    expect((payload as { title: string }).title).toBe("✨ 인증 도착!");
  });

  it("actor가 유일 참가자면 발송하지 않는다", async () => {
    tablePlans.push({ table: "challenge_participants", rows: [{ user_id: "solo" }] });

    await dispatchActionCompletedNotification(
      CHALLENGE_ID,
      { userId: "solo", displayName: "혼자" },
      { activityType: "gym", isFirstOfDay: true },
    );

    expect(sendPush).not.toHaveBeenCalled();
    expect(trackCalls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test src/lib/push/dispatch.spec.ts`
Expected: FAIL — `dispatchActionCompletedNotification` export 없음.

- [ ] **Step 3: dispatch.ts 구현**

`src/lib/push/dispatch.ts` 상단 import에 `ActivityType` 추가 (라인 11 `import type { KudosEmoji } ...` 아래):

```ts
import type { ActivityType } from "@/lib/keywords/pool";
```

라인 13 근처 타입 정의를 수정 (게이팅 키 ≠ 분석 type 분리):

```ts
type NotificationKind = "start" | "deadline";
type NotificationSentType = "start" | "deadline" | "friend_action";
type Outcome = "sent" | "cleaned" | "failed" | "suppressed";
```

`dispatch()` 함수(라인 103-133)를 수정 — `options`에 `trackType` 추가, track의 `type`을 `trackType ?? kind`로:

```ts
async function dispatch(
  challengeId: string,
  kind: NotificationKind,
  payload: PushPayload,
  options: { excludeUserId?: string; trackType?: NotificationSentType } = {},
): Promise<DispatchSummary> {
  const targets = await loadTargets(challengeId, kind, options);
  const quietHours = isQuietHoursKST();
  if (targets.length === 0) return { recipientCount: 0, quietHours };

  // notification_sent.type 은 분석용 — 게이팅 prefs 키(kind)와 분리한다.
  // 완료 푸시는 kind="start"(옵트인 키 재사용)지만 분석 type 은 "friend_action".
  const trackType: NotificationSentType = options.trackType ?? kind;

  // 병렬 송신: N=3~4 명 그룹에서도 직렬로는 합산 지연이 누적된다. 실패는 per-recipient 격리.
  await Promise.allSettled(
    targets.map(async (target) => {
      const outcome: Outcome = quietHours ? "suppressed" : await safeSend(target, payload);
      void track(
        {
          name: "notification_sent",
          props: {
            type: trackType,
            challengeId,
            suppressed: quietHours,
            outcome,
          },
        },
        { userId: target.userId },
      );
    }),
  );

  return { recipientCount: targets.length, quietHours };
}
```

`dispatchActionStartNotification` 함수(라인 148-169) 전체를 아래 완료 푸시 함수로 **교체**:

```ts
// PRD §6.4 — 그룹원이 사진 인증을 제출 완료하면 그룹원(본인 제외)에게 push.
// submitActionLog 성공 후 after() 로 fire. 매 제출마다 발송하되 그 날 첫 인증(isFirstOfDay)과
// 재제출 문구를 분기한다. 옵트인 게이팅은 기존 "start" prefs 키 재사용, 분석 type 은 friend_action.
const COMPLETED_TITLE_FIRST: Record<ActivityType, string> = {
  running: "🏃 러닝 인증!",
  gym: "🏋️ 헬스 인증!",
  yoga: "🧘 요가 인증!",
  other: "✨ 인증 도착!",
  meal: "🥗 식단 인증!",
};
const COMPLETED_TITLE_REPEAT: Record<ActivityType, string> = {
  running: "🏃 러닝 또!",
  gym: "🏋️ 헬스 또!",
  yoga: "🧘 요가 또!",
  other: "✨ 또 인증!",
  meal: "🥗 식단 또!",
};

export async function dispatchActionCompletedNotification(
  challengeId: string,
  actor: { userId: string; displayName: string },
  options: { activityType: ActivityType; isFirstOfDay: boolean },
): Promise<DispatchSummary> {
  const targetUrl = `/challenge/${challengeId}`;
  const title = options.isFirstOfDay
    ? COMPLETED_TITLE_FIRST[options.activityType]
    : COMPLETED_TITLE_REPEAT[options.activityType];
  const body = options.isFirstOfDay
    ? `${actor.displayName}님이 오늘 인증을 완료했어요 💪`
    : `${actor.displayName}님이 한 번 더 인증했어요`;
  return dispatch(
    challengeId,
    "start",
    {
      title,
      body,
      url: targetUrl,
      type: "friend_action",
      category: "friend_action",
      targetUrl,
      challengeId,
    },
    { excludeUserId: actor.userId, trackType: "friend_action" },
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test src/lib/push/dispatch.spec.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/push/dispatch.ts src/lib/push/dispatch.spec.ts
git commit -m "feat(push): dispatchActionCompletedNotification — 제출 완료 활동별 푸시 + trackType 분리"
```

---

## Task 3: markActionStarted에서 푸시 제거 (분석 전용으로 축소)

**Files:**

- Modify: `src/app/(app)/challenge/[id]/_actions.ts:14-19, 128-212`
- Test: `src/app/(app)/challenge/[id]/mark-action-started.spec.ts`

배경: 진입 푸시를 제거하므로 `markActionStarted`는 `action_started` 분석 이벤트만 남긴다(1일 1회 idempotency 유지 — 분석 dedupe). 푸시 dispatch·displayName 조회·`isQuietHoursKST`·recipientCount/quietHours 반환은 제거한다.

- [ ] **Step 1: mark-action-started.spec.ts를 분석 전용으로 교체 (실패 케이스)**

`src/app/(app)/challenge/[id]/mark-action-started.spec.ts` 전체를 아래로 교체:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// 각 테스트가 테이블별 resolver 를 큐잉. 모든 체인 메서드는 같은 체인을 반환하고,
// 체인을 await 하면 해당 테이블의 다음 큐 결과를 resolve.
type Resolver = { data: unknown; error: unknown };

const queues = new Map<string, Resolver[]>();
function enqueue(table: string, r: Resolver) {
  const arr = queues.get(table) ?? [];
  arr.push(r);
  queues.set(table, arr);
}
function dequeue(table: string): Resolver {
  const arr = queues.get(table) ?? [];
  if (arr.length === 0) {
    throw new Error(`mark-action-started.spec: no queued resolver for table "${table}"`);
  }
  return arr.shift()!;
}

function makeChain(table: string) {
  const chain: Record<string, unknown> = {};
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === "then") {
        return (onFulfilled: (r: Resolver) => unknown) => onFulfilled(dequeue(table));
      }
      return () => proxy;
    },
  };
  const proxy = new Proxy(chain, handler);
  return proxy;
}

const USER_ID = "11111111-1111-1111-1111-111111111111";
const CHALLENGE_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({
        data: { claims: { sub: USER_ID, email: "u@test.local" } },
        error: null,
      }),
    },
    from: (table: string) => makeChain(table),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({ from: (table: string) => makeChain(table) }),
}));

const trackCalls: Array<{ event: unknown; options: unknown }> = [];
vi.mock("@/lib/analytics/track", () => ({
  track: async (event: unknown, options: unknown) => {
    trackCalls.push({ event, options });
  },
}));

import { markActionStarted } from "./_actions";

function activeChallengeNow() {
  return {
    user_id: USER_ID,
    challenges: {
      status: "active",
      start_at: new Date(Date.now() - 60_000).toISOString(),
      end_at: new Date(Date.now() + 60_000).toISOString(),
    },
  };
}

function queueHappyPath(todayEvents: unknown[] = []) {
  enqueue("challenge_participants", { data: activeChallengeNow(), error: null });
  enqueue("events", { data: todayEvents, error: null });
}

beforeEach(() => {
  queues.clear();
  trackCalls.length = 0;
});

describe("markActionStarted (analytics only)", () => {
  it("rejects invalid challengeId without touching db", async () => {
    const res = await markActionStarted({ challengeId: "not-a-uuid" });
    expect(res.ok).toBe(false);
    expect(trackCalls).toHaveLength(0);
  });

  it("returns not_found when membership row is missing", async () => {
    enqueue("challenge_participants", { data: null, error: null });
    const res = await markActionStarted({ challengeId: CHALLENGE_ID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("not_found");
  });

  it("returns forbidden when challenge is not active", async () => {
    enqueue("challenge_participants", {
      data: {
        user_id: USER_ID,
        challenges: {
          status: "pending",
          start_at: new Date().toISOString(),
          end_at: new Date(Date.now() + 60_000).toISOString(),
        },
      },
      error: null,
    });
    const res = await markActionStarted({ challengeId: CHALLENGE_ID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("forbidden");
  });

  it("returns forbidden when current time is outside challenge window", async () => {
    enqueue("challenge_participants", {
      data: {
        user_id: USER_ID,
        challenges: {
          status: "active",
          start_at: new Date(Date.now() + 60_000).toISOString(),
          end_at: new Date(Date.now() + 120_000).toISOString(),
        },
      },
      error: null,
    });
    const res = await markActionStarted({ challengeId: CHALLENGE_ID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("forbidden");
  });

  it("returns skipped=true when an action_started event already exists today", async () => {
    enqueue("challenge_participants", { data: activeChallengeNow(), error: null });
    enqueue("events", { data: [{ id: 99 }], error: null });
    const res = await markActionStarted({ challengeId: CHALLENGE_ID });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.skipped).toBe(true);
    expect(trackCalls).toHaveLength(0);
  });

  it("happy path: tracks action_started once and returns skipped=false", async () => {
    queueHappyPath();
    const res = await markActionStarted({ challengeId: CHALLENGE_ID });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.skipped).toBe(false);

    expect(trackCalls).toHaveLength(1);
    const ev = trackCalls[0]!.event as { name: string; props: { challengeId: string } };
    expect(ev.name).toBe("action_started");
    expect(ev.props.challengeId).toBe(CHALLENGE_ID);
    expect((trackCalls[0]!.options as { userId?: string }).userId).toBe(USER_ID);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test "src/app/(app)/challenge/[id]/mark-action-started.spec.ts"`
Expected: FAIL — 현재 markActionStarted가 `from("users")`·dispatch를 호출해 큐가 어긋나거나 반환 shape 불일치.

- [ ] **Step 3: `[id]/_actions.ts` import 정리**

라인 14-19를 수정 — `dispatchActionStartNotification` import 제거 (markActionStarted 전용이었음). `dispatchStartNotification`(챌린지 활성화)·`dispatchKudosReceivedNotification`은 유지:

```ts
import { dispatchKudosReceivedNotification, dispatchStartNotification } from "@/lib/push/dispatch";
```

라인 19 `import { isQuietHoursKST } from "@/lib/push/send";` **삭제** (markActionStarted 전용이었음. 다른 사용처 없음 확인).

- [ ] **Step 4: markActionStarted 본문 축소**

라인 128-212의 `StartActionResult` 타입과 `markActionStarted` 함수를 아래로 교체:

```ts
// PRD §9.1 — 사용자가 인증 화면(/challenge/[id]/action)에 진입하면 action_started 분석 이벤트 발사.
// 푸시는 더 이상 여기서 보내지 않는다(제출 완료 시 dispatchActionCompletedNotification 로 이동).
// events 테이블 idempotency 로 1일 1회만 기록한다(분석 dedupe).
const startActionInputSchema = z.object({ challengeId: z.string().uuid() });
type StartActionInput = z.infer<typeof startActionInputSchema>;
type StartActionResult = { skipped: boolean };

export const markActionStarted = withUser<StartActionInput, StartActionResult>(
  async (user, input): Promise<ActionResult<StartActionResult>> => {
    const parsed = startActionInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    const supabase = await createClient();

    const { data: membership, error: mErr } = await supabase
      .from("challenge_participants")
      .select("user_id, challenges!inner(status, start_at, end_at)")
      .eq("challenge_id", parsed.data.challengeId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (mErr) return failure(mapSupabaseError(mErr));
    if (!membership) return failure("not_found");
    const ch = Array.isArray(membership.challenges)
      ? membership.challenges[0]
      : membership.challenges;
    if (!ch || ch.status !== "active") return failure("forbidden");
    const now = Date.now();
    if (
      !ch.start_at ||
      !ch.end_at ||
      now < new Date(ch.start_at).getTime() ||
      now > new Date(ch.end_at).getTime()
    ) {
      return failure("forbidden");
    }

    // events 테이블은 service_role 만 SELECT — admin 클라이언트로 idempotency 조회.
    const admin = adminClient();
    const { data: existing } = await admin
      .from("events")
      .select("id")
      .eq("name", "action_started")
      .eq("user_id", user.id)
      .contains("props", { challengeId: parsed.data.challengeId })
      .gte("created_at", startOfKstTodayIso())
      .limit(1);
    if (existing && existing.length > 0) {
      return success({ skipped: true });
    }

    void track(
      { name: "action_started", props: { challengeId: parsed.data.challengeId } },
      { userId: user.id },
    );

    return success({ skipped: false });
  },
);
```

> 참고: `startOfKstTodayIso()` 헬퍼(라인 214 이하)와 `adminClient` import는 그대로 유지된다.

- [ ] **Step 5: MarkActionStartedOnMount 호출부 회귀 확인**

`MarkActionStartedOnMount`는 `void markActionStarted({ challengeId })`로 호출하며 반환값을 쓰지 않는다(`src/app/(app)/challenge/[id]/action/_components/mark-action-started-on-mount.tsx:19`). 반환 shape이 `{ skipped }`로 줄어도 무영향 — 수정 불필요. 변경 없음을 확인만 한다.

Run: `rg -n "markActionStarted\(" "src/app/(app)/challenge/[id]"`
Expected: 호출처가 `mark-action-started-on-mount.tsx`의 `void markActionStarted(...)` 1곳 + 정의/테스트뿐. 반환값 사용처 없음.

- [ ] **Step 6: 테스트 통과 확인**

Run: `pnpm test "src/app/(app)/challenge/[id]/mark-action-started.spec.ts"`
Expected: PASS

- [ ] **Step 7: 타입체크 (고아 import 확인)**

Run: `pnpm typecheck`
Expected: PASS — `dispatchActionStartNotification`·`isQuietHoursKST` 미사용 에러 없음.

- [ ] **Step 8: 커밋**

```bash
git add "src/app/(app)/challenge/[id]/_actions.ts" "src/app/(app)/challenge/[id]/mark-action-started.spec.ts"
git commit -m "refactor(action): markActionStarted를 분석 전용으로 축소 (진입 푸시 제거)"
```

---

## Task 4: submitActionLog에서 완료 푸시 발송

**Files:**

- Modify: `src/app/(app)/challenge/[id]/action/_actions.ts:1-15, 130-167, 260-279`
- Test: `src/app/(app)/challenge/[id]/action/_actions.spec.ts`

배경: 제출 성공 후 `after()`로 `dispatchActionCompletedNotification`을 fire. `isFirstOfDay`는 이미 계산되는 `todayWasNewDay`. displayName은 직접입력 모드에서도 필요하므로 fetch를 분기 밖으로 hoist한다.

- [ ] **Step 1: spec에 완료 푸시 mock + 단언 추가 (실패 케이스)**

`src/app/(app)/challenge/[id]/action/_actions.spec.ts`의 `mocks` hoisted 객체(라인 4-18)에 `dispatchActionCompletedNotification` 추가:

```ts
const mocks = vi.hoisted(() => ({
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "owner@test.local",
  },
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
  uploadPhoto: vi.fn(),
  deletePhoto: vi.fn(),
  track: vi.fn().mockResolvedValue(undefined),
  generateDiary: vi.fn(),
  userProfile: vi.fn(),
  dispatchActionCompletedNotification: vi.fn().mockResolvedValue({
    recipientCount: 1,
    quietHours: false,
  }),
}));
```

`next/cache` mock(라인 45-48) 아래에 `next/server`의 `after`와 push dispatch mock 추가:

```ts
// after(cb) 는 request 컨텍스트 의존 — 테스트에서는 콜백을 즉시 실행.
vi.mock("next/server", () => ({
  after: (cb: () => unknown) => {
    void cb();
  },
}));

vi.mock("@/lib/push/dispatch", () => ({
  dispatchActionCompletedNotification: (...args: unknown[]) =>
    mocks.dispatchActionCompletedNotification(...args),
}));
```

`beforeEach`(라인 137-149)의 끝(`stubDb();` 직전)에 mock 리셋 추가:

```ts
mocks.dispatchActionCompletedNotification.mockResolvedValue({
  recipientCount: 1,
  quietHours: false,
});
```

`describe("submitActionLog", ...)` 안에 새 describe 블록 추가 (마지막 `});` 직전, 즉 `describe("verifiedDays & goalReached", ...)` 블록 뒤):

```ts
describe("완료 푸시 (friend_action)", () => {
  it("제출 성공 후 dispatchActionCompletedNotification을 actor·activityType·isFirstOfDay로 호출", async () => {
    await submitActionLog(makeFormData());
    expect(mocks.dispatchActionCompletedNotification).toHaveBeenCalledWith(
      challengeId,
      { userId: mocks.user.id, displayName: "지우" },
      { activityType: "gym", isFirstOfDay: true },
    );
  });

  it("같은 날 재제출(priorLogs에 오늘 포함)이면 isFirstOfDay=false", async () => {
    stubDb({ priorLogs: [new Date().toISOString()] });
    await submitActionLog(makeFormData());
    expect(mocks.dispatchActionCompletedNotification).toHaveBeenCalledWith(
      challengeId,
      expect.anything(),
      expect.objectContaining({ isFirstOfDay: false }),
    );
  });

  it("display_name이 없으면 '친구'로 폴백", async () => {
    mocks.userProfile.mockResolvedValue({ data: null, error: null });
    await submitActionLog(makeFormData());
    expect(mocks.dispatchActionCompletedNotification).toHaveBeenCalledWith(
      challengeId,
      { userId: mocks.user.id, displayName: "친구" },
      expect.anything(),
    );
  });

  it("직접 입력 모드(memo)에서도 완료 푸시를 보낸다", async () => {
    await submitActionLog(makeDirectFormData("오늘 직접 쓴 일기"));
    expect(mocks.dispatchActionCompletedNotification).toHaveBeenCalledWith(
      challengeId,
      { userId: mocks.user.id, displayName: "지우" },
      { activityType: "gym", isFirstOfDay: true },
    );
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test "src/app/(app)/challenge/[id]/action/_actions.spec.ts"`
Expected: FAIL — `dispatchActionCompletedNotification` 미호출 + 직접입력 모드는 현재 profile 미조회라 displayName 폴백 단언 실패.

- [ ] **Step 3: `action/_actions.ts` import 추가**

라인 3 `import { revalidatePath, updateTag } from "next/cache";` 아래에 추가:

```ts
import { after } from "next/server";
```

라인 15 `import { toKstDayKey, dayIndexOf } from "@/lib/challenge/done-days";` 아래에 추가:

```ts
import { dispatchActionCompletedNotification } from "@/lib/push/dispatch";
```

- [ ] **Step 4: displayName fetch를 분기 밖으로 hoist**

라인 130-167의 직접/AI 분기를 수정 — profile 조회를 분기 **앞**으로 빼고 양쪽에서 재사용:

```ts
// 직접 입력 일기(spec 2026-05-28-action-manual-diary): memo 가 채워졌으면 AI 를
// 건너뛰고 입력 글을 그대로 일기로 저장하며, 키워드는 무시한다(selected_keywords=[]).
const isDirect = Boolean(parsed.input.memo);
const finalKeywords = isDirect ? [] : parsed.input.selectedKeywords;

// display_name 은 (a) AI 템플릿 fallback 1인칭 톤, (b) 완료 푸시 작성자명 둘 다에 쓰인다.
// 직접 입력 모드에서도 푸시용으로 필요하므로 분기 밖에서 1회 조회. RLS users_select_self 허용.
const { data: profile } = await supabase
  .from("users")
  .select("display_name")
  .eq("id", user.id)
  .maybeSingle();
const pushDisplayName = profile?.display_name?.trim() || "친구";

let aiSummary: string;
let templateFallback: boolean;
let promptVersion: string;
let aiResult: DiaryResult | null = null;

if (parsed.input.memo) {
  aiSummary = parsed.input.memo;
  templateFallback = false;
  promptVersion = "manual";
} else {
  // meal 만 업로드 시각(now)으로 끼니 추론 — soft context 라 DB/analytics 미저장, 프롬프트에만 주입.
  const mealSlot = parsed.input.activityType === "meal" ? inferMealSlot(now) : undefined;

  aiResult = await generateDiary(
    {
      activityType: parsed.input.activityType,
      keywords: parsed.input.selectedKeywords,
      mealSlot,
    },
    { displayName: profile?.display_name ?? undefined },
  );
  aiSummary = aiResult.summary;
  templateFallback = aiResult.fallback;
  promptVersion = aiResult.promptVersion;
}
```

> 주의: `generateDiary`의 `displayName`은 기존과 동일하게 `profile?.display_name ?? undefined`를 유지한다(기존 테스트 `passes undefined displayName when profile is missing` 보존). 푸시는 `pushDisplayName`("친구" 폴백)을 쓴다. 기존 코드의 AI 분기 내부 profile 조회(`const { data: profile } = ...`)는 이 hoist로 대체되므로 **분기 내부의 중복 조회를 반드시 제거**한다.

- [ ] **Step 5: 제출 성공 후 완료 푸시 fire**

라인 260-279 `revalidatePath(...)` 호출 직전(또는 직후, `return success(...)` 앞)에 추가:

```ts
// PRD §6.4 — 그룹원에게 인증 완료 push (본인 제외). after() 로 응답 latency 와 분리.
// 매 제출마다 발송하되 그 날 첫 인증(todayWasNewDay)/재제출 문구를 분기한다.
after(() =>
  dispatchActionCompletedNotification(
    parsed.input.challengeId,
    { userId: user.id, displayName: pushDisplayName },
    { activityType: parsed.input.activityType, isFirstOfDay: todayWasNewDay },
  ).catch((e) => {
    console.error("[submitActionLog] completion dispatch failed", e);
  }),
);
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `pnpm test "src/app/(app)/challenge/[id]/action/_actions.spec.ts"`
Expected: PASS (기존 테스트 포함 — `passes users.display_name into generateDiary` 등도 통과)

- [ ] **Step 7: 커밋**

```bash
git add "src/app/(app)/challenge/[id]/action/_actions.ts" "src/app/(app)/challenge/[id]/action/_actions.spec.ts"
git commit -m "feat(action): 제출 완료 시 그룹원에게 활동별 인증 완료 푸시 발송"
```

---

## Task 5: 알림 설정 토글 라벨 변경

**Files:**

- Modify: `src/app/(app)/me/_components/push-settings.tsx:135-140`
- Test: `src/app/(app)/me/_components/push-settings.spec.tsx`

배경: `start` 키가 "챌린지 시작 + 친구 인증 완료" 둘 다 게이팅하므로 라벨을 포괄어로.

- [ ] **Step 1: 토글 라벨 수정**

`src/app/(app)/me/_components/push-settings.tsx` 라인 135-140의 첫 Toggle을 수정:

```tsx
<Toggle
  label="그룹 활동 알림"
  description="챌린지 시작과 친구 인증을 알려드려요"
  checked={prefs.start}
  onChange={(v) => handlePrefChange("start", v)}
/>
```

- [ ] **Step 2: push-settings 테스트의 접근성 이름 단언 갱신 (필수)**

`push-settings.spec.tsx`는 시작 알림 토글을 `screen.findByRole("switch", { name: "시작 알림" })`로 찾는다(7곳). Toggle의 `label`이 switch의 accessible name이므로 라벨 변경 시 7곳 모두 깨진다. 전부 `"그룹 활동 알림"`으로 치환:

Run: `sed -i '' 's/name: "시작 알림"/name: "그룹 활동 알림"/g' "src/app/(app)/me/_components/push-settings.spec.tsx"`

치환 확인:

Run: `rg -n "시작 알림|그룹 활동 알림" "src/app/(app)/me/_components/push-settings.spec.tsx"`
Expected: `시작 알림` 매치 0건, `그룹 활동 알림` 7건.

- [ ] **Step 3: 회귀 테스트**

Run: `pnpm test "src/app/(app)/me/_components/push-settings.spec.tsx"`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add "src/app/(app)/me/_components/push-settings.tsx" "src/app/(app)/me/_components/push-settings.spec.tsx"
git commit -m "feat(me): 알림 설정 토글 라벨 '그룹 활동 알림'으로 통합 (start 키 재사용)"
```

---

## Task 6: 결과 모달 문구 활동별 분기

**Files:**

- Create: `src/app/(app)/challenge/[id]/action/_components/action-result-copy.ts`
- Create: `src/app/(app)/challenge/[id]/action/_components/action-result-copy.spec.ts`
- Modify: `src/app/(app)/challenge/[id]/action/_components/action-result-dialog.tsx:13-45, 62-69, 106-143`

배경: 결과 모달 "오늘 운동 인증 완료!"·"첫 운동 인증 성공!"을 활동별로. `other`(기타)는 활동명 생략. pure 헬퍼로 분리해 node 테스트.

- [ ] **Step 1: 문구 헬퍼 테스트 작성 (실패 케이스)**

`src/app/(app)/challenge/[id]/action/_components/action-result-copy.spec.ts` 생성:

```ts
import { describe, expect, it } from "vitest";
import { completedTitle, firstSuccessTitle } from "./action-result-copy";

describe("action-result-copy", () => {
  it("completedTitle: 활동별 라벨 포함", () => {
    expect(completedTitle("gym")).toBe("오늘 헬스 인증 완료!");
    expect(completedTitle("running")).toBe("오늘 러닝 인증 완료!");
    expect(completedTitle("meal")).toBe("오늘 식단 인증 완료!");
  });

  it("completedTitle: other는 활동명 생략", () => {
    expect(completedTitle("other")).toBe("오늘 인증 완료!");
  });

  it("firstSuccessTitle: 활동별 라벨 포함", () => {
    expect(firstSuccessTitle("yoga")).toBe("첫 요가 인증 성공!");
  });

  it("firstSuccessTitle: other는 활동명 생략", () => {
    expect(firstSuccessTitle("other")).toBe("첫 인증 성공!");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test "src/app/(app)/challenge/[id]/action/_components/action-result-copy.spec.ts"`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 문구 헬퍼 구현**

`src/app/(app)/challenge/[id]/action/_components/action-result-copy.ts` 생성:

```ts
import type { ActivityType } from "@/lib/keywords/pool";

// 결과 모달용 활동 명사(이모지 없음). other(기타)는 활동명을 생략하고 중립 문구를 쓴다.
const ACTIVITY_NOUN: Partial<Record<ActivityType, string>> = {
  running: "러닝",
  gym: "헬스",
  yoga: "요가",
  meal: "식단",
};

export function completedTitle(activityType: ActivityType): string {
  const noun = ACTIVITY_NOUN[activityType];
  return noun ? `오늘 ${noun} 인증 완료!` : "오늘 인증 완료!";
}

export function firstSuccessTitle(activityType: ActivityType): string {
  const noun = ACTIVITY_NOUN[activityType];
  return noun ? `첫 ${noun} 인증 성공!` : "첫 인증 성공!";
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test "src/app/(app)/challenge/[id]/action/_components/action-result-copy.spec.ts"`
Expected: PASS

- [ ] **Step 5: 결과 모달에 activityType 적용**

`action-result-dialog.tsx` 상단 import에 추가 (라인 13 `import { ConfettiBurst } ...` 아래):

```tsx
import type { ActivityType } from "@/lib/keywords/pool";
import { completedTitle, firstSuccessTitle } from "./action-result-copy";
```

`ActionResultDialogProps`(라인 17-31)에 `activityType` 추가:

```tsx
interface ActionResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: ActionResultVariant;
  challengeId: string;
  // completed / first-success 활동별 문구용
  activityType?: ActivityType;
  // completed / goal-reached variant 전용
  currentDay?: number;
  totalDays?: number;
  verifiedDays?: number[];
  goalCount?: number;
  // failed variant 전용 — #35 결정 후 채움
  penaltyAdded?: number;
  penaltyTotal?: number;
  failedDateLabel?: string;
}
```

함수 구조분해(라인 33-45)에 `activityType` 추가:

```tsx
export function ActionResultDialog({
  open,
  onOpenChange,
  variant,
  challengeId,
  activityType = "other",
  currentDay,
  totalDays,
  verifiedDays,
  goalCount,
  penaltyAdded,
  penaltyTotal,
  failedDateLabel,
}: ActionResultDialogProps) {
```

`CompletedBody`·`FirstSuccessBody` 렌더(라인 62-69)에 activityType 전달:

```tsx
{
  variant === "completed" && (
    <CompletedBody
      activityType={activityType}
      currentDay={currentDay ?? 1}
      totalDays={totalDays ?? 1}
      verifiedDays={verifiedDays ?? []}
    />
  );
}
{
  variant === "first-success" && <FirstSuccessBody activityType={activityType} />;
}
```

`CompletedBody`(라인 106-129)와 `FirstSuccessBody`(라인 131-143)를 수정:

```tsx
function CompletedBody({
  activityType,
  currentDay,
  totalDays,
  verifiedDays,
}: {
  activityType: ActivityType;
  currentDay: number;
  totalDays: number;
  verifiedDays: number[];
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="bg-brand-primary-soft text-primary flex size-[70px] items-center justify-center rounded-full">
        <Check className="size-9" aria-hidden="true" />
      </div>
      <DialogTitle className="t-h2">{completedTitle(activityType)}</DialogTitle>
      <DialogDescription className="t-sub leading-relaxed">
        매일 한 걸음씩 쌓이고 있어요 💪
      </DialogDescription>
      <div className="mt-3 w-full">
        <DaySlider totalDays={totalDays} currentDay={currentDay} verifiedDays={verifiedDays} />
      </div>
    </div>
  );
}

function FirstSuccessBody({ activityType }: { activityType: ActivityType }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="bg-brand-secondary-soft flex size-[80px] items-center justify-center rounded-full text-[34px]">
        🎉
      </div>
      <DialogTitle className="t-h2">{firstSuccessTitle(activityType)}</DialogTitle>
      <DialogDescription className="t-sub leading-relaxed">
        이제부터 매일 인증을 이어가보세요 💪
      </DialogDescription>
    </div>
  );
}
```

- [ ] **Step 6: 타입체크**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add "src/app/(app)/challenge/[id]/action/_components/action-result-copy.ts" "src/app/(app)/challenge/[id]/action/_components/action-result-copy.spec.ts" "src/app/(app)/challenge/[id]/action/_components/action-result-dialog.tsx"
git commit -m "feat(action): 결과 모달 인증 완료/첫 성공 문구 활동별 분기"
```

---

## Task 7: 폼 진입 헤딩 중립화 + result에 activityType 전달 + 페이지 헤딩

**Files:**

- Modify: `src/app/(app)/challenge/[id]/action/_components/action-form.tsx:110-117, 277-289, 305, 466-475`
- Modify: `src/app/(app)/challenge/[id]/action/page.tsx:11, 50`

배경: `ActionResultDialog`에 `activityType`을 넘기려면 `ResultState`에 담아야 한다. 폼 진입 헤딩은 활동 선택 **전** 화면이라 중립 문구로. 페이지 헤딩 "AI 운동일기"→"AI 일기".

> 참고(의도된 결정): "폼 진입 헤딩"(empty state, 사진 선택 전)은 활동 종류 선택 UI보다 먼저 노출되므로 활동을 알 수 없다. 따라서 활동별 분기 대신 중립 "오늘의 활동을 인증하세요"로 둔다. 활동별 실시간 분기는 활동 정보가 확정된 **결과 모달**(Task 6)에 적용된다.

- [ ] **Step 1: ResultState에 activityType 추가**

`action-form.tsx` `ResultState` interface(라인 110-117)에 추가:

```tsx
interface ResultState {
  open: boolean;
  variant: ActionResultVariant;
  activityType?: ActivityType;
  currentDay?: number;
  totalDays?: number;
  verifiedDays?: number[];
  goalCount?: number;
}
```

- [ ] **Step 2: setResult에 activityType 전달**

`submit()` 내 `setResult({...})`(라인 277-289)에 `activityType` 추가:

```tsx
setResult({
  open: true,
  // 우선순위: goal-reached > first-success > completed
  variant: res.data.goalReached
    ? "goal-reached"
    : res.data.isFirstAction
      ? "first-success"
      : "completed",
  activityType,
  currentDay: res.data.currentDay,
  totalDays: res.data.totalDays,
  verifiedDays: res.data.verifiedDays,
  goalCount: res.data.goalCount,
});
```

- [ ] **Step 3: ActionResultDialog에 activityType 전달**

라인 466-475의 `<ActionResultDialog ...>`에 추가:

```tsx
<ActionResultDialog
  open={result.open}
  onOpenChange={(open) => setResult((prev) => ({ ...prev, open }))}
  variant={result.variant}
  challengeId={challengeId}
  activityType={result.activityType}
  currentDay={result.currentDay}
  totalDays={result.totalDays}
  verifiedDays={result.verifiedDays}
  goalCount={result.goalCount}
/>
```

- [ ] **Step 4: 진입 헤딩 중립화**

라인 305의 헤딩을 수정:

```tsx
<h2 className="t-h3">오늘의 활동을 인증하세요</h2>
```

- [ ] **Step 5: 페이지 헤딩 변경**

`action/page.tsx` 라인 50을 수정:

```tsx
<h1 className="t-h2">AI 일기</h1>
```

같은 파일 라인 11의 주석도 정확성 위해 수정:

```tsx
// 모킹업 §10 — AI 일기 + 결과 모달. ADR-0002에 따라 /action → /challenge/[id]/action sub-route.
```

- [ ] **Step 6: 타입체크 + 회귀 테스트**

Run: `pnpm typecheck`
Expected: PASS

Run: `pnpm test "src/app/(app)/challenge/[id]/action"`
Expected: PASS

- [ ] **Step 7: 잔여 "운동" 문구 확인 (버킷 A 누락 점검)**

Run: `rg "운동" "src/app/(app)/challenge/[id]/action"`
Expected: 결과 없음 (action sub-route 내 사용자 노출 "운동" 문구가 모두 정리됨). 남으면 의도 확인 후 처리.

- [ ] **Step 8: 커밋**

```bash
git add "src/app/(app)/challenge/[id]/action/_components/action-form.tsx" "src/app/(app)/challenge/[id]/action/page.tsx"
git commit -m "feat(action): 진입 헤딩 중립화 + 결과 모달 activityType 연결 + 'AI 일기' 헤딩"
```

---

## Task 8: PRD 갱신 (§6.2 표 · AC-2 · §6.4 Edge)

**Files:**

- Modify: `docs/PRD.md:356, 359, 365, 380`

배경: 코드를 PRD에 맞추는 게 아니라, 재설계된 동작에 맞춰 PRD를 갱신한다(PO 승인됨). §6.2 표의 `start`/`friend_action` 행, AC-2, §6.4 edge를 현실과 정합.

- [ ] **Step 1: §6.2 표 `start`·`friend_action` 행 수정**

`docs/PRD.md` 라인 356의 `start` 행을 수정 (트리거를 "챌린지 활성화"로 — 진입 FAB 푸시는 폐기):

```markdown
| **리마인더** | `start` | 전원 서명 완료로 챌린지 활성화 | 그룹원 전체 | "챌린지 시작이에요 / 오늘부터 시작!" |
```

라인 359의 `friend_action` 행을 수정 (트리거를 "제출 완료", 문구를 활동별로):

```markdown
| **친구 인증** | `friend_action` | 그룹원이 사진 인증 **제출 완료** (매 제출) | 그룹원 중 본인 제외 | "🏋️ 헬스 인증! / JJ님이 오늘 인증을 완료했어요 💪" (재제출 시 "🏋️ 헬스 또! / JJ님이 한 번 더 인증했어요") |
```

> 표 바로 아래에 한 줄 메모 추가 (라인 360 뒤):
>
> ```markdown
> > `start`·`friend_action` 푸시는 모두 `notification_prefs.start` 키로 옵트인 게이팅(설정 "그룹 활동 알림"). 알림센터 분류는 `category` 가 결정한다(`start`→리마인더, `friend_action`→친구 인증 탭). 게이팅 축과 분류 축은 독립.
> ```

- [ ] **Step 2: AC-2 수정**

라인 365의 AC-2를 수정:

```markdown
- **AC-2** 친구 인증 완료 알림은 **매 제출마다** 발송하되, 그 날 첫 인증과 재제출 문구를 구분한다. 챌린지 시작(활성화) 알림은 활성화 시 1회. (둘 다 Quiet Hours 02–07 KST suppress, `start` 옵트인 키로 게이팅.)
```

- [ ] **Step 3: §6.4 Edge 수정**

라인 380 `| 같은 사용자가 시작 탭을 1일 여러 번 | 첫 탭만 알림 발송, 이후는 서버 no-op |` 행을 수정:

```markdown
| 같은 사용자가 하루 여러 번 제출 | 매 제출마다 완료 알림 발송(첫 인증/재제출 문구 구분). `action_started` 분석 이벤트는 1일 1회. |
```

- [ ] **Step 4: 문서 링크 검증**

Run: `pnpm validate:docs`
Expected: PASS (내부 링크 깨짐 없음)

- [ ] **Step 5: 커밋**

```bash
git add docs/PRD.md
git commit -m "docs(prd): §6.2 friend_action 제출완료 트리거·활동별 문구로 갱신 (AC-2·§6.4 정합)"
```

---

## Task 9: spec 문서 작성 (analytics 변경 근거)

**Files:**

- Create: `docs/superpowers/specs/2026-05-29-friend-completion-push.md`

배경: AGENTS §4 — `src/lib/analytics/track.ts` 변경은 **spec 필수**. 결정 근거를 보존한다.

- [ ] **Step 1: spec 문서 생성**

`docs/superpowers/specs/2026-05-29-friend-completion-push.md` 생성:

```markdown
# Spec: 친구 인증 완료 푸시 재설계

- **Date:** 2026-05-29
- **Author:** pistachio8
- **Status:** Accepted
- **관련 PRD:** §6.2 / §6.4 / §9.1
- **관련 plan:** docs/superpowers/plans/2026-05-29-friend-completion-push.md

## 문제

친구에게 가는 푸시가 "인증 화면 진입(mount)" 시점에 "{name}님이 운동을 시작했어요!"로 발송되고, 정작 사진 인증 **완료** 시에는 그룹원 푸시가 없었다. PRD §6.4가 정의한 `friend_action`(인증 완료) 푸시가 미구현이었고, `meal`(식단) 등 비-운동 활동에도 "운동" 문구가 노출됐다.

## 결정

1. 트리거를 인증 화면 진입(`markActionStarted`) → 사진 제출 완료(`submitActionLog` 성공 후 `after()`)로 이동.
2. `action_started` 분석 이벤트와 1일 1회 idempotency는 진입 시점에 유지(분석 dedupe). 푸시 dispatch만 분리.
3. 완료 푸시는 매 제출마다 발송하되, 그 날 첫 인증(`todayWasNewDay`)/재제출 문구를 분기. 활동 종류별 title.
4. `notification_sent.type`·`notification_opened.type` enum에 `friend_action` 추가.
5. 옵트인 게이팅은 기존 `notification_prefs.start` 키 재사용(신규 키·DB migration 불필요). 알림센터 분류는 `category:"friend_action"` 유지. → 게이팅 축과 분류 축은 독립.

## Analytics 변경 (PRD §9.1 동기화)

- `notification_sent.props.type`: `start | deadline | kudos_received` → `start | deadline | friend_action | kudos_received`
- `notification_opened.props.type`: `start | deadline` → `start | deadline | friend_action`
- 완료 푸시의 `notification_sent`는 게이팅 키(`start`)와 무관하게 `type:"friend_action"`으로 기록(dispatch의 `trackType` 분리).

## 대안 (기각)

- **활동 중립 단일 문구**: 단순하지만 식단/요가 등에서 정보량 부족. 활동별 분기 채택.
- **신규 `friend_action` prefs 키 추가**: zod SoT 변경 + 기존 user row JSONB 기본값 마이그레이션 필요. POC 범위 초과 → `start` 재사용.
- **제출당이 아닌 1일 1회 발송**: "쟤 했네 나도" 사회적 압박 효과 약화. 재제출 문구 분기로 스팸감 완화하며 매 제출 발송 채택.

## 범위 밖

- `/api/push/opened` 라우트 부재(기존 죽은 경로) — 별도 이슈.
```

- [ ] **Step 2: 문서 링크 검증**

Run: `pnpm validate:docs`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add docs/superpowers/specs/2026-05-29-friend-completion-push.md
git commit -m "docs(spec): 친구 인증 완료 푸시 재설계 결정 근거 기록"
```

---

## Task 10: 전체 검증

**Files:** (없음 — 검증만)

- [ ] **Step 1: 타입체크**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 2: 린트**

Run: `pnpm lint`
Expected: PASS (미사용 import 없음)

- [ ] **Step 3: 전체 단위 테스트**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 4: 문서 링크**

Run: `pnpm validate:docs`
Expected: PASS

- [ ] **Step 5: 잔여 "운동" 사용자 노출 문구 최종 점검 (버킷 A 한정)**

Run: `rg -n "운동" "src/app/(app)/challenge/[id]/action" src/lib/push/dispatch.ts`
Expected: 결과 없음. (layout 메타·초대·온보딩·서약서 등 버킷 B 브랜딩은 PRD 의도라 범위 밖 — 손대지 않음)

- [ ] **Step 6: 모바일 viewport 수동 확인 (선택, 권장)**

`pnpm dev` → `http://localhost:3000` → 챌린지 인증 제출 → 결과 모달이 선택 활동별 문구로 뜨는지 확인. 둘째 디바이스(또는 테스트 계정 wjaden0107@gmail.com)로 그룹원 완료 푸시 수신 확인.

- [ ] **Step 7: PR 생성 (사용자 확인 후)**

```bash
git push -u origin feat/friend-completion-push
gh pr create --base develop --fill
```

(자동 push·PR은 사용자 확인 후에만. git 계정 pistachio8 고정.)

---

## Self-Review

**1. Spec coverage:**

- 트리거 이동(진입→제출완료): Task 3(제거) + Task 4(추가) ✓
- action_started 분석 유지: Task 3 (idempotency·track 유지) ✓
- 매 제출 발송 + 첫/재 문구 분기: Task 2(문구 맵) + Task 4(isFirstOfDay=todayWasNewDay) ✓
- 활동별 title + 공통 body: Task 2 ✓
- 함수 rename + activityType/isFirstOfDay 인자: Task 2 ✓
- payload friend_action/friend_action 유지: Task 2 ✓
- start 키 재사용 + 토글 라벨: Task 5 ✓
- Quiet hours suppress: Task 2 (dispatch 내 isQuietHoursKST 그대로) ✓
- analytics enum friend_action: Task 1 ✓
- 인앱 결과 모달/폼 헤딩/페이지 헤딩: Task 6·7 ✓
- PRD 갱신: Task 8 ✓
- spec 작성: Task 9 ✓
- 기존 테스트 수정(dispatch.spec, mark-action-started.spec): Task 2·3 ✓
- 죽은 /api/push/opened: 범위 밖 명시 ✓

**2. Placeholder scan:** 모든 코드 step에 완전한 코드 블록 포함. "적절히 처리" 류 없음. ✓

**3. Type consistency:**

- `dispatchActionCompletedNotification(challengeId, actor:{userId,displayName}, options:{activityType,isFirstOfDay})` — Task 2 정의, Task 4 호출 시그니처 일치 ✓
- `NotificationSentType` = `"start"|"deadline"|"friend_action"` — Task 2 dispatch.ts, Task 1 analytics enum 일치 ✓
- `completedTitle`/`firstSuccessTitle(activityType)` — Task 6 정의·테스트·dialog 사용 일치 ✓
- `markActionStarted` 반환 `{ skipped: boolean }` — Task 3 정의·spec 일치, 호출처 `void`라 무영향(Task 3 Step 5에서 확인) ✓
- `isFirstOfDay` ↔ `todayWasNewDay`(submitActionLog 기존 계산값) 매핑 명시 ✓
