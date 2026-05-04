import { describe, it, expect } from "vitest";
import { admin, asUser } from "../setup";
import { createUser, createGroup, addMember, createPendingChallenge } from "../factories";
import { fetchUnreadKudosCount } from "@/lib/db/reads/unread-kudos";

async function insertActiveChallengeAndParticipants(
  groupId: string,
  memberIds: string[],
  goalCount = 3,
) {
  const c = await createPendingChallenge(groupId, { goalCount, penaltyAmount: 3000 });
  await admin.from("challenge_participants").insert(
    memberIds.map((uid) => ({
      challenge_id: c.id,
      user_id: uid,
      signed_at: new Date().toISOString(),
    })),
  );
  await admin
    .from("challenges")
    .update({
      status: "active",
      start_at: new Date(Date.now() - 86_400_000).toISOString(),
      end_at: new Date(Date.now() + 6 * 86_400_000).toISOString(),
    })
    .eq("id", c.id);
  return c;
}

async function insertActionLog(challengeId: string, userId: string) {
  const { data, error } = await admin
    .from("action_logs")
    .insert({
      challenge_id: challengeId,
      user_id: userId,
      activity_type: "gym",
      photo_path: `test/${userId}/1.jpg`,
      selected_keywords: ["펌핑"],
      shown_keywords: ["펌핑", "하체데이"],
      reroll_count: 0,
      ai_summary: "오늘 기록 남겨요",
      template_fallback: false,
      prompt_version: "v3",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function insertKudos(actionLogId: string, userId: string, emoji = "🔥") {
  const { error } = await admin.from("kudos").insert({
    action_log_id: actionLogId,
    user_id: userId,
    emoji,
  });
  if (error) throw error;
}

describe("fetchUnreadKudosCount integration", () => {
  it("비멤버는 0 (RLS 차단)", async () => {
    const author = await createUser();
    const giver = await createUser();
    const outsider = await createUser();
    const g = await createGroup(author.id);
    await addMember(g.id, giver.id);
    const c = await insertActiveChallengeAndParticipants(g.id, [author.id, giver.id]);
    const logId = await insertActionLog(c.id, author.id);
    await insertKudos(logId, giver.id);

    const outsiderClient = await asUser(outsider);
    const count = await fetchUnreadKudosCount(outsider.id, { client: outsiderClient });
    expect(count).toBe(0);
  });

  it("last_seen=null → 받은 kudos 전부 unread", async () => {
    const author = await createUser();
    const giver = await createUser();
    const g = await createGroup(author.id);
    await addMember(g.id, giver.id);
    const c = await insertActiveChallengeAndParticipants(g.id, [author.id, giver.id]);
    const logId = await insertActionLog(c.id, author.id);
    await insertKudos(logId, giver.id, "🔥");
    await insertKudos(logId, giver.id, "💪");

    const authorClient = await asUser(author);
    const count = await fetchUnreadKudosCount(author.id, { client: authorClient });
    expect(count).toBe(2);
  });

  it("last_seen 이후에 달린 kudos 만 unread 로 집계", async () => {
    const author = await createUser();
    const giver = await createUser();
    const g = await createGroup(author.id);
    await addMember(g.id, giver.id);
    const c = await insertActiveChallengeAndParticipants(g.id, [author.id, giver.id]);
    const logId = await insertActionLog(c.id, author.id);
    await insertKudos(logId, giver.id, "🔥");

    // author 가 피드를 열어 seen 을 업데이트한 시점 시뮬레이션
    await admin
      .from("users")
      .update({ last_feed_seen_at: new Date().toISOString() })
      .eq("id", author.id);

    // 이후에 새로 kudos 가 달림
    await new Promise((r) => setTimeout(r, 50));
    await insertKudos(logId, giver.id, "💪");

    const authorClient = await asUser(author);
    const count = await fetchUnreadKudosCount(author.id, { client: authorClient });
    expect(count).toBe(1);
  });

  it("self-kudos 는 RLS 가 insert 자체를 거부하므로 count 에 포함 안 됨", async () => {
    const author = await createUser();
    const g = await createGroup(author.id);
    const c = await insertActiveChallengeAndParticipants(g.id, [author.id]);
    const logId = await insertActionLog(c.id, author.id);

    const authorClient = await asUser(author);
    const { error: selfErr } = await authorClient
      .from("kudos")
      .insert({ action_log_id: logId, user_id: author.id, emoji: "🔥" });
    expect(selfErr).not.toBeNull(); // RLS kudos_insert_self_not_own 차단

    const count = await fetchUnreadKudosCount(author.id, { client: authorClient });
    expect(count).toBe(0);
  });
});
