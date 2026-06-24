import { describe, expect, it } from "vitest";
import { admin } from "./setup";
import { createUser, createGroup, createPendingChallenge } from "./factories";

// EVAL-0042 / ADR-0039 — settle_challenge INSERT-once 재설계 회귀.
// 기존(0044)은 placeholder INSERT(pool=0) 후 UPDATE 로 최종값을 덮었으나, settlements_guard_writes
// (0043:38)가 비-INSERT 를 무조건 차단해 그 UPDATE 가 막혔다(static-analysis Blocker, ADR-0039).
// 0051 은 pool/distribution 을 선계산해 단일 INSERT 한다. 정상 정산(pool>0)이 에러 없이 성공하고
// 스냅샷이 최종값을 담으면, 사후 UPDATE 경로가 아님이 증명된다(옛 경로면 UPDATE 가 42501 로 실패).
//
// 실측 위치: integration(공유 Supabase, CI 가 PR migration 적용 후 RPC service_role 직접 호출).
// unit 으로는 검증 불가 — settle_challenge 산식·트리거 상호작용은 SQL 에만 있다.

const DAY = 86_400_000;

// 1주(duration 7, goal 3) 챌린지를 종료 상태로 만들고, 미달(인증 0건) 서명 참가자 1인에 보증금 hold.
// 인증 0건 → 1주 완전 미달 → confirmedPenalty = penalty_amount(3000).
async function setupClosedMissedChallenge(opts: { penaltyMission?: string } = {}) {
  const user = await createUser({ displayName: "settler" });
  const group = await createGroup(user.id);
  const challenge = await createPendingChallenge(group.id, {
    durationDays: 7,
    goalCount: 3,
    penaltyAmount: 3000,
  });

  const startInstant = Date.now() - 8 * DAY; // 8일 전 시작 → 1주 완전 경과
  const closedAt = new Date(startInstant + 7 * DAY).toISOString();
  const { error: chErr } = await admin
    .from("challenges")
    .update({
      status: "closed",
      start_at: new Date(startInstant).toISOString(),
      end_at: closedAt,
      closed_at: closedAt,
      penalty_mission: opts.penaltyMission ?? null,
    })
    .eq("id", challenge.id);
  if (chErr) throw chErr;

  // 서명 참가자 + 보증금(deposit_points). service_role 이라 deposit_points 가드(0044) 통과.
  const { error: cpErr } = await admin.from("challenge_participants").insert({
    challenge_id: challenge.id,
    user_id: user.id,
    signed_at: new Date(startInstant).toISOString(),
    deposit_points: 3000,
  });
  if (cpErr) throw cpErr;

  return { user, group, challenge };
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

async function ledgerRows(challengeId: string, userId: string) {
  const { data, error } = await admin
    .from("point_ledger")
    .select("delta, reason")
    .eq("challenge_id", challengeId)
    .eq("user_id", userId);
  if (error) throw error;
  return data as Array<{ delta: number; reason: string }>;
}

describe("settle_challenge — 단일 INSERT 재설계 (EVAL-0042 / ADR-0039)", () => {
  it("미달 정산이 에러 없이 성공하고 스냅샷이 최종 pool/distribution 을 담는다(UPDATE 경로 아님)", async () => {
    const { user, challenge } = await setupClosedMissedChallenge();

    const { error } = await admin.rpc("settle_challenge", { p_challenge_id: challenge.id });
    expect(error).toBeNull(); // 옛 placeholder→UPDATE 경로면 settlements_guard_writes 가 42501

    const row = await settlementRow(challenge.id);
    expect(row).not.toBeNull();
    // placeholder 0 이 아니라 최종 미달분 3000 → 사후 UPDATE 없이 최종값으로 INSERT 됐음을 증명.
    expect(row!.pool_points).toBe(3000);
    expect(row!.distribution[user.id]).toEqual({ released: 3000, forfeit: 3000, net: 0 });

    const ledger = await ledgerRows(challenge.id, user.id);
    expect(ledger).toContainEqual({ delta: 3000, reason: "deposit_release" });
    expect(ledger).toContainEqual({ delta: -3000, reason: "penalty" });
  });

  it("재호출 멱등 — 추가 settlements/원장 행 없음(release+penalty 2행 유지)", async () => {
    const { user, challenge } = await setupClosedMissedChallenge();

    const first = await admin.rpc("settle_challenge", { p_challenge_id: challenge.id });
    expect(first.error).toBeNull();
    const second = await admin.rpc("settle_challenge", { p_challenge_id: challenge.id });
    expect(second.error).toBeNull(); // 멱등 게이트(settlements PK) → no-op

    const ledger = await ledgerRows(challenge.id, user.id);
    expect(ledger).toHaveLength(2);
  });

  it("벌칙 챌린지(penalty_mission) — penalty deferred: pool 0·redemption_pending·penalty 원장 없음", async () => {
    const { user, challenge } = await setupClosedMissedChallenge({ penaltyMission: "30초 플랭크" });

    const { error } = await admin.rpc("settle_challenge", { p_challenge_id: challenge.id });
    expect(error).toBeNull();

    const row = await settlementRow(challenge.id);
    expect(row!.pool_points).toBe(0); // deferred → 이 정산 미차감
    expect(row!.distribution["redemption_pending"]).toBe(true);
    expect(row!.distribution[user.id]).toEqual({ released: 3000, forfeit: 0, net: 3000 });

    const ledger = await ledgerRows(challenge.id, user.id);
    expect(ledger).toContainEqual({ delta: 3000, reason: "deposit_release" });
    expect(ledger.some((e) => e.reason === "penalty")).toBe(false);
  });
});
