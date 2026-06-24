import { describe, expect, it } from "vitest";
import { admin } from "./setup";
import { createUser, createGroup, createPendingChallenge } from "./factories";

// EVAL-0045 / ADR-0039 §C5 — 벌칙 redemption 정산 연동 + 2X carry-over 수금 회귀.
//   deferred(penalty_mission 챌린지는 정산 시 penalty 미차감) → 창2 만료 finalize_penalty_proof
//   (accepted=면제, rejected/미제출=2X debt 적재) → 같은 그룹 다음 정산 settle_challenge 가
//   penalty_debt_carryover(−2X)로 1회 수금하고 pool_points 에 합산, settlements 사후 UPDATE 없음.
//
// 실측 위치: integration(공유 Supabase, CI 가 PR migration 적용 후 RPC service_role 직접 호출).
//   unit 으로는 검증 불가 — RPC 산식·트리거(point_ledger append-only·settlements INSERT-only)
//   상호작용은 SQL 에만 있고 domain computeSettlement 은 carry-over 를 알지 못한다(pool 합산은 SQL 전담).

const DAY = 86_400_000;

// 1주(duration 7, goal 3, penalty 3000) 완전 미달(인증 0건) 챌린지를 closed 로 만들고 서명 참가자 1인 부착.
// confirmedPenalty = penalty_amount(3000). 기본 종료 5일 전 → finalize 창(종료+96h) 만료 통과.
async function createClosedMissedChallenge(
  groupId: string,
  userId: string,
  opts: {
    penaltyMission?: string | null;
    deposit?: number;
    startDaysAgo?: number;
    endDaysAgo?: number;
  } = {},
) {
  const challenge = await createPendingChallenge(groupId, {
    durationDays: 7,
    goalCount: 3,
    penaltyAmount: 3000,
  });
  const startDaysAgo = opts.startDaysAgo ?? 12;
  const endDaysAgo = opts.endDaysAgo ?? 5;
  const startAt = new Date(Date.now() - startDaysAgo * DAY).toISOString();
  const endAt = new Date(Date.now() - endDaysAgo * DAY).toISOString();
  const { error: chErr } = await admin
    .from("challenges")
    .update({
      status: "closed",
      start_at: startAt,
      end_at: endAt,
      closed_at: endAt,
      penalty_mission: opts.penaltyMission ?? null,
    })
    .eq("id", challenge.id);
  if (chErr) throw chErr;

  const { error: cpErr } = await admin.from("challenge_participants").insert({
    challenge_id: challenge.id,
    user_id: userId,
    signed_at: startAt,
    deposit_points: opts.deposit ?? 3000,
  });
  if (cpErr) throw cpErr;

  return challenge;
}

async function insertProof(challengeId: string, userId: string, status: "pending" | "rejected") {
  const { error } = await admin.from("penalty_proofs").insert({
    challenge_id: challengeId,
    user_id: userId,
    media_path: `${userId}/${challengeId}/proof.mp4`,
    status,
  });
  if (error) throw error;
}

async function debtsFor(userId: string, originChallengeId: string) {
  const { data, error } = await admin
    .from("penalty_debts")
    .select("amount, status")
    .eq("user_id", userId)
    .eq("origin_challenge_id", originChallengeId);
  if (error) throw error;
  return data as Array<{ amount: number; status: string }>;
}

async function ledgerRows(challengeId: string, userId: string) {
  const { data, error } = await admin
    .from("point_ledger")
    .select("delta, reason")
    .eq("challenge_id", challengeId)
    .eq("user_id", userId);
  if (error) throw error;
  return data as Array<{ delta: number; reason: string }>;
}

async function settlementRow(challengeId: string) {
  const { data, error } = await admin
    .from("settlements")
    .select("pool_points, distribution")
    .eq("challenge_id", challengeId)
    .maybeSingle();
  if (error) throw error;
  return data as { pool_points: number; distribution: Record<string, unknown> } | null;
}

describe("finalize_penalty_proof — 창2 만료 확정 (EVAL-0045)", () => {
  it("accepted(과반 미반려) → 면제: debt 없음, pending proof 가 accepted 로 확정", async () => {
    const user = await createUser();
    const group = await createGroup(user.id);
    const challenge = await createClosedMissedChallenge(group.id, user.id, {
      penaltyMission: "플랭크 30초",
    });
    await admin.rpc("settle_challenge", { p_challenge_id: challenge.id });
    await insertProof(challenge.id, user.id, "pending");

    const { data, error } = await admin.rpc("finalize_penalty_proof", {
      p_challenge_id: challenge.id,
    });
    expect(error).toBeNull();
    expect(data).toContainEqual({ user_id: user.id, outcome: "accepted", debt_amount: 0 });

    expect(await debtsFor(user.id, challenge.id)).toHaveLength(0);
    const { data: proof } = await admin
      .from("penalty_proofs")
      .select("status")
      .eq("challenge_id", challenge.id)
      .eq("user_id", user.id)
      .single();
    expect(proof!.status).toBe("accepted");
  });

  it("rejected(과반 반려) → 2X debt(open) 적재", async () => {
    const user = await createUser();
    const group = await createGroup(user.id);
    const challenge = await createClosedMissedChallenge(group.id, user.id, {
      penaltyMission: "플랭크 30초",
    });
    await admin.rpc("settle_challenge", { p_challenge_id: challenge.id });
    await insertProof(challenge.id, user.id, "rejected");

    const { data, error } = await admin.rpc("finalize_penalty_proof", {
      p_challenge_id: challenge.id,
    });
    expect(error).toBeNull();
    expect(data).toContainEqual({ user_id: user.id, outcome: "rejected", debt_amount: 6000 });

    const debts = await debtsFor(user.id, challenge.id);
    expect(debts).toEqual([{ amount: 6000, status: "open" }]);
  });

  it("미제출 → expired → 2X debt(open) 적재", async () => {
    const user = await createUser();
    const group = await createGroup(user.id);
    const challenge = await createClosedMissedChallenge(group.id, user.id, {
      penaltyMission: "플랭크 30초",
    });
    await admin.rpc("settle_challenge", { p_challenge_id: challenge.id });

    const { data, error } = await admin.rpc("finalize_penalty_proof", {
      p_challenge_id: challenge.id,
    });
    expect(error).toBeNull();
    expect(data).toContainEqual({ user_id: user.id, outcome: "expired", debt_amount: 6000 });
    expect(await debtsFor(user.id, challenge.id)).toEqual([{ amount: 6000, status: "open" }]);
  });

  it("재호출 멱등 — debt 1건만(중복 적재 없음)", async () => {
    const user = await createUser();
    const group = await createGroup(user.id);
    const challenge = await createClosedMissedChallenge(group.id, user.id, {
      penaltyMission: "플랭크 30초",
    });
    await admin.rpc("settle_challenge", { p_challenge_id: challenge.id });

    const first = await admin.rpc("finalize_penalty_proof", { p_challenge_id: challenge.id });
    expect(first.error).toBeNull();
    const second = await admin.rpc("finalize_penalty_proof", { p_challenge_id: challenge.id });
    expect(second.error).toBeNull();

    expect(await debtsFor(user.id, challenge.id)).toEqual([{ amount: 6000, status: "open" }]);
  });

  it("창2 미만료 → 거부(window not yet expired)", async () => {
    const user = await createUser();
    const group = await createGroup(user.id);
    // 종료 1일 전 → 종료+96h 가 미래라 만료 전.
    const challenge = await createClosedMissedChallenge(group.id, user.id, {
      penaltyMission: "플랭크 30초",
      startDaysAgo: 8,
      endDaysAgo: 1,
    });
    const { error } = await admin.rpc("finalize_penalty_proof", { p_challenge_id: challenge.id });
    expect(error).not.toBeNull();
  });
});

describe("carry-over 수금 — 같은 그룹 다음 정산 (EVAL-0045 / ADR-0039)", () => {
  it("open debt → 다음 정산에서 penalty_debt_carryover(−2X)·pool 합산·debt settled", async () => {
    const user = await createUser();
    const group = await createGroup(user.id);

    // 원천: deferred 벌칙 챌린지 미달 → 미제출 → 2X(6000) open debt.
    const origin = await createClosedMissedChallenge(group.id, user.id, {
      penaltyMission: "플랭크 30초",
    });
    await admin.rpc("settle_challenge", { p_challenge_id: origin.id });
    await admin.rpc("finalize_penalty_proof", { p_challenge_id: origin.id });
    expect(await debtsFor(user.id, origin.id)).toEqual([{ amount: 6000, status: "open" }]);

    // 수금 챌린지(같은 그룹, deposit 0 → forfeit 0 이라 pool 은 carry-over 만).
    const collect = await createClosedMissedChallenge(group.id, user.id, {
      penaltyMission: null,
      deposit: 0,
      startDaysAgo: 8,
      endDaysAgo: 1,
    });
    const { error } = await admin.rpc("settle_challenge", { p_challenge_id: collect.id });
    expect(error).toBeNull();

    const ledger = await ledgerRows(collect.id, user.id);
    expect(ledger).toContainEqual({ delta: -6000, reason: "penalty_debt_carryover" });

    const row = await settlementRow(collect.id);
    expect(row!.pool_points).toBe(6000); // forfeit 0 + carry-over 6000

    expect(await debtsFor(user.id, origin.id)).toEqual([{ amount: 6000, status: "settled" }]);
  });

  it("재정산 멱등 — carry-over 원장 1행·pool 동일·debt 재수금 없음(settlements 불변)", async () => {
    const user = await createUser();
    const group = await createGroup(user.id);

    const origin = await createClosedMissedChallenge(group.id, user.id, {
      penaltyMission: "플랭크 30초",
    });
    await admin.rpc("settle_challenge", { p_challenge_id: origin.id });
    await admin.rpc("finalize_penalty_proof", { p_challenge_id: origin.id });

    const collect = await createClosedMissedChallenge(group.id, user.id, {
      penaltyMission: null,
      deposit: 0,
      startDaysAgo: 8,
      endDaysAgo: 1,
    });
    const first = await admin.rpc("settle_challenge", { p_challenge_id: collect.id });
    expect(first.error).toBeNull();
    const second = await admin.rpc("settle_challenge", { p_challenge_id: collect.id });
    expect(second.error).toBeNull(); // 멱등 게이트(settlements PK) → no-op

    const carryRows = (await ledgerRows(collect.id, user.id)).filter(
      (e) => e.reason === "penalty_debt_carryover",
    );
    expect(carryRows).toHaveLength(1);

    const row = await settlementRow(collect.id);
    expect(row!.pool_points).toBe(6000); // 사후 UPDATE 없음 — 재정산해도 동일
  });
});
