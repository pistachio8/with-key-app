// 보존 fixture — home "만회 찬스 대기"(PenaltyWaitingView) RLS-direct 조립 snapshot (spec §C2).
// web penalty-waiting.ts(fetchPenaltyWaitingInner) 와 동일 의미 — RN fetchPenaltyWaiting 이 같은 EXPECTED.
// mock supabase 는 필터 no-op 이라 모든 challenge row 가 closed+penalty_mission. 변별은 read 의
// in-memory 창2 게이트([종료+48h,+96h]) + viewer 서약 멤버십. NOW 기준 cw1 만 통과.
export const PENALTY_WAITING_NOW = "2026-05-10T00:00:00.000Z";
export const PENALTY_WAITING_VIEWER = "u-minji";

export const PENALTY_WAITING_TABLES: Record<string, Array<Record<string, unknown>>> = {
  groups: [{ id: "g1", name: "운동 그룹", disbanded_at: null }],
  challenges: [
    // cw1 — 종료+72h(창2 open), viewer 서약 → 포함
    {
      id: "cw1",
      title: "주 3회 헬스장",
      group_id: "g1",
      penalty_amount: 3000,
      penalty_mission: "팔굽혀펴기 20개",
      status: "closed",
      end_at: "2026-05-07T00:00:00Z",
      closed_at: "2026-05-07T00:00:00Z",
    },
    // cw2 — 종료+12h(창2 전) → 제외(창)
    {
      id: "cw2",
      title: "아침 러닝",
      group_id: "g1",
      penalty_amount: 2000,
      penalty_mission: "스쿼트 30개",
      status: "closed",
      end_at: "2026-05-09T12:00:00Z",
      closed_at: "2026-05-09T12:00:00Z",
    },
    // cw3 — 종료+120h(창2 만료) → 제외(창)
    {
      id: "cw3",
      title: "주말 등산",
      group_id: "g1",
      penalty_amount: 5000,
      penalty_mission: "버피 15개",
      status: "closed",
      end_at: "2026-05-05T00:00:00Z",
      closed_at: "2026-05-05T00:00:00Z",
    },
    // cw4 — 종료+72h(창2 open) but viewer 미서약(참가 row 없음) → 제외(자격)
    {
      id: "cw4",
      title: "저녁 요가",
      group_id: "g1",
      penalty_amount: 1000,
      penalty_mission: "플랭크 1분",
      status: "closed",
      end_at: "2026-05-07T00:00:00Z",
      closed_at: "2026-05-07T00:00:00Z",
    },
  ],
  challenge_participants: [
    { challenge_id: "cw1", user_id: "u-minji", signed_at: "2026-05-01T00:00:00Z" },
    { challenge_id: "cw2", user_id: "u-minji", signed_at: "2026-05-01T00:00:00Z" },
    { challenge_id: "cw3", user_id: "u-minji", signed_at: "2026-05-01T00:00:00Z" },
  ],
};

// PenaltyWaitingView[] (@withkey/domain read-contracts).
export const PENALTY_WAITING_EXPECTED = [
  { challengeId: "cw1", title: "주 3회 헬스장", groupName: "운동 그룹", penaltyAmount: 3000 },
];
