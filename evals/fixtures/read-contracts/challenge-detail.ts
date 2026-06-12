// EVAL-0016 보존 eval fixture — 챌린지 상세(fetchChallengeDetail) 계약 스냅샷.
// home.ts 와 같은 시나리오 + users embed. EXPECTED 는 RN 계약(ChallengeDetailView) —
// web 결과의 서버 전용 doneByWeek(Map, JSON 직렬화 불가)는 비교 전에 strip 한다.

export const DETAIL_NOW = "2026-05-09T16:00:00.000Z";
export const DETAIL_CHALLENGE_ID = "c1";

export const DETAIL_TABLES: Record<string, Array<Record<string, unknown>>> = {
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
    { user_id: "u1", signed_at: "2026-04-30T00:00:00Z", users: { display_name: "민지" } },
    { user_id: "u2", signed_at: null, users: { display_name: "제이" } },
  ],
  action_logs: [
    { user_id: "u1", created_at: "2026-05-01T03:00:00Z" },
    { user_id: "u1", created_at: "2026-05-02T03:00:00Z" },
    { user_id: "u1", created_at: "2026-05-03T03:00:00Z" },
    { user_id: "u2", created_at: "2026-05-01T03:00:00Z" },
  ],
};

// ChallengeDetailView (@withkey/domain read-contracts).
export const DETAIL_EXPECTED = {
  id: "c1",
  title: "아침 운동",
  goalCount: 3,
  durationDays: 7,
  penaltyAmount: 3000,
  status: "active",
  startAt: "2026-05-01T00:00:00Z",
  endAt: "2026-05-08T15:00:00Z",
  closedAt: null,
  members: [
    { id: "u1", displayName: "민지", doneCount: 3, signed: true },
    { id: "u2", displayName: "제이", doneCount: 1, signed: false },
  ],
  potTotal: 3000,
  participantCount: 2,
  group: {
    id: "g1",
    ownerId: "u1",
    bankCode: null,
    accountHolder: null,
    accountNumberLast4: null,
  },
};
