import { beforeEach, describe, expect, it, vi } from "vitest";
import { admin } from "../setup";
import { createGroup, createPendingChallenge, createUser } from "../factories";

const sendPush = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/push/send", async (orig) => {
  const actual = await orig<typeof import("@/lib/push/send")>();
  return { ...actual, sendPush };
});

const CRON_SECRET = "integration-cron-secret";

function cronReq(secret = CRON_SECRET): Request {
  const headers = new Headers({ authorization: `Bearer ${secret}` });
  return new Request("https://app/api/cron/deadline-push", {
    method: "POST",
    headers,
  });
}

async function seedActiveEndingIn(hours: number) {
  const owner = await createUser();
  const g = await createGroup(owner.id);
  const c = await createPendingChallenge(g.id);
  await admin
    .from("challenge_participants")
    .insert({ challenge_id: c.id, user_id: owner.id });
  await admin
    .from("challenges")
    .update({
      status: "active",
      start_at: new Date(Date.now() - 60_000).toISOString(),
      end_at: new Date(Date.now() + hours * 3_600_000).toISOString(),
    })
    .eq("id", c.id);
  await admin.from("push_subscriptions").insert({
    user_id: owner.id,
    endpoint: `https://fcm.googleapis.com/fcm/send/${owner.id}`,
    p256dh: "p",
    auth: "a",
  });
  return { challengeId: c.id, ownerId: owner.id };
}

describe("deadline-push cron (integration)", () => {
  beforeEach(() => {
    sendPush.mockReset();
    sendPush.mockResolvedValue(undefined);
    process.env.CRON_SECRET = CRON_SECRET;
  });

  it("dispatches once then skips on a second invocation for the same challenge", async () => {
    const { POST } = await import("@/app/api/cron/deadline-push/route");
    const { challengeId } = await seedActiveEndingIn(24);

    const first = await POST(cronReq());
    const firstBody = await first.json();
    expect(first.status).toBe(200);
    expect(firstBody.dispatched).toBeGreaterThanOrEqual(1);

    // events 삽입이 dispatch 내부에서 void 로 도는 것에 여유를 준다.
    await new Promise((r) => setTimeout(r, 300));

    const second = await POST(cronReq());
    const secondBody = await second.json();
    expect(secondBody.dispatched).toBe(0);

    const { data: events } = await admin
      .from("events")
      .select("id")
      .eq("name", "notification_sent")
      .contains("props", { type: "deadline", challengeId });
    expect((events ?? []).length).toBe(1);
  });

  it("skips challenges whose end_at is outside the 23-25h window", async () => {
    const { POST } = await import("@/app/api/cron/deadline-push/route");
    await seedActiveEndingIn(48);
    const res = await POST(cronReq());
    const body = await res.json();
    expect(body.dispatched).toBe(0);
  });
});
