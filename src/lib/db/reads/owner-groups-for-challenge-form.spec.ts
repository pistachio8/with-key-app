import { describe, expect, it } from "vitest";
import { buildOwnerGroupsForChallengeForm } from "./owner-groups-for-challenge-form";

describe("buildOwnerGroupsForChallengeForm", () => {
  it("returns an empty list when owner has no groups", () => {
    expect(buildOwnerGroupsForChallengeForm([], [])).toEqual([]);
  });

  it("keeps a single owner group and attaches its latest challenge timestamp", () => {
    const groups = [
      {
        id: "group-1",
        name: "러닝 크루",
        created_at: "2026-05-20T00:00:00.000Z",
      },
    ];
    const challenges = [
      { group_id: "group-1", created_at: "2026-05-20T09:00:00.000Z" },
      { group_id: "group-1", created_at: "2026-05-21T09:00:00.000Z" },
    ];

    expect(buildOwnerGroupsForChallengeForm(groups, challenges)).toEqual([
      {
        id: "group-1",
        name: "러닝 크루",
        createdAt: "2026-05-20T00:00:00.000Z",
        latestChallengeCreatedAt: "2026-05-21T09:00:00.000Z",
      },
    ]);
  });

  it("sorts many owner groups by most recent challenge, then group creation", () => {
    const groups = [
      {
        id: "group-oldest",
        name: "오래된 그룹",
        created_at: "2026-05-18T00:00:00.000Z",
      },
      {
        id: "group-recent",
        name: "최근 챌린지 그룹",
        created_at: "2026-05-19T00:00:00.000Z",
      },
      {
        id: "group-no-challenge",
        name: "챌린지 없는 그룹",
        created_at: "2026-05-21T00:00:00.000Z",
      },
    ];
    const challenges = [
      { group_id: "group-oldest", created_at: "2026-05-19T09:00:00.000Z" },
      { group_id: "group-recent", created_at: "2026-05-21T09:00:00.000Z" },
    ];

    expect(buildOwnerGroupsForChallengeForm(groups, challenges).map((group) => group.id)).toEqual([
      "group-recent",
      "group-oldest",
      "group-no-challenge",
    ]);
  });
});
