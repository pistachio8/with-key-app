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
      {
        id: "ch-1",
        group_id: "group-1",
        status: "closed",
        created_at: "2026-05-20T09:00:00.000Z",
      },
      {
        id: "ch-2",
        group_id: "group-1",
        status: "closed",
        created_at: "2026-05-21T09:00:00.000Z",
      },
    ];

    expect(buildOwnerGroupsForChallengeForm(groups, challenges)).toEqual([
      {
        id: "group-1",
        name: "러닝 크루",
        createdAt: "2026-05-20T00:00:00.000Z",
        latestChallengeCreatedAt: "2026-05-21T09:00:00.000Z",
        openChallengeId: null,
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
      {
        id: "ch-oldest",
        group_id: "group-oldest",
        status: "closed",
        created_at: "2026-05-19T09:00:00.000Z",
      },
      {
        id: "ch-recent",
        group_id: "group-recent",
        status: "closed",
        created_at: "2026-05-21T09:00:00.000Z",
      },
    ];

    expect(buildOwnerGroupsForChallengeForm(groups, challenges).map((group) => group.id)).toEqual([
      "group-recent",
      "group-oldest",
      "group-no-challenge",
    ]);
  });

  // PRD AC-1 — 그룹당 open(pending|accepted|active) 챌린지는 1개.
  // open 이 있으면 그 id 가, closed 만 있으면 null 이 매핑되어야 한다.
  it("maps openChallengeId from the most recent open challenge per group", () => {
    const groups = [
      { id: "group-a", name: "A", created_at: "2026-05-18T00:00:00.000Z" },
      { id: "group-b", name: "B", created_at: "2026-05-18T00:00:00.000Z" },
    ];
    const challenges = [
      // group-a: closed 와 active 공존 → active 가 open
      {
        id: "ch-a-closed",
        group_id: "group-a",
        status: "closed",
        created_at: "2026-05-18T09:00:00.000Z",
      },
      {
        id: "ch-a-active",
        group_id: "group-a",
        status: "active",
        created_at: "2026-05-21T09:00:00.000Z",
      },
      // group-b: closed 만 → null
      {
        id: "ch-b-closed",
        group_id: "group-b",
        status: "closed",
        created_at: "2026-05-19T09:00:00.000Z",
      },
    ];

    const byId = Object.fromEntries(
      buildOwnerGroupsForChallengeForm(groups, challenges).map((g) => [g.id, g.openChallengeId]),
    );
    expect(byId).toEqual({ "group-a": "ch-a-active", "group-b": null });
  });

  it("picks the latest open when multiple pending/accepted/active exist", () => {
    const groups = [{ id: "group-a", name: "A", created_at: "2026-05-18T00:00:00.000Z" }];
    const challenges = [
      {
        id: "ch-pending",
        group_id: "group-a",
        status: "pending",
        created_at: "2026-05-20T09:00:00.000Z",
      },
      {
        id: "ch-accepted-newer",
        group_id: "group-a",
        status: "accepted",
        created_at: "2026-05-21T09:00:00.000Z",
      },
    ];

    const [a] = buildOwnerGroupsForChallengeForm(groups, challenges);
    expect(a?.openChallengeId).toBe("ch-accepted-newer");
  });
});
