import { describe, it, expect } from "vitest";
import { asUser, admin } from "../setup";
import { createUser, createGroup, addMember, createPendingChallenge } from "../factories";

async function makeActiveChallenge() {
  const owner = await createUser();
  const g = await createGroup(owner.id);
  const c = await createPendingChallenge(g.id);
  await admin.from("challenge_participants").insert({ challenge_id: c.id, user_id: owner.id });
  await admin
    .from("challenges")
    .update({
      status: "active",
      start_at: new Date(Date.now() - 60_000).toISOString(),
      end_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    })
    .eq("id", c.id);
  return { owner, groupId: g.id, challengeId: c.id };
}

describe("action_logs insert (RLS)", () => {
  it("participant can insert while challenge is active", async () => {
    const { owner, challengeId } = await makeActiveChallenge();
    const client = await asUser(owner);
    const { data, error } = await client
      .from("action_logs")
      .insert({
        challenge_id: challengeId,
        user_id: owner.id,
        activity_type: "gym",
        photo_path: null,
        selected_keywords: ["펌핑"],
        shown_keywords: ["펌핑", "하체"],
        ai_summary: "오늘 멋지게 운동했어요!",
        prompt_version: "v1",
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.template_fallback).toBe(false);
  });

  it("group member who is not a participant cannot insert", async () => {
    const { groupId, challengeId } = await makeActiveChallenge();
    const outsider = await createUser();
    await addMember(groupId, outsider.id);
    const client = await asUser(outsider);
    const { error } = await client.from("action_logs").insert({
      challenge_id: challengeId,
      user_id: outsider.id,
      activity_type: "gym",
      photo_path: null,
      selected_keywords: ["펌핑"],
      shown_keywords: ["펌핑", "하체"],
      ai_summary: "참가자가 아니면 막혀야 해요",
      prompt_version: "v1",
    });
    expect(error).toBeTruthy();
  });

  it("AI columns update is blocked by trigger (42501)", async () => {
    const { owner, challengeId } = await makeActiveChallenge();
    const client = await asUser(owner);
    const inserted = await client
      .from("action_logs")
      .insert({
        challenge_id: challengeId,
        user_id: owner.id,
        activity_type: "gym",
        photo_path: null,
        selected_keywords: ["a"],
        shown_keywords: ["a"],
        ai_summary: "ok",
        prompt_version: "v1",
      })
      .select()
      .single();
    expect(inserted.error).toBeNull();

    const { error } = await client
      .from("action_logs")
      .update({ ai_summary: "hacked!" })
      .eq("id", inserted.data!.id);
    expect(error?.code).toBe("42501");
  });
});
