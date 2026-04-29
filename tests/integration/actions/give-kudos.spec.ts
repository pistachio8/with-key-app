import { describe, it, expect } from "vitest";
import { asUser, admin } from "../setup";
import { createUser, createGroup, addMember, createPendingChallenge } from "../factories";

async function activeLog() {
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
  const { data: log } = await admin
    .from("action_logs")
    .insert({
      challenge_id: c.id,
      user_id: owner.id,
      activity_type: "gym",
      photo_url: "x",
      selected_keywords: ["펌핑"],
      shown_keywords: ["펌핑"],
      ai_summary: "ok",
      prompt_version: "v1",
    })
    .select()
    .single();
  return { owner, other, log: log! };
}

describe("kudos RLS + uniqueness", () => {
  it("other member can insert kudos", async () => {
    const { other, log } = await activeLog();
    const client = await asUser(other);
    const { error } = await client.from("kudos").insert({
      action_log_id: log.id,
      user_id: other.id,
      emoji: "🔥",
    });
    expect(error).toBeNull();
  });

  it("author cannot kudos their own log (RLS)", async () => {
    const { owner, log } = await activeLog();
    const client = await asUser(owner);
    const { error } = await client.from("kudos").insert({
      action_log_id: log.id,
      user_id: owner.id,
      emoji: "🔥",
    });
    expect(error).not.toBeNull();
  });

  it("duplicate emoji from same user violates unique (23505)", async () => {
    const { other, log } = await activeLog();
    const client = await asUser(other);
    await client.from("kudos").insert({
      action_log_id: log.id,
      user_id: other.id,
      emoji: "🔥",
    });
    const { error } = await client.from("kudos").insert({
      action_log_id: log.id,
      user_id: other.id,
      emoji: "🔥",
    });
    expect(error?.code).toBe("23505");
  });
});
