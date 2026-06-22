// @vitest-environment node
// EVAL-0032 회귀 — 멤버 현황판 doneCount(표시)가 auto_verify_status='peer_rejected' 를 제외하는지.
// dogfood 버그(#qa 2026-06-19): 과반 피어 반려가 챌린지 상세 보드에 반영 안 됨.
// 핵심: 표시 doneCount 는 peer_rejected 제외, pot 용 doneByWeek(full)은 보존(정산 측 제외는 EVAL-0008 역방향).
import { describe, it, expect, vi, beforeEach } from "vitest";

// react cache() 는 RSC 컨텍스트 의존 — 테스트에선 passthrough 로 풀어 순수 함수처럼 호출.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});

// 테이블별 데이터를 반환하는 chainable thenable mock. challenge 는 maybeSingle, 나머지는 eq 종단 await.
type Row = Record<string, unknown>;
function makeBuilder(rows: Row[]) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) builder[m] = () => builder;
  builder.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
  builder.then = (resolve: (v: { data: Row[]; error: null }) => unknown) =>
    resolve({ data: rows, error: null });
  return builder;
}

const TABLES: Record<string, Row[]> = {
  challenges: [
    {
      id: "c1",
      title: "아침 운동",
      goal_count: 3,
      duration_days: 7,
      penalty_amount: 3000,
      status: "active",
      start_at: "2026-05-01T00:00:00Z",
      end_at: "2026-05-08T15:00:00Z",
      closed_at: null,
      group_id: "g1",
      groups: {
        id: "g1",
        owner_id: "u1",
        bank_code: null,
        account_holder: null,
        account_number_last4: null,
      },
    },
  ],
  challenge_participants: [
    { user_id: "u1", signed_at: "2026-05-01T00:00:00Z", users: { display_name: "민지" } },
    { user_id: "u2", signed_at: "2026-05-01T00:00:00Z", users: { display_name: "JJ" } },
  ],
  // u2: passed 2일(05-01·05-02) + peer_rejected 1일(05-03) → 표시 doneCount 2, full doneByWeek 합 3.
  action_logs: [
    { user_id: "u1", created_at: "2026-05-01T03:00:00Z", auto_verify_status: "passed" },
    { user_id: "u2", created_at: "2026-05-01T03:00:00Z", auto_verify_status: "passed" },
    { user_id: "u2", created_at: "2026-05-02T03:00:00Z", auto_verify_status: "passed" },
    { user_id: "u2", created_at: "2026-05-03T03:00:00Z", auto_verify_status: "peer_rejected" },
  ],
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: (table: string) => makeBuilder(TABLES[table] ?? []),
  }),
}));

describe("fetchChallengeDetail — 멤버 doneCount 가 peer_rejected 제외 (EVAL-0032)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("과반 반려된 인증일은 표시 doneCount 에서 빠지고, pot 용 doneByWeek(full)은 보존된다", async () => {
    const { fetchChallengeDetail } = await import("./challenge-detail");
    const view = await fetchChallengeDetail("c1");
    expect(view).toBeTruthy();

    const u2 = view?.members.find((m) => m.id === "u2");
    expect(u2).toBeTruthy();
    // 표시: peer_rejected(05-03) 제외 → 2 (버그 시점엔 3 이었음)
    expect(u2?.doneCount).toBe(2);
    // pot/정산 집합(full): 3일 그대로 — Non-goal(정산 측 제외는 EVAL-0008 역방향)
    let full = 0;
    for (const n of u2?.doneByWeek.values() ?? []) full += n;
    expect(full).toBe(3);

    // 반려가 없는 멤버는 영향 없음
    const u1 = view?.members.find((m) => m.id === "u1");
    expect(u1?.doneCount).toBe(1);
  });

  // EVAL-0039: 대시보드 "이번 주 진척" 링·"주차 기록" 칩이 쓰는 viewer 표시 집합 검증.
  it("표시 집합 visibleDoneByWeek 는 peer_rejected 를 제외하고, pot 용 doneByWeek(full)은 보존된다 (EVAL-0039)", async () => {
    const { fetchChallengeDetail } = await import("./challenge-detail");
    const view = await fetchChallengeDetail("c1");
    const u2 = view?.members.find((m) => m.id === "u2");
    expect(u2).toBeTruthy();

    // 링·칩 표시 집합: peer_rejected(05-03) 제외 → 주차 합 2 (버그 시점엔 full 3 으로 셈)
    let visible = 0;
    for (const n of u2?.visibleDoneByWeek.values() ?? []) visible += n;
    expect(visible).toBe(2);

    // pot/정산 집합(full)은 불변: 3일 그대로 — Non-goal(정산 측 제외는 EVAL-0008 역방향)
    let full = 0;
    for (const n of u2?.doneByWeek.values() ?? []) full += n;
    expect(full).toBe(3);
  });
});
