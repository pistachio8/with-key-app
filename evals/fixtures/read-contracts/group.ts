// EVAL-0016 보존 eval fixture — 그룹 상세(fetchGroupDetail) 계약 스냅샷.
// RLS(groups_select_member 등)가 비멤버를 거른다는 전제의 멤버 시점 rows.

export const GROUP_ID = "g1";

export const GROUP_TABLES: Record<string, Array<Record<string, unknown>>> = {
  groups: [
    {
      id: "g1",
      name: "운동 그룹",
      owner_id: "u1",
      bank_code: "088",
      account_holder: "민지",
      account_number_last4: "1234",
    },
  ],
  group_members: [
    {
      user_id: "u1",
      role: "owner",
      joined_at: "2026-04-01T00:00:00Z",
      users: { display_name: "민지" },
    },
    {
      user_id: "u2",
      role: "member",
      joined_at: "2026-04-02T00:00:00Z",
      users: { display_name: "제이" },
    },
  ],
  challenges: [
    {
      id: "c1",
      title: "아침 운동",
      status: "active",
      start_at: "2026-05-01T00:00:00Z",
      end_at: "2026-05-08T00:00:00Z",
      created_at: "2026-05-01T00:00:00Z",
    },
  ],
};

// GroupDetailView (@withkey/domain read-contracts).
export const GROUP_EXPECTED = {
  id: "g1",
  name: "운동 그룹",
  ownerId: "u1",
  bankCode: "088",
  accountHolder: "민지",
  accountNumberLast4: "1234",
  members: [
    { id: "u1", displayName: "민지", role: "owner", joinedAt: "2026-04-01T00:00:00Z" },
    { id: "u2", displayName: "제이", role: "member", joinedAt: "2026-04-02T00:00:00Z" },
  ],
  challenges: [
    {
      id: "c1",
      title: "아침 운동",
      status: "active",
      startAt: "2026-05-01T00:00:00Z",
      endAt: "2026-05-08T00:00:00Z",
    },
  ],
};
