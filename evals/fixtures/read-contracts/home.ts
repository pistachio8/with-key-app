// EVAL-0016 보존 eval fixture — 홈 스트립(fetchCurrentChallenges) 계약 스냅샷.
// 02-rn-migration-harness §5.2 "read 계약 = 결정론(스냅샷)": 동일 rows 를 web read 와
// RN read service 에 넣고 둘 다 EXPECTED 와 일치해야 한다 (pass^k=100%).
// 시간 의존(phase·daysLeft·verifiedToday) 제거를 위해 양쪽 spec 은 fake timer 로 NOW 고정.
//
// 시나리오: 7일·주3회·벌금 3000. u1(viewer) 은 week1 3일 인증(달성), u2 는 1일(미달).
// NOW 는 end_at 경과 후 → phase "over", potTotal = 미달자 u2 의 3000 (인원수×벌금 아님).

export const HOME_NOW = "2026-05-09T16:00:00.000Z";
export const HOME_VIEWER = "u1";

export const HOME_TABLES: Record<string, Array<Record<string, unknown>>> = {
  groups: [
    {
      id: "g1",
      name: "운동 그룹",
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
      closed_at: null,
      created_at: "2026-05-01T00:00:00Z",
    },
  ],
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

// GroupChallengeView[] (@withkey/domain read-contracts) — 소비처 spec 에서 타입 검증.
export const HOME_EXPECTED = [
  {
    groupId: "g1",
    groupName: "운동 그룹",
    bankCode: null,
    accountHolder: null,
    accountNumberLast4: null,
    challenge: {
      id: "c1",
      title: "아침 운동",
      goalCount: 3,
      durationDays: 7,
      penaltyAmount: 3000,
      status: "active",
      phase: "over",
      startAt: "2026-05-01T00:00:00Z",
      endAt: "2026-05-08T15:00:00Z",
      doneCount: 3,
      daysLeft: -1,
      potTotal: 3000,
      myConfirmedPenalty: 0,
      participantCount: 2,
      userIsParticipant: true,
      verifiedToday: false,
    },
  },
];
