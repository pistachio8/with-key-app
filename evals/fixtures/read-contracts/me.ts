// EVAL-0016 보존 eval fixture — /me 챌린지 목록(fetchMyChallenges) 계약 스냅샷.
// 운영(owner)/참여(member) 분리 + status rank 정렬(active > accepted > pending > closed).

export const ME_VIEWER = "u1";

export const ME_TABLES: Record<string, Array<Record<string, unknown>>> = {
  challenge_participants: [
    {
      challenge_id: "c-own",
      challenges: {
        id: "c-own",
        title: "운영 챌린지",
        status: "active",
        start_at: "2026-05-01T00:00:00Z",
        end_at: "2026-05-08T00:00:00Z",
        group_id: "g1",
        groups: { owner_id: "u1" },
      },
    },
    {
      challenge_id: "c-mem-closed",
      challenges: {
        id: "c-mem-closed",
        title: "참여 챌린지(종료)",
        status: "closed",
        start_at: "2026-04-01T00:00:00Z",
        end_at: "2026-04-08T00:00:00Z",
        group_id: "g2",
        groups: { owner_id: "u2" },
      },
    },
    {
      challenge_id: "c-mem-pending",
      challenges: {
        id: "c-mem-pending",
        title: "참여 챌린지(대기)",
        status: "pending",
        start_at: null,
        end_at: null,
        group_id: "g3",
        groups: { owner_id: "u3" },
      },
    },
  ],
};

// MyChallenges (@withkey/domain read-contracts).
export const ME_EXPECTED = {
  owner: [
    {
      id: "c-own",
      title: "운영 챌린지",
      status: "active",
      startAt: "2026-05-01T00:00:00Z",
      endAt: "2026-05-08T00:00:00Z",
      ownerId: "u1",
    },
  ],
  member: [
    {
      id: "c-mem-pending",
      title: "참여 챌린지(대기)",
      status: "pending",
      startAt: null,
      endAt: null,
      ownerId: "u3",
    },
    {
      id: "c-mem-closed",
      title: "참여 챌린지(종료)",
      status: "closed",
      startAt: "2026-04-01T00:00:00Z",
      endAt: "2026-04-08T00:00:00Z",
      ownerId: "u2",
    },
  ],
};
