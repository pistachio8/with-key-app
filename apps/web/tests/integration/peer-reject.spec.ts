import { describe, expect, it } from "vitest";
import { admin, asUser, expectRlsDenied } from "./setup";
import { createUser, createGroup, addMember, createPendingChallenge } from "./factories";

// EVAL-0025 / ADR-0038 — 🟨 익명 피어 반려 RPC(toggle_peer_rejection) + RLS 익명성 검증.
// 자기 반려 거부 · 본인 제외 과반(> (N-1)/2) 전이 · 토글 복원 · 그룹장 1표 · 48h 시간창 ·
// 익명성(타인 voter_id 비노출). N = 서약 완료 참가자(signed_at not null).

type TestUser = { id: string; email: string; password: string };

// 서명 참가자 N명(작성자 포함) + 작성자의 passed 인증 1건. owner 는 voters[0].
async function setupSignedChallenge(opts: {
  voterCount: number; // 작성자 외 서명 참가자 수
  closedAt?: string | null; // 48h 윈도우 테스트용(종료 시각)
}) {
  const owner = await createUser({ displayName: "owner" });
  const author = await createUser({ displayName: "author" });
  const voters: TestUser[] = [owner];
  for (let i = 1; i < opts.voterCount; i++) {
    voters.push(await createUser({ displayName: `voter-${i}` }));
  }

  const group = await createGroup(owner.id); // owner 는 group_members 에 owner role 로 들어감
  await addMember(group.id, author.id);
  for (const v of voters.slice(1)) await addMember(group.id, v.id);

  const challenge = await createPendingChallenge(group.id);

  // 활성화 + 종료 시각. 48h 테스트는 closedAt 을 과거로.
  const now = Date.now();
  const startAt = new Date(now - 86_400_000).toISOString(); // 1일 전 시작
  const endAt = opts.closedAt ?? new Date(now + 6 * 86_400_000).toISOString();
  const { error: chErr } = await admin
    .from("challenges")
    .update({
      status: opts.closedAt ? "closed" : "active",
      start_at: startAt,
      end_at: endAt,
      closed_at: opts.closedAt ?? null,
    })
    .eq("id", challenge.id);
  if (chErr) throw chErr;

  // 서명 참가자: 작성자 + voters (N = voterCount + 1)
  const signedAt = new Date(now - 86_400_000).toISOString();
  const participants = [author, ...voters].map((u) => ({
    challenge_id: challenge.id,
    user_id: u.id,
    signed_at: signedAt,
  }));
  const { error: cpErr } = await admin.from("challenge_participants").insert(participants);
  if (cpErr) throw cpErr;

  // 작성자의 인증 1건(기본 passed).
  const { data: log, error: logErr } = await admin
    .from("action_logs")
    .insert({
      challenge_id: challenge.id,
      user_id: author.id,
      activity_type: "gym",
      photo_path: "test/photo.jpg",
      selected_keywords: ["뿌듯"],
      shown_keywords: ["뿌듯", "상쾌"],
      ai_summary: "오늘도 운동 완료.",
      prompt_version: "test",
    })
    .select("id, auto_verify_status")
    .single();
  if (logErr) throw logErr;

  return { author, owner, voters, group, challenge, logId: log.id as string };
}

async function statusOf(logId: string): Promise<string> {
  const { data } = await admin
    .from("action_logs")
    .select("auto_verify_status")
    .eq("id", logId)
    .single();
  return (data as { auto_verify_status: string }).auto_verify_status;
}

describe("toggle_peer_rejection RPC (EVAL-0025)", () => {
  it("작성자는 본인 인증을 반려할 수 없다 (AC-peer-reject-2)", async () => {
    const { author, logId } = await setupSignedChallenge({ voterCount: 3 });
    const authorClient = await asUser(author);
    const { error } = await authorClient.rpc("toggle_peer_rejection", { p_action_log_id: logId });
    expectRlsDenied(error);
    expect(await statusOf(logId)).toBe("passed");
  });

  it("본인 제외 과반(> (N-1)/2) 도달 시 passed → peer_rejected (AC-peer-reject-2)", async () => {
    // N=4(작성자+voter 3). (N-1)/2 = 1.5 → 2표부터 과반.
    const { voters, logId } = await setupSignedChallenge({ voterCount: 3 });

    const v1 = await asUser(voters[0]); // owner
    const r1 = await v1.rpc("toggle_peer_rejection", { p_action_log_id: logId });
    expect(r1.error).toBeNull();
    expect(r1.data?.[0]?.peer_reject_count).toBe(1);
    expect(await statusOf(logId)).toBe("passed"); // 1 < 1.5 → 미달, 그룹장 1표는 전용 권한 없음(AC-peer-reject-4)

    const v2 = await asUser(voters[1]);
    const r2 = await v2.rpc("toggle_peer_rejection", { p_action_log_id: logId });
    expect(r2.error).toBeNull();
    expect(r2.data?.[0]?.peer_reject_count).toBe(2);
    expect(r2.data?.[0]?.status).toBe("peer_rejected"); // 2 > 1.5 → 과반
    expect(await statusOf(logId)).toBe("peer_rejected");
  });

  it("토글로 과반 미달 시 peer_rejected → passed 복원 (AC-peer-reject-3)", async () => {
    const { voters, logId } = await setupSignedChallenge({ voterCount: 3 });
    const v1 = await asUser(voters[0]);
    const v2 = await asUser(voters[1]);
    await v1.rpc("toggle_peer_rejection", { p_action_log_id: logId });
    await v2.rpc("toggle_peer_rejection", { p_action_log_id: logId });
    expect(await statusOf(logId)).toBe("peer_rejected");

    // v2 가 토글 취소 → count 1, 미달 → passed 복원
    const off = await v2.rpc("toggle_peer_rejection", { p_action_log_id: logId });
    expect(off.data?.[0]?.peer_reject_count).toBe(1);
    expect(off.data?.[0]?.viewer_rejected).toBe(false);
    expect(await statusOf(logId)).toBe("passed");
  });

  it("익명성: 다른 voter 의 반려 행을 raw SELECT 로 볼 수 없다 (본인 행만, AC-peer-reject-1)", async () => {
    const { voters, logId } = await setupSignedChallenge({ voterCount: 3 });
    const v1 = await asUser(voters[0]);
    await v1.rpc("toggle_peer_rejection", { p_action_log_id: logId });

    // v2(반려 안 함)가 peer_rejections 를 직접 조회 → RLS(본인 행만)로 0행. v1 의 voter_id 비노출.
    const v2 = await asUser(voters[1]);
    const { data: rows } = await v2
      .from("peer_rejections")
      .select("voter_id")
      .eq("action_log_id", logId);
    expect(rows ?? []).toHaveLength(0);

    // 집계는 admin(서비스 경계)으로만 — 카운트는 1.
    const { count } = await admin
      .from("peer_rejections")
      .select("id", { count: "exact", head: true })
      .eq("action_log_id", logId);
    expect(count).toBe(1);
  });

  it("클라이언트 직접 write 금지: peer_rejections INSERT 는 RLS 로 거부된다 (write=RPC 한 경로)", async () => {
    const { voters, author, logId } = await setupSignedChallenge({ voterCount: 3 });
    const v1 = await asUser(voters[0]);
    const { error } = await v1
      .from("peer_rejections")
      .insert({ action_log_id: logId, voter_id: voters[0].id });
    expectRlsDenied(error);
    void author;
  });

  it("48h 시간창: 종료 + 48h 이후에는 토글이 거부된다 (AC-peer-reject-3)", async () => {
    // 3일 전 종료 → 종료+48h(=1일 전) 이후라 무효.
    const closedAt = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const { voters, logId } = await setupSignedChallenge({ voterCount: 3, closedAt });
    const v1 = await asUser(voters[0]);
    const { error } = await v1.rpc("toggle_peer_rejection", { p_action_log_id: logId });
    expectRlsDenied(error);
    expect(await statusOf(logId)).toBe("passed");
  });
});
