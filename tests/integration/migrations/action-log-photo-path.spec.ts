import { describe, expect, it } from "vitest";
import { admin } from "../setup";
import { createGroup, createPendingChallenge, createUser } from "../factories";

async function seedActive() {
  const owner = await createUser();
  const group = await createGroup(owner.id);
  const challenge = await createPendingChallenge(group.id);
  await admin.from("challenge_participants").insert({
    challenge_id: challenge.id,
    user_id: owner.id,
    signed_at: new Date().toISOString(),
  });
  await admin
    .from("challenges")
    .update({
      status: "active",
      start_at: new Date(Date.now() - 60_000).toISOString(),
      end_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    .eq("id", challenge.id);
  return { ownerId: owner.id, challengeId: challenge.id };
}

describe("action_logs.photo_path migration", () => {
  it("accepts null photo_path for no-photo fallback", async () => {
    const { ownerId, challengeId } = await seedActive();
    const { error } = await admin.from("action_logs").insert({
      challenge_id: challengeId,
      user_id: ownerId,
      activity_type: "gym",
      photo_path: null,
      selected_keywords: ["펌핑"],
      shown_keywords: ["펌핑", "하체데이"],
      reroll_count: 0,
      ai_summary: "ok",
      prompt_version: "v1",
    });
    expect(error).toBeNull();
  });

  it("rejects too-short photo_path values", async () => {
    const { ownerId, challengeId } = await seedActive();
    const { error } = await admin.from("action_logs").insert({
      challenge_id: challengeId,
      user_id: ownerId,
      activity_type: "gym",
      photo_path: "short",
      selected_keywords: ["펌핑"],
      shown_keywords: ["펌핑", "하체데이"],
      reroll_count: 0,
      ai_summary: "ok",
      prompt_version: "v1",
    });
    expect(error?.code).toBe("23514");
  });
});
