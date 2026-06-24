import { describe, expect, it } from "vitest";
import { admin, asUser } from "../setup";
import { addMember, createGroup, createPendingChallenge, createUser } from "../factories";

// 영상 인증 Storage RLS(spec §C2 / EVAL-0043) — action-photos.spec.ts 미러.
// 버킷 private + av_* 정책(select=그룹 멤버 · insert/delete=self) + update_action_log_video_path RPC.
function tinyMp4() {
  // ftyp box 머리만 있는 최소 바이트 — Storage 는 contentType 헤더로 MIME 을 검사한다.
  return new Blob([Uint8Array.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])], {
    type: "video/mp4",
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
      feed_type: "video",
      start_at: new Date(Date.now() - 60_000).toISOString(),
      end_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    .eq("id", challenge.id);

  return { owner, other, outsider, challengeId: challenge.id };
}

async function createVideoActionLog(userId: string, challengeId: string) {
  const { data, error } = await admin
    .from("action_logs")
    .insert({
      challenge_id: challengeId,
      user_id: userId,
      activity_type: "gym",
      media_type: "video",
      video_path: null,
      selected_keywords: ["펌핑"],
      shown_keywords: ["펌핑", "하체데이"],
      reroll_count: 0,
      ai_summary: "ok",
      prompt_version: "v1",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`createVideoActionLog failed: ${error?.message ?? "no row"}`);
  return data.id;
}

describe("action-videos Storage RLS", () => {
  it("allows owner upload, group-member signed URL, and blocks outsider signed URL", async () => {
    const { owner, other, outsider, challengeId } = await seedActive();
    const logId = await createVideoActionLog(owner.id, challengeId);
    const ownerClient = await asUser(owner);
    const otherClient = await asUser(other);
    const outsiderClient = await asUser(outsider);
    const path = `${owner.id}/${challengeId}/${logId}-rls.mp4`;

    const uploaded = await ownerClient.storage
      .from("action-videos")
      .upload(path, tinyMp4(), { contentType: "video/mp4" });
    expect(uploaded.error).toBeNull();

    const memberSigned = await otherClient.storage.from("action-videos").createSignedUrl(path, 60);
    expect(memberSigned.data?.signedUrl).toMatch(/^https?:\/\//);

    const outsiderSigned = await outsiderClient.storage
      .from("action-videos")
      .createSignedUrl(path, 60);
    expect(outsiderSigned.data?.signedUrl).toBeFalsy();
  });

  it("blocks writes into another user's folder", async () => {
    const { owner, outsider, challengeId } = await seedActive();
    const logId = await createVideoActionLog(owner.id, challengeId);
    const outsiderClient = await asUser(outsider);

    const uploaded = await outsiderClient.storage
      .from("action-videos")
      .upload(`${owner.id}/${challengeId}/${logId}-blocked.mp4`, tinyMp4(), {
        contentType: "video/mp4",
      });

    expect(uploaded.error).not.toBeNull();
  });
});

describe("update_action_log_video_path RPC", () => {
  it("lets the owner set video_path after the direct 5-minute update window closed", async () => {
    const { owner, challengeId } = await seedActive();
    const logId = await createVideoActionLog(owner.id, challengeId);
    await admin
      .from("action_logs")
      .update({ created_at: new Date(Date.now() - 10 * 60_000).toISOString() })
      .eq("id", logId);

    const ownerClient = await asUser(owner);
    const path = `${owner.id}/${challengeId}/${logId}-late.mp4`;

    const direct = await ownerClient
      .from("action_logs")
      .update({ video_path: path })
      .eq("id", logId)
      .select("video_path");
    expect(direct.error ?? null).toBeNull();
    expect(direct.data ?? []).toEqual([]);

    const rpc = await ownerClient.rpc("update_action_log_video_path", {
      p_log_id: logId,
      p_video_path: path,
    });
    expect(rpc.error).toBeNull();

    const { data } = await admin.from("action_logs").select("video_path").eq("id", logId).single();
    expect(data?.video_path).toBe(path);
  });

  it("rejects a video_path that does not match the action_log owner", async () => {
    const { owner, outsider, challengeId } = await seedActive();
    const logId = await createVideoActionLog(owner.id, challengeId);
    const ownerClient = await asUser(owner);

    const rpc = await ownerClient.rpc("update_action_log_video_path", {
      p_log_id: logId,
      p_video_path: `${outsider.id}/${challengeId}/${logId}-wrong.mp4`,
    });
    expect(rpc.error?.code).toBe("42501");
  });

  it("rejects a video_path with a non-video extension", async () => {
    const { owner, challengeId } = await seedActive();
    const logId = await createVideoActionLog(owner.id, challengeId);
    const ownerClient = await asUser(owner);

    const rpc = await ownerClient.rpc("update_action_log_video_path", {
      p_log_id: logId,
      p_video_path: `${owner.id}/${challengeId}/${logId}-bad.jpg`,
    });
    expect(rpc.error?.code).toBe("22023");
  });
});
