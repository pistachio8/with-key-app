// @vitest-environment node
// WS2 (ADR 없음 — 표시 값 변경) — fetchCurrentChallenges 의 potTotal 이 "인원수 × 벌금"
// 최대값이 아니라 정보탭과 동일한 computeAccruedPot(미달자 기준 실제 정산액)인지 검증.
// 핵심 회귀: 전체 참가자 로그를 per-user distinct KST 일자로 집계해야 미달자만 합산된다.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

// 테이블별 데이터를 반환하는 chainable thenable mock.
// 실제 supabase-js 빌더는 어느 체인 지점에서도 await 가능하므로 then 으로 resolve.
type Row = Record<string, unknown>;
function makeBuilder(rows: Row[]) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "is", "in", "eq", "order"]) {
    builder[m] = () => builder;
  }
  builder.then = (resolve: (v: { data: Row[]; error: null }) => unknown) =>
    resolve({ data: rows, error: null });
  return builder;
}

const TABLES: Record<string, Row[]> = {
  groups: [
    {
      id: "g1",
      name: "그룹",
      bank_code: null,
      account_holder: null,
      account_number_last4: null,
    },
  ],
  challenges: [
    {
      id: "c1",
      group_id: "g1",
      title: "아침 운동",
      goal_count: 3,
      duration_days: 7,
      penalty_amount: 3000,
      status: "active",
      start_at: "2026-05-01T00:00:00Z",
      end_at: "2026-05-08T15:00:00Z",
      created_at: "2026-05-01T00:00:00Z",
    },
  ],
  // u1(viewer): 3개 distinct KST 일자 → doneCount 3 ≥ goal 3 → 달성(0원)
  // u2: 1개 일자 → 미달 → 3000원. 누적금 = 3000 (인원수×벌금=6000 아님)
  action_logs: [
    { challenge_id: "c1", user_id: "u1", created_at: "2026-05-01T03:00:00Z" },
    { challenge_id: "c1", user_id: "u1", created_at: "2026-05-02T03:00:00Z" },
    { challenge_id: "c1", user_id: "u1", created_at: "2026-05-03T03:00:00Z" },
    { challenge_id: "c1", user_id: "u2", created_at: "2026-05-01T03:00:00Z" },
  ],
  challenge_participants: [
    { challenge_id: "c1", user_id: "u1" },
    { challenge_id: "c1", user_id: "u2" },
  ],
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: (table: string) => makeBuilder(TABLES[table] ?? []),
  }),
}));

describe("fetchCurrentChallenges — potTotal = computeAccruedPot (WS2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("미달자만 합산 — 달성자(viewer)는 제외하고 누적금 = 3000 (6000 아님)", async () => {
    const { fetchCurrentChallenges } = await import("./current-challenges");
    const views = await fetchCurrentChallenges("u1");

    const ch = views[0]?.challenge;
    expect(ch).toBeTruthy();
    expect(ch?.participantCount).toBe(2);
    expect(ch?.doneCount).toBe(3); // viewer(u1) 본인 distinct KST 일자
    expect(ch?.potTotal).toBe(3000); // u2(미달)만 합산. 인원수×벌금(6000) 아님
  });
});
