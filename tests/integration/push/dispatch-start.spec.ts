import { beforeEach, describe, expect, it, vi } from "vitest";
import { admin } from "../setup";
import { addMember, createGroup, createPendingChallenge, createUser } from "../factories";

// web-push 는 실제 FCM 호출을 하므로 integration 에서도 mock. 관측하려는 건
// "row 흐름 + events 기록"이지 외부 도달 여부가 아니다.
const sendPush = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/push/send", async (orig) => {
  const actual = await orig<typeof import("@/lib/push/send")>();
  return { ...actual, sendPush };
});

describe("dispatchStartNotification (integration)", () => {
  beforeEach(() => {
    sendPush.mockReset();
    sendPush.mockResolvedValue(undefined);
  });

  it("fan-outs to subscribed opt-in participants and logs notification_sent rows", async () => {
    const { dispatchStartNotification } = await import("@/lib/push/dispatch");

    const owner = await createUser();
    const other = await createUser();
    const g = await createGroup(owner.id);
    await addMember(g.id, other.id);
    const c = await createPendingChallenge(g.id);
    await admin.from("challenge_participants").insert([
      { challenge_id: c.id, user_id: owner.id },
      { challenge_id: c.id, user_id: other.id },
    ]);
    // ADR-0013 이후 신규 가입 default 는 OFF. owner 는 명시적으로 ON 박아 dispatch
    // 대상이 되도록 한다. owner 만 구독한다.
    await admin
      .from("users")
      .update({ notification_prefs: { start: true, deadline: true } })
      .eq("id", owner.id);
    await admin.from("push_subscriptions").insert({
      user_id: owner.id,
      endpoint: `https://fcm.googleapis.com/fcm/send/${owner.id}`,
      p256dh: "p",
      auth: "a",
    });
    // other 는 start 만 꺼둔다 — 타겟에서 제외돼야 한다.
    await admin
      .from("users")
      .update({ notification_prefs: { start: false, deadline: true } })
      .eq("id", other.id);

    await dispatchStartNotification(c.id);
    // dispatch 내부는 void track(...) 으로 fire-and-forget. 삽입 완료를 기다린다.
    await new Promise((r) => setTimeout(r, 250));

    expect(sendPush).toHaveBeenCalledTimes(1);
    const { data: events } = await admin
      .from("events")
      .select("name, props, user_id")
      .eq("name", "notification_sent");
    const mine = (events ?? []).filter(
      (e) => (e.props as { challengeId?: string }).challengeId === c.id,
    );
    expect(mine).toHaveLength(1);
    expect(mine[0].user_id).toBe(owner.id);
    const props = mine[0].props as {
      type: string;
      suppressed: boolean;
      outcome: string;
    };
    expect(props.type).toBe("start");
    expect(props.suppressed).toBe(false);
    expect(props.outcome).toBe("sent");
  });

  it("removes push_subscriptions row on 410 Gone", async () => {
    const { dispatchStartNotification } = await import("@/lib/push/dispatch");

    const owner = await createUser();
    const g = await createGroup(owner.id);
    const c = await createPendingChallenge(g.id);
    await admin.from("challenge_participants").insert({ challenge_id: c.id, user_id: owner.id });
    // ADR-0013 이후 신규 가입 default 는 OFF — dispatch 가 410 cleanup 까지 도달하려면 ON.
    await admin
      .from("users")
      .update({ notification_prefs: { start: true, deadline: true } })
      .eq("id", owner.id);
    const endpoint = `https://fcm.googleapis.com/fcm/send/gone-${owner.id}`;
    await admin
      .from("push_subscriptions")
      .insert({ user_id: owner.id, endpoint, p256dh: "p", auth: "a" });

    const err = Object.assign(new Error("gone"), { statusCode: 410 });
    sendPush.mockRejectedValueOnce(err);

    await dispatchStartNotification(c.id);
    await new Promise((r) => setTimeout(r, 250));

    const { data } = await admin.from("push_subscriptions").select("id").eq("endpoint", endpoint);
    expect(data).toEqual([]);
  });
});
