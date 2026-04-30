import { describe, expect, it } from "vitest";
import { admin, asUser } from "../setup";
import { addMember, createGroup, createPendingChallenge, createUser } from "../factories";

function tinyJpeg() {
  return new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0xff, 0xd9])], {
    type: "image/jpeg",
  });
}

async function seedActive() {
  const owner = await createUser();
  const other = await createUser();
  const outsider = await createUser();
  const group = await createGroup(owner.id);
  await addMember(group.id, other.id);
  const challenge = await createPendingChallenge(group.id);
  await admin.from("challenge_participants").insert([
    { challenge_id: challenge.id, user_id: owner.id, signed_at: new Date().toISOString() },
    { challenge_id: challenge.id, user_id: other.id, signed_at: new Date().toISOString() },
  ]);
  await admin
    .from("challenges")
    .update({
      status: "active",
      start_at: new Date(Date.now() - 60_000).toISOString(),
      end_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    .eq("id", challenge.id);

  return { owner, other, outsider, challengeId: challenge.id };
}

async function createActionLog(userId: string, challengeId: string) {
  const { data, error } = await admin
    .from("action_logs")
    .insert({
      challenge_id: challengeId,
      user_id: userId,
      activity_type: "gym",
      photo_path: null,
      selected_keywords: ["펌핑"],
      shown_keywords: ["펌핑", "하체데이"],
      reroll_count: 0,
      ai_summary: "ok",
      prompt_version: "v1",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`createActionLog failed: ${error?.message ?? "no row"}`);
  return data.id;
}

describe("action-photos Storage RLS", () => {
  it("allows owner upload, group-member signed URL, and blocks outsider signed URL", async () => {
    const { owner, other, outsider, challengeId } = await seedActive();
    const logId = await createActionLog(owner.id, challengeId);
    const ownerClient = await asUser(owner);
    const otherClient = await asUser(other);
    const outsiderClient = await asUser(outsider);
    const path = `${owner.id}/${challengeId}/${logId}-rls.jpg`;

    const uploaded = await ownerClient.storage
      .from("action-photos")
      .upload(path, tinyJpeg(), { contentType: "image/jpeg" });
    expect(uploaded.error).toBeNull();

    const memberSigned = await otherClient.storage.from("action-photos").createSignedUrl(path, 60);
    expect(memberSigned.data?.signedUrl).toMatch(/^https?:\/\//);

    const outsiderSigned = await outsiderClient.storage
      .from("action-photos")
      .createSignedUrl(path, 60);
    expect(outsiderSigned.data?.signedUrl).toBeFalsy();
  });

  it("blocks writes into another user's folder", async () => {
    const { owner, outsider, challengeId } = await seedActive();
    const logId = await createActionLog(owner.id, challengeId);
    const outsiderClient = await asUser(outsider);

    const uploaded = await outsiderClient.storage
      .from("action-photos")
      .upload(`${owner.id}/${challengeId}/${logId}-blocked.jpg`, tinyJpeg(), {
        contentType: "image/jpeg",
      });

    expect(uploaded.error).not.toBeNull();
  });
});

describe("update_action_log_photo_path RPC", () => {
  it("lets the owner set photo_path after the direct 5-minute update window closed", async () => {
    const { owner, challengeId } = await seedActive();
    const logId = await createActionLog(owner.id, challengeId);
    await admin
      .from("action_logs")
      .update({ created_at: new Date(Date.now() - 10 * 60_000).toISOString() })
      .eq("id", logId);

    const ownerClient = await asUser(owner);
    const path = `${owner.id}/${challengeId}/${logId}-late.jpg`;

    const direct = await ownerClient
      .from("action_logs")
      .update({ photo_path: path })
      .eq("id", logId)
      .select("photo_path");
    expect(direct.error ?? null).toBeNull();
    expect(direct.data ?? []).toEqual([]);

    const rpc = await ownerClient.rpc("update_action_log_photo_path", {
      p_log_id: logId,
      p_photo_path: path,
    });
    expect(rpc.error).toBeNull();

    const { data } = await admin.from("action_logs").select("photo_path").eq("id", logId).single();
    expect(data?.photo_path).toBe(path);
  });

  it("rejects a photo_path that does not match the action_log owner", async () => {
    const { owner, outsider, challengeId } = await seedActive();
    const logId = await createActionLog(owner.id, challengeId);
    const ownerClient = await asUser(owner);

    const rpc = await ownerClient.rpc("update_action_log_photo_path", {
      p_log_id: logId,
      p_photo_path: `${outsider.id}/${challengeId}/${logId}-wrong.jpg`,
    });
    expect(rpc.error?.code).toBe("42501");
  });
});
