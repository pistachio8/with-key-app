// EVAL-0016 보존 eval fixture — 정산(fetchRecap) 계약 스냅샷.
// 시나리오는 web recap.spec.ts 와 동일 의미: 7일·주3회 closed(자연 종료),
// 민지 3일(달성)·JJ 5일(달성·MVP)·희수 1일(미달). now 는 옵션 주입이라 fake timer 불요.

export const RECAP_NOW = "2026-05-09T00:00:00.000Z";
export const RECAP_VIEWER = "u-minji";

export const RECAP_TABLES: Record<string, Array<Record<string, unknown>>> = {
  challenges: [
    {
      id: "c1",
      title: "주 3회 헬스장",
      goal_count: 3,
      duration_days: 7,
      penalty_amount: 3000,
      status: "closed",
      start_at: "2026-05-01T00:00:00Z",
      end_at: "2026-05-08T00:00:00Z",
      closed_at: "2026-05-08T00:00:00Z",
      feed_type: "image",
      groups: {
        id: "g1",
        name: "운동 그룹",
        owner_id: "u-minji",
        bank_code: null,
        account_holder: null,
        account_number_last4: null,
      },
    },
  ],
  challenge_participants: [
    { user_id: "u-minji", users: { display_name: "민지" } },
    { user_id: "u-jj", users: { display_name: "JJ" } },
    { user_id: "u-hee", users: { display_name: "희수" } },
  ],
  action_logs: [
    { user_id: "u-minji", created_at: "2026-05-01T03:00:00Z" },
    { user_id: "u-minji", created_at: "2026-05-02T03:00:00Z" },
    { user_id: "u-minji", created_at: "2026-05-03T03:00:00Z" },
    { user_id: "u-jj", created_at: "2026-05-01T03:00:00Z" },
    { user_id: "u-jj", created_at: "2026-05-02T03:00:00Z" },
    { user_id: "u-jj", created_at: "2026-05-03T03:00:00Z" },
    { user_id: "u-jj", created_at: "2026-05-04T03:00:00Z" },
    { user_id: "u-jj", created_at: "2026-05-05T03:00:00Z" },
    { user_id: "u-hee", created_at: "2026-05-01T03:00:00Z" },
  ],
};

// RecapView (@withkey/domain read-contracts).
export const RECAP_EXPECTED = {
  challengeId: "c1",
  title: "주 3회 헬스장",
  goalCount: 3,
  durationDays: 7,
  penaltyAmount: 3000,
  startAt: "2026-05-01T00:00:00Z",
  endAt: "2026-05-08T00:00:00Z",
  status: "closed",
  feedType: "image",
  viewerId: "u-minji",
  viewerAchieved: true,
  viewerDoneCount: 3,
  viewerPerHeadPenalty: 0,
  viewerElapsedWeeks: 1,
  viewerAchievedWeeks: 1,
  group: {
    id: "g1",
    name: "운동 그룹",
    ownerId: "u-minji",
    bankCode: null,
    accountHolder: null,
    accountNumberLast4: null,
  },
  members: [
    { id: "u-minji", displayName: "민지", doneCount: 3, achieved: true, isMvp: false },
    { id: "u-jj", displayName: "JJ", doneCount: 5, achieved: true, isMvp: true },
    { id: "u-hee", displayName: "희수", doneCount: 1, achieved: false, isMvp: false },
  ],
  anyoneAchieved: true,
};
