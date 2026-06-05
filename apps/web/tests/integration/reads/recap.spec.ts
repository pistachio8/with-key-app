// tests/integration/reads/recap.spec.ts
import { describe, it, expect } from "vitest";
import { admin, asUser } from "../setup";
import { createUser, createGroup, addMember, createPendingChallenge } from "../factories";
import { buildRecapView } from "@/lib/db/reads/recap";

async function closeChallenge(challengeId: string, endAt: Date) {
  const startAt = new Date(endAt.getTime() - 7 * 86_400_000);
  // ADR-0030 — 자연 종료 mirror: closed_at >= end_at → cutoff=duration_days.
  await admin
    .from("challenges")
    .update({
      status: "closed",
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      closed_at: endAt.toISOString(),
    })
    .eq("id", challengeId);
}

async function insertActionLogs(opts: { challengeId: string; userId: string; count: number }) {
  const rows = Array.from({ length: opts.count }, (_, i) => ({
    challenge_id: opts.challengeId,
    user_id: opts.userId,
    activity_type: "gym",
    photo_path: `test/${opts.userId}/${i}.jpg`,
    selected_keywords: ["펌핑"],
    shown_keywords: ["펌핑", "하체데이"],
    reroll_count: 0,
    ai_summary: "ok",
    prompt_version: "v1",
  }));
  const { error } = await admin.from("action_logs").insert(rows);
  if (error) throw error;
}

describe("fetchRecap integration", () => {
  it("outsider 는 closed 챌린지를 볼 수 없다 (RLS)", async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const g = await createGroup(owner.id);
    const c = await createPendingChallenge(g.id);
    await closeChallenge(c.id, new Date(Date.now() - 86_400_000));

    const outsiderClient = await asUser(outsider);
    const { data } = await outsiderClient.from("challenges").select("id").eq("id", c.id);
    expect(data).toEqual([]);
  });

  it("3명 그룹 — MVP 단독 · 달성자 · 미달성자 집계", async () => {
    const minji = await createUser({ displayName: "민지" });
    const jj = await createUser({ displayName: "JJ" });
    const hee = await createUser({ displayName: "희수" });
    const g = await createGroup(minji.id);
    await addMember(g.id, jj.id);
    await addMember(g.id, hee.id);
    const c = await createPendingChallenge(g.id, { goalCount: 3, penaltyAmount: 3000 });
    await admin.from("challenge_participants").insert([
      { challenge_id: c.id, user_id: minji.id, signed_at: new Date().toISOString() },
      { challenge_id: c.id, user_id: jj.id, signed_at: new Date().toISOString() },
      { challenge_id: c.id, user_id: hee.id, signed_at: new Date().toISOString() },
    ]);
    await closeChallenge(c.id, new Date(Date.now() - 3600_000));
    await insertActionLogs({ challengeId: c.id, userId: minji.id, count: 3 });
    await insertActionLogs({ challengeId: c.id, userId: jj.id, count: 5 });
    await insertActionLogs({ challengeId: c.id, userId: hee.id, count: 1 });

    // page.tsx 가 createClient (next/headers) 을 요구하므로 fetchRecap 은 직접 호출 불가.
    // RLS + 집계 동작을 buildRecapView 에 주입할 데이터로 검증.
    const { data: challenges } = await (await asUser(minji))
      .from("challenges")
      .select(
        "id, title, goal_count, duration_days, penalty_amount, status, start_at, end_at, closed_at",
      )
      .eq("id", c.id)
      .limit(1);
    expect(challenges?.[0]).toBeTruthy();

    const { data: logs } = await (await asUser(minji))
      .from("action_logs")
      .select("user_id")
      .eq("challenge_id", c.id);
    const doneByUser = new Map<string, number>();
    for (const l of logs ?? []) doneByUser.set(l.user_id, (doneByUser.get(l.user_id) ?? 0) + 1);

    const view = buildRecapView({
      challenge: challenges![0] as Parameters<typeof buildRecapView>[0]["challenge"],
      // 7일(1주) 챌린지라 모든 done 을 week1 버킷에 둔다. 로그 created_at 은 종료 후라
      // 실제 주차 분배 시 stray 가드에 걸리므로, 집계 의도(주차 done)를 직접 주입한다.
      participants: [
        {
          user_id: minji.id,
          display_name: "민지",
          doneByWeek: new Map([[1, doneByUser.get(minji.id) ?? 0]]),
        },
        {
          user_id: jj.id,
          display_name: "JJ",
          doneByWeek: new Map([[1, doneByUser.get(jj.id) ?? 0]]),
        },
        {
          user_id: hee.id,
          display_name: "희수",
          doneByWeek: new Map([[1, doneByUser.get(hee.id) ?? 0]]),
        },
      ],
      viewerId: minji.id,
      now: new Date(),
    });

    expect(view.viewerAchieved).toBe(true);
    expect(view.viewerPerHeadPenalty).toBe(0);
    expect(view.members.find((m) => m.id === jj.id)?.isMvp).toBe(true);
    expect(view.members.find((m) => m.id === minji.id)?.isMvp).toBe(false);
    expect(view.members.find((m) => m.id === hee.id)?.achieved).toBe(false);
  });
});
