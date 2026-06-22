import { describe, expect, it } from "vitest";
import { admin } from "./setup";
import { createUser, createGroup, createPendingChallenge } from "./factories";

// EVAL-0040 / ADR-0032 — 🐞 정산 미달분 산정 RPC `_settlement_confirmed_penalties` 가
// 과반 익명 반려(auto_verify_status='peer_rejected') 인증을 "달성한 날(done day)"로 세던
// 버그의 회귀 테스트. 0045 가 'peer_rejected'=주간 카운트 제외로 선언했고 EVAL-0032/0039 는
// web read 에서 제외했으나, 0044 RPC 는 같은 제외가 빠져 반려 멤버가 미달 penalty 를 면제받았다.
// 0050 forward migration 이 done_days CTE 에 `auto_verify_status <> 'peer_rejected'` 를 추가한다.
//
// 실측 위치: integration(공유 Supabase, CI 가 PR migration 적용 후 RPC 직접 호출). unit 으로는
// 검증 불가 — done_days→penalty 산식은 SQL 에만 있고 domain `computeSettlement` 는 산출된
// confirmedPenalty 를 입력으로만 받는다.

const DAY = 86_400_000;

// 1주(duration 7, goal 3, penalty 3000) 챌린지에 작성자 1인 + 서로 다른 KST 날짜의 passed 인증 3건.
// markRejectedDayIndex 가 주어지면 그 날의 인증을 admin(service_role)으로 peer_rejected 로 전환한다.
async function setupOneWeekChallenge(opts: { markRejectedDayIndex?: 1 | 2 | 3 } = {}) {
  const author = await createUser({ displayName: "author" });
  const group = await createGroup(author.id);
  const challenge = await createPendingChallenge(group.id, {
    durationDays: 7,
    goalCount: 3,
    penaltyAmount: 3000,
  });

  // start_day = 3일 전(KST). 인증 3건은 day index 1·2·3(= start_day, +1, +2)로 모두 범위 [1,7] 안.
  const now = Date.now();
  const startInstant = now - 3 * DAY;
  const startAt = new Date(startInstant).toISOString();
  const { error: chErr } = await admin
    .from("challenges")
    .update({
      status: "active",
      start_at: startAt,
      end_at: new Date(startInstant + 7 * DAY).toISOString(),
      closed_at: null,
    })
    .eq("id", challenge.id);
  if (chErr) throw chErr;

  const signedAt = new Date(startInstant).toISOString();
  const { error: cpErr } = await admin
    .from("challenge_participants")
    .insert({ challenge_id: challenge.id, user_id: author.id, signed_at: signedAt });
  if (cpErr) throw cpErr;

  // day index 1·2·3 의 인증 3건(KST 날짜는 정확히 24h 간격이라 distinct). 기본 status=passed.
  const dayIndexes = [1, 2, 3] as const;
  const logIdByDay: Record<number, string> = {};
  for (const d of dayIndexes) {
    const createdAt = new Date(startInstant + (d - 1) * DAY).toISOString();
    const { data: log, error: logErr } = await admin
      .from("action_logs")
      .insert({
        challenge_id: challenge.id,
        user_id: author.id,
        activity_type: "gym",
        photo_path: `test/photo-${d}.jpg`,
        selected_keywords: ["뿌듯"],
        shown_keywords: ["뿌듯", "상쾌"],
        ai_summary: "오늘도 운동 완료.",
        prompt_version: "test",
        created_at: createdAt,
      })
      .select("id")
      .single();
    if (logErr) throw logErr;
    logIdByDay[d] = log.id as string;
  }

  if (opts.markRejectedDayIndex) {
    // service_role 의 auto_verify_status UPDATE 는 0045 B 가드(prevent_ai_column_update)가 허용.
    const { error: updErr } = await admin
      .from("action_logs")
      .update({ auto_verify_status: "peer_rejected" })
      .eq("id", logIdByDay[opts.markRejectedDayIndex]);
    if (updErr) throw updErr;
  }

  return { author, challenge };
}

async function confirmedPenaltyFor(challengeId: string, userId: string): Promise<number> {
  const { data, error } = await admin.rpc("_settlement_confirmed_penalties", {
    p_challenge_id: challengeId,
  });
  if (error) throw error;
  const row = (data as Array<{ user_id: string; confirmed_penalty: number }>).find(
    (r) => r.user_id === userId,
  );
  return row?.confirmed_penalty ?? 0;
}

describe("_settlement_confirmed_penalties — peer_rejected 제외 (EVAL-0040)", () => {
  it("passed 인증 1건이 peer_rejected 로 전환되면 done 에서 제외돼 미달 penalty 가 산정된다", async () => {
    // 3건 모두 passed 면 done=3 == goal 3 → 미달 아님. day3 을 peer_rejected 로 → done=2 < 3 → 미달 1주.
    const { author, challenge } = await setupOneWeekChallenge({ markRejectedDayIndex: 3 });
    // penalty_amount(3000) × 미달 1주.
    expect(await confirmedPenaltyFor(challenge.id, author.id)).toBe(3000);
  });

  it("모두 passed 면(반려 없음) 목표 달성으로 penalty 0 — 과다 제외 회귀 방지", async () => {
    const { author, challenge } = await setupOneWeekChallenge();
    expect(await confirmedPenaltyFor(challenge.id, author.id)).toBe(0);
  });
});
