# 전원 서명 완료 → 오너 시작 nudge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 그룹 전원이 서약서에 서명을 마치면, 마지막 서명자가 멤버일 때 오너에게 "전원 서명 완료" 푸시를 1회 보내 1탭으로 챌린지를 시작하도록 유도한다(자동 시작 아님).

**Architecture:** 자동 활성화는 [ADR-0009](../../adr/0009-pending-invite-explicit-start.md)의 "늦은 가입자 코호트 freeze" 버그를 재발시키므로 채택하지 않는다. 대신 ① 서명 RPC(`sign_and_maybe_activate`)가 서명 직후 "전원 서명 && 참가자 ≥2 && 마지막 서명자가 오너 아님"을 atomic하게 판정해 `should_nudge_owner`를 반환하고, ② Server Action(`signPledge`)이 `after()`로 오너 1명에게만 푸시를 보낸다. 중복은 `challenges.start_nudge_sent_at` 컬럼 + RPC 내 `for update` lock으로 정확히 1회 보장한다. 오너가 마지막 서명자인 경우는 푸시 없이 기존 인앱 `StartChallengeCard`로 처리한다. 푸시 옵트인은 기존 `start` prefs 키를 재사용해 스키마 변경을 만들지 않는다.

**Tech Stack:** Next.js 16 (App Router · RSC · `after()`) · Supabase Postgres (PL/pgSQL `security definer` RPC) · TypeScript · Vitest · zod · Web Push(VAPID)

---

## 사전 컨텍스트 (구현 전 필독)

이 plan은 grill-me 인터뷰로 합의된 설계를 구현한다. base는 `origin/develop`(워크트리 `/Users/ian/gitlab/with-key-all-signed-nudge`, 브랜치 `feat/challenge-all-signed-nudge`).

**develop 기준 사실 (검증된 값):**

- migration 최신 = `0039_challenge_end_at_kst_midnight.sql` → **신규 migration은 `0040`**.
- ADR 최신 = `0027-derived-over-autoclose.md` → **신규 ADR은 `0028`**.
- `sign_and_maybe_activate` 최신 정의 = `0028_pending_invite_start_flow.sql`(13–54줄). `0039`는 `start_challenge_with_signed_participants`만 건드렸다(서명 RPC 미변경) — 이 plan의 base 정의.
- `notification_sent.type` union = `"start" | "deadline" | "friend_action" | "kudos_received"` → **`"start"` 재사용 시 `track.ts`·zod 스키마 변경 불필요**.
- `notificationPrefsSchema` = `{ start, deadline, kudos }`(`src/lib/validators/push.ts:10`) — 변경 없음. nudge는 `start` 키 게이팅.
- `dispatch.ts`에 `trackType` 옵션과 kudos 1:1 발송 패턴(`dispatchKudosReceivedNotification`, 217–334줄)이 이미 있다 — nudge 함수의 템플릿.

**D-day 작업과의 충돌:** D-day(`start_challenge_with_signed_participants` · `al_insert_self_active` RLS · 표시 레이어)와 nudge(`sign_and_maybe_activate` · `challenges` 컬럼 · `dispatch` · info 카드)는 **DB 객체·파일 교집합이 0**이다. 유일한 조율점은 migration 번호(nudge=0040 고정)와 `types/supabase.ts`(자동 생성 — 머지 후 재생성으로 해소). **D-day 세션은 `sign_and_maybe_activate`를 건드리지 않는다**는 전제만 지키면 독립이다.

## File Structure

| 파일                                                                     | 책임                                                                                             | 작업                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------- |
| `supabase/migrations/0040_all_signed_owner_nudge.sql`                    | `challenges.start_nudge_sent_at` 컬럼 + `sign_and_maybe_activate` 재정의(lock·카운트·nudge 판정) | Create                       |
| `src/types/supabase.ts`                                                  | DB 타입(자동 생성)                                                                               | Regenerate (`pnpm db:types`) |
| `src/lib/push/dispatch.ts`                                               | `dispatchOwnerStartNudge` 단일 유저 푸시 함수                                                    | Modify                       |
| `src/lib/push/dispatch.nudge.spec.ts`                                    | nudge 푸시 단위 테스트                                                                           | Create                       |
| `src/app/(app)/challenge/[id]/pledge/_actions.ts`                        | `signPledge`가 `should_nudge_owner` 시 `after()`로 nudge dispatch                                | Modify                       |
| `src/app/(app)/challenge/[id]/pledge/_actions.spec.ts`                   | nudge dispatch 분기 테스트 추가                                                                  | Modify                       |
| `src/app/(app)/challenge/[id]/_components/start-challenge-card.tsx`      | `unsignedCount===0` "전원 서명 완료" 강조                                                        | Modify                       |
| `src/app/(app)/challenge/[id]/_components/start-challenge-card.spec.tsx` | 카드 강조 분기 테스트                                                                            | Create                       |
| `src/app/(app)/challenge/[id]/(tabs)/info/page.tsx`                      | `startSlot` 중복 제거(layout 헤더 카드만 유지)                                                   | Modify                       |
| `src/app/(app)/challenge/[id]/_components/info-tab.tsx`                  | `startSlot` prop 제거                                                                            | Modify                       |
| `docs/adr/0028-all-signed-owner-start-nudge.md`                          | 설계 결정 기록                                                                                   | Create                       |

---

## Task 1: Migration — `start_nudge_sent_at` 컬럼 + `sign_and_maybe_activate` 재정의

**Files:**

- Create: `supabase/migrations/0040_all_signed_owner_nudge.sql`
- Regenerate: `src/types/supabase.ts`

RPC는 단위 테스트가 어려우므로 이 Task는 `db reset` 적용 + psql 시나리오로 검증하고, 동작 단위 검증은 Task 3(`signPledge` 테스트)에서 RPC 반환을 mock해 커버한다.

- [ ] **Step 1: Migration 파일 작성**

`supabase/migrations/0040_all_signed_owner_nudge.sql`:

```sql
-- 0040_all_signed_owner_nudge.sql
--
-- Decision: ADR-0028 — 전원 서명 완료 시 오너에게 시작 nudge(자동 시작 아님).
--
--   sign_and_maybe_activate 는 서명만 기록하던 것을 유지하되(ADR-0009: 자동 활성화 없음),
--   서명 직후 "전원 서명 && 참가자>=2 && 마지막 서명자가 오너 아님" 을 atomic 판정해
--   should_nudge_owner 를 반환한다. 중복 발송은 challenges.start_nudge_sent_at +
--   challenge row 의 for update lock 으로 정확히 1회 보장.
--
--   start_challenge_with_signed_participants(0039) 는 건드리지 않는다 — D-day 작업과 분리.
--   forward-only(down 없음).

alter table public.challenges
  add column if not exists start_nudge_sent_at timestamptz;

-- 반환 시그니처가 바뀌므로 create or replace 불가 → drop 후 재생성(0028 패턴).
drop function if exists public.sign_and_maybe_activate(uuid);

create function public.sign_and_maybe_activate(p_challenge_id uuid)
returns table (
  status text,
  start_at timestamptz,
  end_at timestamptz,
  participant_count int,
  challenge_created_at timestamptz,
  signed_count int,
  owner_user_id uuid,
  should_nudge_owner boolean
)
language plpgsql security definer
set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_is_participant boolean;
  v_total int;
  v_signed int;
  v_should_nudge boolean := false;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  -- challenge row 를 lock 해 동시 서명 직렬화(nudge atomic 보장) + owner 조회.
  select g.owner_id into v_owner
    from public.challenges c
    join public.groups g on g.id = c.group_id
    where c.id = p_challenge_id
      and c.status in ('pending','accepted')
    for update of c;

  if not found then
    raise exception 'not a pending challenge' using errcode = '42501';
  end if;

  select exists(
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = v_uid
  ) into v_is_participant;

  if not v_is_participant then
    raise exception 'not a participant' using errcode = '42501';
  end if;

  -- 서명 기록(멱등 — 이미 서명했으면 timestamp 유지).
  update public.challenge_participants
    set signed_at = coalesce(signed_at, now())
    where challenge_id = p_challenge_id and user_id = v_uid;

  select
    count(*)::int,
    count(*) filter (where signed_at is not null)::int
    into v_total, v_signed
    from public.challenge_participants
    where challenge_id = p_challenge_id;

  -- nudge 판정: 전원 서명 + 참가자>=2 + 마지막 서명자가 오너 아님.
  -- start_nudge_sent_at IS NULL 일 때만 set → 정확히 1회(row 는 위에서 lock 중).
  if v_signed = v_total and v_total >= 2 and v_uid <> v_owner then
    update public.challenges
      set start_nudge_sent_at = now()
      where id = p_challenge_id and start_nudge_sent_at is null;
    if found then
      v_should_nudge := true;
    end if;
  end if;

  return query
    select
      c.status,
      c.start_at,
      c.end_at,
      v_total,
      c.created_at,
      v_signed,
      v_owner,
      v_should_nudge
    from public.challenges c
    where c.id = p_challenge_id;
end;
$$;

revoke all on function public.sign_and_maybe_activate(uuid) from public, anon;
grant execute on function public.sign_and_maybe_activate(uuid) to authenticated, service_role;
```

- [ ] **Step 2: 로컬 Supabase에 적용**

Run: `pnpm supabase db reset`
Expected: 에러 없이 0001~0040 전부 적용. 마지막에 `Finished supabase db reset`.

- [ ] **Step 3: psql 시나리오로 RPC 동작 확인**

Run (로컬 Studio SQL editor 또는 psql) — 오너+멤버2명 pending 챌린지를 seed한 뒤:

```sql
-- (a) 멤버가 마지막으로 서명 → should_nudge_owner=true, signed_count=participant_count
select should_nudge_owner, signed_count, participant_count, owner_user_id
from sign_and_maybe_activate('<challenge_id>');  -- 마지막 미서명 멤버 세션
-- 기대: should_nudge_owner = true

-- (b) 같은 호출 재실행 → start_nudge_sent_at 이미 set → false
select should_nudge_owner from sign_and_maybe_activate('<challenge_id>');
-- 기대: should_nudge_owner = false
```

Expected: (a) `true`, (b) `false`. 오너가 마지막 서명자인 시나리오에서는 `v_uid = v_owner`라 항상 `false`.

- [ ] **Step 4: DB 타입 재생성**

Run: `pnpm db:types`
Expected: `src/types/supabase.ts`의 `challenges` Row에 `start_nudge_sent_at: string | null` 추가, `sign_and_maybe_activate` Returns에 `signed_count`·`owner_user_id`·`should_nudge_owner` 추가.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0040_all_signed_owner_nudge.sql src/types/supabase.ts
git commit -m "feat(challenge): sign RPC 에 전원 서명 nudge 판정 추가 (start_nudge_sent_at, ADR-0028)"
```

---

## Task 2: `dispatchOwnerStartNudge` — 오너 단일 유저 푸시

**Files:**

- Modify: `src/lib/push/dispatch.ts`
- Create: `src/lib/push/dispatch.nudge.spec.ts`

기존 `dispatch()`는 challenge 전체 참가자(`loadTargets`) 대상이라 nudge에 부적합하다. `dispatchKudosReceivedNotification`(217–334줄)의 단일 유저 패턴을 따르되, dedup은 RPC의 `start_nudge_sent_at`이 이미 보장하므로 dedup 테이블/보상 로직은 두지 않는다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/push/dispatch.nudge.spec.ts`:

```typescript
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  sendPush: vi.fn().mockResolvedValue(undefined),
  isQuietHoursKST: vi.fn().mockReturnValue(false),
  track: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/push/send", () => ({
  isQuietHoursKST: () => mocks.isQuietHoursKST(),
  sendPush: (...a: unknown[]) => mocks.sendPush(...a),
}));
vi.mock("@/lib/analytics/track", () => ({
  track: (...a: unknown[]) => mocks.track(...a),
}));

import { dispatchOwnerStartNudge } from "./dispatch";

const OWNER = "11111111-1111-4111-8111-111111111111";
const CH = "00000000-0000-4000-8000-000000000001";

// users.notification_prefs / push_subscriptions 조회를 테이블별로 분기하는 헬퍼.
function wireDb(opts: { prefs: unknown; subs: unknown[] }) {
  mocks.from.mockImplementation((table: string) => {
    if (table === "users") {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { notification_prefs: opts.prefs } }) }),
        }),
      };
    }
    if (table === "push_subscriptions") {
      return { select: () => ({ eq: async () => ({ data: opts.subs }) }) };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

beforeEach(() => {
  mocks.from.mockReset();
  mocks.sendPush.mockClear();
  mocks.track.mockClear();
  mocks.isQuietHoursKST.mockReturnValue(false);
});

describe("dispatchOwnerStartNudge", () => {
  it("오너가 start 옵트인 + 구독 있으면 푸시 1건 발송", async () => {
    wireDb({
      prefs: { start: true, deadline: false, kudos: false },
      subs: [{ user_id: OWNER, endpoint: "https://e", p256dh: "p", auth: "a" }],
    });
    const res = await dispatchOwnerStartNudge(CH, OWNER);
    expect(res.recipientCount).toBe(1);
    expect(mocks.sendPush).toHaveBeenCalledTimes(1);
    expect(mocks.track).toHaveBeenCalledTimes(1);
    const ev = mocks.track.mock.calls[0][0] as { name: string; props: { type: string } };
    expect(ev.name).toBe("notification_sent");
    expect(ev.props.type).toBe("start");
  });

  it("오너가 start 옵트아웃이면 미발송", async () => {
    wireDb({
      prefs: { start: false, deadline: false, kudos: false },
      subs: [{ user_id: OWNER, endpoint: "https://e", p256dh: "p", auth: "a" }],
    });
    const res = await dispatchOwnerStartNudge(CH, OWNER);
    expect(res.recipientCount).toBe(0);
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it("quiet hours 면 발송하지 않고 suppressed 트래킹", async () => {
    mocks.isQuietHoursKST.mockReturnValue(true);
    wireDb({
      prefs: { start: true, deadline: false, kudos: false },
      subs: [{ user_id: OWNER, endpoint: "https://e", p256dh: "p", auth: "a" }],
    });
    const res = await dispatchOwnerStartNudge(CH, OWNER);
    expect(res.quietHours).toBe(true);
    expect(mocks.sendPush).not.toHaveBeenCalled();
    const ev = mocks.track.mock.calls[0][0] as { props: { suppressed: boolean; outcome: string } };
    expect(ev.props.suppressed).toBe(true);
    expect(ev.props.outcome).toBe("suppressed");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test src/lib/push/dispatch.nudge.spec.ts`
Expected: FAIL — `dispatchOwnerStartNudge is not a function`(아직 export 안 됨).

- [ ] **Step 3: `dispatchOwnerStartNudge` 구현**

`src/lib/push/dispatch.ts` 끝(파일 마지막 `}` 다음)에 추가:

```typescript
// ADR-0028 — 전원 서명 완료(마지막 서명자가 멤버) 시 오너 1명에게 시작 nudge.
// dedup 은 challenges.start_nudge_sent_at(sign RPC atomic)이 보장 — 여기선 보내기만 한다.
// 옵트인은 기존 "start" prefs 키 재사용, 분석 type 도 "start"(notification_sent union 불변).
// 푸시 실패/미구독 시 인앱 StartChallengeCard 가 fallback 이므로 kudos 식 보상 로직은 두지 않는다.
export async function dispatchOwnerStartNudge(
  challengeId: string,
  ownerUserId: string,
): Promise<DispatchSummary> {
  const quietHours = isQuietHoursKST();
  const admin = adminClient();

  const { data: owner } = await admin
    .from("users")
    .select("notification_prefs")
    .eq("id", ownerUserId)
    .maybeSingle();
  const prefs = notificationPrefsSchema.safeParse(owner?.notification_prefs);
  if (!prefs.success || !prefs.data.start) {
    return { recipientCount: 0, quietHours };
  }

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
  if (targets.length === 0) {
    return { recipientCount: 0, quietHours };
  }

  const targetUrl = `/challenge/${challengeId}`;
  const payload: PushPayload = {
    title: "전원 서명 완료 🎉",
    body: "이제 챌린지를 시작할 수 있어요",
    url: targetUrl,
    type: "start",
    category: "reminder",
    targetUrl,
    challengeId,
  };

  await Promise.allSettled(
    targets.map(async (target) => {
      const outcome: Outcome = quietHours ? "suppressed" : await safeSend(target, payload);
      void track(
        {
          name: "notification_sent",
          props: { type: "start", challengeId, suppressed: quietHours, outcome },
        },
        { userId: target.userId },
      );
    }),
  );

  return { recipientCount: targets.length, quietHours };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test src/lib/push/dispatch.nudge.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/push/dispatch.ts src/lib/push/dispatch.nudge.spec.ts
git commit -m "feat(push): dispatchOwnerStartNudge 단일 유저 시작 nudge 발송 추가"
```

---

## Task 3: `signPledge` 에 nudge dispatch 연결

**Files:**

- Modify: `src/app/(app)/challenge/[id]/pledge/_actions.ts`
- Modify: `src/app/(app)/challenge/[id]/pledge/_actions.spec.ts`

RPC가 `should_nudge_owner`/`owner_user_id`를 반환하면 `after()`로 nudge를 fire한다. 기존 테스트(서명이 자동 활성화 안 함)는 유지되어야 한다.

- [ ] **Step 1: 실패하는 테스트 추가**

`src/app/(app)/challenge/[id]/pledge/_actions.spec.ts` 상단 `import { signPledge } from "./_actions";` 바로 위(다른 `vi.mock` 블록들과 같은 영역)에 삽입:

```typescript
const nudgeCalls: Array<[string, string]> = [];
vi.mock("@/lib/push/dispatch", () => ({
  dispatchOwnerStartNudge: async (challengeId: string, ownerUserId: string) => {
    nudgeCalls.push([challengeId, ownerUserId]);
    return { recipientCount: 1, quietHours: false };
  },
}));
// after(cb) 는 request 컨텍스트 의존 — 테스트에서 콜백 즉시 실행.
vi.mock("next/server", () => ({ after: (cb: () => unknown) => cb() }));
```

`beforeEach`의 `trackCalls.length = 0;` 다음 줄에 추가:

```typescript
nudgeCalls.length = 0;
```

그리고 `describe("signPledge", ...)` 블록 안에 테스트 2개 추가:

```typescript
it("멤버가 마지막 서명자(should_nudge_owner=true)면 오너에게 nudge dispatch", async () => {
  rpc.mockResolvedValueOnce({
    data: [
      {
        status: "pending",
        participant_count: 2,
        challenge_created_at: null,
        signed_count: 2,
        owner_user_id: "22222222-2222-4222-8222-222222222222",
        should_nudge_owner: true,
      },
    ],
    error: null,
  });
  const res = await signPledge({ challengeId: CHALLENGE });
  expect(res.ok).toBe(true);
  expect(nudgeCalls).toEqual([[CHALLENGE, "22222222-2222-4222-8222-222222222222"]]);
});

it("should_nudge_owner=false 면 nudge dispatch 하지 않음", async () => {
  rpc.mockResolvedValueOnce({
    data: [
      {
        status: "pending",
        participant_count: 2,
        challenge_created_at: null,
        signed_count: 1,
        owner_user_id: "22222222-2222-4222-8222-222222222222",
        should_nudge_owner: false,
      },
    ],
    error: null,
  });
  const res = await signPledge({ challengeId: CHALLENGE });
  expect(res.ok).toBe(true);
  expect(nudgeCalls).toEqual([]);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test "src/app/(app)/challenge/[id]/pledge/_actions.spec.ts"`
Expected: FAIL — `멤버가 마지막 서명자...` 케이스에서 `nudgeCalls`가 비어 있음(아직 연결 안 됨).

- [ ] **Step 3: `signPledge` 구현 수정**

`src/app/(app)/challenge/[id]/pledge/_actions.ts`:

import 영역에 추가:

```typescript
import { after } from "next/server";
import { dispatchOwnerStartNudge } from "@/lib/push/dispatch";
```

`void track({ name: "challenge_signed", ... });` 블록과 `return success({...})` 사이에 삽입:

```typescript
// ADR-0028 — 전원 서명 완료 + 마지막 서명자가 멤버면 오너에게 시작 nudge.
// RPC 가 atomic 하게 1회만 should_nudge_owner=true 로 판정(start_nudge_sent_at).
if (row.should_nudge_owner && row.owner_user_id) {
  const ownerId = row.owner_user_id as string;
  after(() =>
    dispatchOwnerStartNudge(parsed.data.challengeId, ownerId).catch((e) =>
      console.error("[signPledge] owner start nudge dispatch failed", e),
    ),
  );
}
```

> `SignResult` 타입은 변경하지 않는다 — `should_nudge_owner`/`owner_user_id`는 클라이언트에 노출할 필요가 없는 서버 내부 신호다. `row`는 `supabase.rpc` 반환이라 타입상 새 필드 접근이 허용된다(`db:types` 재생성 반영).

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test "src/app/(app)/challenge/[id]/pledge/_actions.spec.ts"`
Expected: PASS — 기존 4개 + 신규 2개 모두 통과. 특히 기존 "does not dispatch activation from signing even when everyone has signed"가 여전히 PASS(서명은 활성화하지 않음 — nudge는 활성화가 아님).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/challenge/[id]/pledge/_actions.ts" "src/app/(app)/challenge/[id]/pledge/_actions.spec.ts"
git commit -m "feat(challenge): signPledge 가 전원 서명 시 오너 nudge 를 after() 로 발송"
```

---

## Task 4: `StartChallengeCard` 전원 서명 완료 강조

**Files:**

- Modify: `src/app/(app)/challenge/[id]/_components/start-challenge-card.tsx`
- Create: `src/app/(app)/challenge/[id]/_components/start-challenge-card.spec.tsx`

`unsignedCount === 0`이면 heading/문구를 "전원 서명 완료"로 강조한다. props는 이미 존재(데이터 변경 0).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/app/(app)/challenge/[id]/_components/start-challenge-card.spec.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StartChallengeCard } from "./start-challenge-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("../_actions", () => ({ startChallengeWithSignedParticipants: vi.fn() }));

describe("StartChallengeCard", () => {
  it("미서명자가 남아 있으면 기존 안내 문구", () => {
    render(<StartChallengeCard challengeId="c1" signedCount={2} unsignedCount={1} />);
    expect(screen.getByText("시작할 준비가 됐어요")).toBeInTheDocument();
    expect(screen.getByText(/다음 챌린지부터 함께해요/)).toBeInTheDocument();
  });

  it("전원 서명(unsignedCount=0)이면 완료 강조", () => {
    render(<StartChallengeCard challengeId="c1" signedCount={3} unsignedCount={0} />);
    expect(screen.getByText("전원 서명 완료 🎉")).toBeInTheDocument();
    expect(screen.queryByText(/다음 챌린지부터 함께해요/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test "src/app/(app)/challenge/[id]/_components/start-challenge-card.spec.tsx"`
Expected: FAIL — `전원 서명 완료 🎉` 텍스트 없음.

- [ ] **Step 3: 컴포넌트 수정**

`src/app/(app)/challenge/[id]/_components/start-challenge-card.tsx`의 `<h3 className="t-h3">시작할 준비가 됐어요</h3>` 줄을 교체:

```tsx
<h3 className="t-h3">{unsignedCount === 0 ? "전원 서명 완료 🎉" : "시작할 준비가 됐어요"}</h3>
```

(57–61줄의 본문 문구는 그대로 둔다 — `unsignedCount > 0` 분기가 이미 "다음 챌린지부터 함께해요"를 조건부로 숨기므로 `unsignedCount===0`이면 자동으로 사라진다.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test "src/app/(app)/challenge/[id]/_components/start-challenge-card.spec.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/challenge/[id]/_components/start-challenge-card.tsx" "src/app/(app)/challenge/[id]/_components/start-challenge-card.spec.tsx"
git commit -m "feat(challenge): StartChallengeCard 전원 서명 완료 시 강조 문구"
```

---

## Task 5: 카드 중복 제거 — info `startSlot` 삭제

**Files:**

- Modify: `src/app/(app)/challenge/[id]/(tabs)/info/page.tsx`
- Modify: `src/app/(app)/challenge/[id]/_components/info-tab.tsx`

`StartChallengeCard`가 `(tabs)/layout.tsx`(모든 탭 공통 헤더, 카드 유지)와 `info/page.tsx`(startSlot) 두 곳에서 렌더되어 info 탭에서만 카드가 2개다. 모든 탭에서 일관되게 보이는 layout 헤더 카드를 남기고 info의 startSlot 경로를 제거한다. 테스트 대상이 아닌 RSC slot 정리라 별도 단위 테스트는 두지 않고, Task 7의 수동 viewport 확인으로 검증한다.

- [ ] **Step 1: `info/page.tsx` 에서 startSlot 제거**

`src/app/(app)/challenge/[id]/(tabs)/info/page.tsx` 수정:

8번 줄 import 삭제:

```typescript
import { StartChallengeCard } from "../../_components/start-challenge-card";
```

`me`/`mySigned`/`totalSigned`/`unsignedCount` 선언(30–31·35–36줄)은 startSlot 전용이므로 4개 모두 삭제. `isOwner`·`ownerName`은 다른 slot에서 쓰이므로 유지:

```typescript
  const me = detail.members.find((m) => m.id === user.id);
  const mySigned = me?.signed ?? false;
  ...
  const totalSigned = detail.members.filter((m) => m.signed).length;
  const unsignedCount = detail.members.length - totalSigned;
```

53–60번 줄 `startSlot` 선언 전체 삭제. 그리고 `<InfoTab ... />`에서 `startSlot={startSlot}` 제거:

```tsx
return (
  <InfoTab
    detail={detail}
    ownerName={ownerName}
    inviteSlot={inviteSlot}
    accountSlot={accountSlot}
  />
);
```

- [ ] **Step 2: `info-tab.tsx` 에서 startSlot prop 제거**

`src/app/(app)/challenge/[id]/_components/info-tab.tsx`:

- 14번 줄 `startSlot?: React.ReactNode;` 삭제
- 17번 줄 구조분해에서 `startSlot` 제거 → `export function InfoTab({ detail, ownerName, inviteSlot, accountSlot }: InfoTabProps)`
- 35번 줄 `{startSlot}` 삭제

- [ ] **Step 3: 타입 + 린트 확인 (orphan 없음 검증)**

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm lint`
Expected: PASS — 미사용 import/변수 0. `start-challenge-card.tsx`는 layout.tsx가 여전히 import하므로 dead code 아님.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/challenge/[id]/(tabs)/info/page.tsx" "src/app/(app)/challenge/[id]/_components/info-tab.tsx"
git commit -m "refactor(challenge): info 탭 StartChallengeCard 중복 제거 (layout 헤더 유지)"
```

---

## Task 6: ADR-0028 작성

**Files:**

- Create: `docs/adr/0028-all-signed-owner-start-nudge.md`

`supabase/migrations/**` 변경은 ADR 권장 경로다. ADR-0009를 보완(반전 아님)하는 결정을 기록한다.

- [ ] **Step 1: ADR 작성**

`docs/adr/0028-all-signed-owner-start-nudge.md`:

```markdown
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
```

- [ ] **Step 2: 문서 링크 검증**

Run: `pnpm validate:docs`
Expected: PASS — 내부 링크(0009·0013) 깨짐 없음.

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0028-all-signed-owner-start-nudge.md
git commit -m "docs(adr): ADR-0028 전원 서명 오너 시작 nudge"
```

---

## Task 7: 통합 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 게이트**

Run (한 줄씩):

```bash
pnpm typecheck
```

```bash
pnpm lint
```

```bash
pnpm test
```

```bash
pnpm validate:docs
```

Expected: 모두 PASS.

- [ ] **Step 2: RPC 재적용 확인**

Run: `pnpm supabase db reset`
Expected: 0001~0040 전부 적용 성공.

- [ ] **Step 3: 모바일 viewport 수동 확인**

`pnpm dev` 후 모바일 에뮬레이션(또는 실기)에서:

- 오너+멤버2 pending 챌린지 생성 → 멤버 전원 서명 → info/feed/action 탭 모두에서 `StartChallengeCard`가 **1개만** 보이고, info 탭 카드 중복이 사라졌는지 확인.
- 전원 서명 상태에서 카드 heading이 "전원 서명 완료 🎉"인지 확인.
- (옵션) 오너가 `start` 알림 옵트인 + 구독한 상태에서, 멤버 계정으로 마지막 서명 → 오너에게 푸시 1건 도착, 클릭 시 `/challenge/<id>` 진입 확인.

- [ ] **Step 4: 최종 상태 보고** — 변경 동작·검증 결과 요약(AGENTS.md §9 형식).

---

## Self-Review

- **Spec coverage:** 합의된 8개 결정 모두 task로 매핑됨 — ① nudge(자동시작 아님): Task1 RPC + Task3 / ② 멤버 마지막 서명만 푸시: Task1 판정(`v_uid <> v_owner`) + Task2 / ③ start 키 재사용: Task2 / ④ start_nudge_sent_at + lock + atomic: Task1 / ⑤ type "start" 재사용: Task2(track 변경 없음) / ⑥ quiet hours suppress·재발송 없음: Task2 + ADR / ⑦ 카드 중복 정리: Task5 / ⑧ 새 ADR: Task6. migration=0040, ADR=0028.
- **Placeholder scan:** 모든 step에 실제 코드/명령/기대 출력 포함 — TBD·"적절히"·"유사하게" 없음. psql 시나리오의 `<challenge_id>`는 런타임 seed 값이라 placeholder가 아닌 입력 슬롯.
- **Type consistency:** RPC 반환 필드(`should_nudge_owner`·`owner_user_id`·`signed_count`)가 Task1 정의 → Task3 mock/사용에서 동일 snake_case. `dispatchOwnerStartNudge(challengeId, ownerUserId)` 시그니처가 Task2 정의 → Task3 호출에서 일치. `unsignedCount` prop이 Task4에서 사용 — 기존 `StartChallengeCard` Props와 일치.
