// src/lib/db/reads/recap.spec.ts
import { describe, it, expect } from "vitest";
import { buildRecapView } from "./recap";

describe("buildRecapView", () => {
  const now = new Date("2026-05-08T00:00:00Z");

  const challenge = {
    id: "c1",
    title: "주 3회 헬스장",
    goal_count: 3,
    duration_days: 7,
    penalty_amount: 3000,
    status: "closed" as const,
    start_at: "2026-05-01T00:00:00Z",
    end_at: "2026-05-08T00:00:00Z",
  };

  const participants = [
    { user_id: "u-minji", display_name: "민지", done_count: 3 },
    { user_id: "u-jj", display_name: "JJ", done_count: 5 },
    { user_id: "u-hee", display_name: "희수", done_count: 1 },
  ];

  it("viewer 가 목표 달성 — per-head penalty 0원 · achieved true", () => {
    const view = buildRecapView({ challenge, participants, viewerId: "u-minji", now });
    expect(view.viewerAchieved).toBe(true);
    expect(view.viewerDoneCount).toBe(3);
    expect(view.viewerPerHeadPenalty).toBe(0);
  });

  it("viewer 가 미달성 — penalty_amount 그대로", () => {
    const view = buildRecapView({ challenge, participants, viewerId: "u-hee", now });
    expect(view.viewerAchieved).toBe(false);
    expect(view.viewerPerHeadPenalty).toBe(3000);
  });

  it("MVP 는 단독 1위 JJ 뿐", () => {
    const view = buildRecapView({ challenge, participants, viewerId: "u-minji", now });
    const mvpIds = view.members.filter((m) => m.isMvp).map((m) => m.id);
    expect(mvpIds).toEqual(["u-jj"]);
    expect(view.anyoneAchieved).toBe(true);
  });

  it("전원 미달성 시 anyoneAchieved=false · MVP 0명", () => {
    const view = buildRecapView({
      challenge,
      participants: participants.map((p) => ({ ...p, done_count: 1 })),
      viewerId: "u-minji",
      now,
    });
    expect(view.anyoneAchieved).toBe(false);
    expect(view.members.every((m) => m.isMvp === false)).toBe(true);
  });

  it("active 인데 end_at 이 지났으면 status='active' 그대로 반환 (UI 가 노출 여부 결정)", () => {
    const view = buildRecapView({
      challenge: { ...challenge, status: "active" },
      participants,
      viewerId: "u-minji",
      now,
    });
    expect(view.status).toBe("active");
  });
});
