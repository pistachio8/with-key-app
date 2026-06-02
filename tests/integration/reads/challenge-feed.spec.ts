import { describe, it, expect } from "vitest";
import { asUser, admin } from "../setup";
import { withIntegrationClient } from "../test-context";
import { createUser, createGroup, addMember, createPendingChallenge } from "../factories";
import { fetchChallengeFeed } from "@/lib/db/reads/challenge-feed";

function tinyJpeg() {
  return new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0xff, 0xd9])], {
    type: "image/jpeg",
  });
}

async function seedActive() {
  const owner = await createUser();
  const other = await createUser();
  const g = await createGroup(owner.id);
  await addMember(g.id, other.id);
  const c = await createPendingChallenge(g.id);
  await admin.from("challenge_participants").insert([
    { challenge_id: c.id, user_id: owner.id },
    { challenge_id: c.id, user_id: other.id },
  ]);
  await admin
    .from("challenges")
    .update({
      status: "active",
      start_at: new Date(Date.now() - 60_000).toISOString(),
      end_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    })
    .eq("id", c.id);
  const { data: log, error } = await admin
    .from("action_logs")
    .insert({
      challenge_id: c.id,
      user_id: other.id,
      activity_type: "gym",
      photo_path: null,
      selected_keywords: ["펌핑"],
      shown_keywords: ["펌핑", "집중"],
      reroll_count: 0,
      ai_summary: "오늘도 해냈다.",
      prompt_version: "v1",
    })
    .select("id")
    .single();
  if (error || !log) throw new Error(`seed action_log failed: ${error?.message ?? "no row"}`);
  return { owner, other, challenge: c, logId: log.id };
}

async function fetchChallengeFeedAsUser(
  viewer: { id: string; email: string; password: string },
  challengeId: string,
) {
  // ADR-0024 이후: Layer 1 (`listVisibleActionLogIds`)만 `createClient()` 호출 → RLS gate.
  // `withIntegrationClient` 가 AsyncLocalStorage 로 signed-in viewer client 를 binding 하고
  // `setup.ts` 의 vi.mock 이 그 client 를 production createClient 자리에 끼워 cookies() 우회.
  // hydrate 단계(Layer 2/3)는 `adminClient()` → setup.ts 의 admin mock (service-role).
  // `_options.client` 는 Phase 4 에서 deprecated — 미전달.
  const client = await asUser(viewer);
  return withIntegrationClient(client, () => fetchChallengeFeed(challengeId, viewer.id));
}

describe("fetchChallengeFeed", () => {
  it("returns feed items with author, summary, keywords, zero kudos initially", async () => {
    const { owner, other, challenge, logId } = await seedActive();
    const rows = await fetchChallengeFeedAsUser(owner, challenge.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: logId,
      authorId: other.id,
      summary: "오늘도 해냈다.",
      photoSignedUrl: null,
      keywords: ["펌핑"],
      kudosByEmoji: { "🔥": 0, "💪": 0, "👏": 0 },
      viewerKudos: [],
    });
  });

  it("aggregates kudos counts by emoji and marks viewer's own kudos", async () => {
    const { owner, other, challenge, logId } = await seedActive();
    await admin.from("kudos").insert([
      { action_log_id: logId, user_id: owner.id, emoji: "🔥" },
      { action_log_id: logId, user_id: other.id, emoji: "🔥" },
      { action_log_id: logId, user_id: owner.id, emoji: "💪" },
    ]);
    const rows = await fetchChallengeFeedAsUser(owner, challenge.id);
    expect(rows[0].kudosByEmoji).toEqual({ "🔥": 2, "💪": 1, "👏": 0 });
    expect(rows[0].viewerKudos).toEqual(expect.arrayContaining(["🔥", "💪"]));
  });

  it("converts photo_path to a signed URL for group members", async () => {
    const { owner, other, challenge, logId } = await seedActive();
    const otherClient = await asUser(other);
    const path = `${other.id}/${challenge.id}/${logId}-feed.jpg`;
    const upload = await otherClient.storage
      .from("action-photos")
      .upload(path, tinyJpeg(), { contentType: "image/jpeg" });
    expect(upload.error).toBeNull();
    const update = await admin.from("action_logs").update({ photo_path: path }).eq("id", logId);
    expect(update.error).toBeNull();

    const rows = await fetchChallengeFeedAsUser(owner, challenge.id);
    expect(rows[0].photoSignedUrl).toMatch(/^https?:\/\//);
  });

  it("returns [] for non-members (RLS denies select)", async () => {
    const { challenge } = await seedActive();
    const outsider = await createUser();
    const rows = await fetchChallengeFeedAsUser(outsider, challenge.id);
    expect(rows).toEqual([]);
  });

  // ADR-0024 회귀 방어: hydrate 단계가 adminClient (RLS 우회) 로 바뀐 뒤, viewer-specific
  // kudos 는 `.eq('user_id', viewerId)` SQL filter 만이 leak 을 막는다. 두 멤버가 같은
  // action_log 에 서로 다른 emoji 를 달았을 때, 각 viewer 는 자기 것만 viewerKudos 로 보고
  // 집계(kudosByEmoji)는 동일해야 한다.
  it("does not leak other viewers' kudos: each viewer sees only their own viewerKudos", async () => {
    const { owner, challenge, logId } = await seedActive();
    // log 작성자는 `other` 라 owner 와 third 둘 다 kudos 가능 (kudos_insert_self_not_own).
    const third = await createUser();
    await addMember(challenge.group_id, third.id);
    const cpInsert = await admin
      .from("challenge_participants")
      .insert({ challenge_id: challenge.id, user_id: third.id });
    expect(cpInsert.error).toBeNull();
    const kudosInsert = await admin.from("kudos").insert([
      { action_log_id: logId, user_id: owner.id, emoji: "🔥" },
      { action_log_id: logId, user_id: third.id, emoji: "💪" },
    ]);
    expect(kudosInsert.error).toBeNull();

    const ownerRows = await fetchChallengeFeedAsUser(owner, challenge.id);
    const thirdRows = await fetchChallengeFeedAsUser(third, challenge.id);

    // 집계는 둘 다 동일.
    expect(ownerRows[0].kudosByEmoji).toEqual({ "🔥": 1, "💪": 1, "👏": 0 });
    expect(thirdRows[0].kudosByEmoji).toEqual({ "🔥": 1, "💪": 1, "👏": 0 });
    // viewerKudos 는 각자 자기 것만 — leak 없음.
    expect(ownerRows[0].viewerKudos).toEqual(["🔥"]);
    expect(thirdRows[0].viewerKudos).toEqual(["💪"]);
  });
});
