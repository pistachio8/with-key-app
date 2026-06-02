// src/lib/db/reads/recap.spec.ts
import { describe, it, expect } from "vitest";
import { buildRecapView } from "./recap";

describe("buildRecapView (주 단위)", () => {
  const now = new Date("2026-05-08T00:00:00Z");

  // 7일·주3회 closed(자연 종료). closed_at >= end_at → cutoff=duration(7) → week1 전체 정산.
  const challenge = {
    id: "c1",
    title: "주 3회 헬스장",
    goal_count: 3,
    duration_days: 7,
    penalty_amount: 3000,
    status: "closed" as const,
    start_at: "2026-05-01T00:00:00Z",
    end_at: "2026-05-08T00:00:00Z",
    closed_at: "2026-05-08T00:00:00Z",
  };

  // 1주 챌린지라 모든 done 이 week1. dbw 로 week1 카운트만 지정.
  const dbw = (n: number) => new Map<number, number>(n > 0 ? [[1, n]] : []);
  const participants = [
    { user_id: "u-minji", display_name: "민지", doneByWeek: dbw(3) },
    { user_id: "u-jj", display_name: "JJ", doneByWeek: dbw(5) },
    { user_id: "u-hee", display_name: "희수", doneByWeek: dbw(1) },
  ];

  it("viewer 달성 — per-head 0원 · achieved true · 주차 요약 1주 중 1주", () => {
    const view = buildRecapView({ challenge, participants, viewerId: "u-minji", now });
    expect(view.viewerAchieved).toBe(true);
    expect(view.viewerDoneCount).toBe(3);
    expect(view.viewerPerHeadPenalty).toBe(0);
    expect(view.viewerElapsedWeeks).toBe(1);
    expect(view.viewerAchievedWeeks).toBe(1);
  });

  it("viewer 미달 — penalty_amount 그대로", () => {
    const view = buildRecapView({ challenge, participants, viewerId: "u-hee", now });
    expect(view.viewerAchieved).toBe(false);
    expect(view.viewerPerHeadPenalty).toBe(3000);
  });

  it("MVP 는 단독 1위 JJ (끝난 주 달성자 중 총 인증일 최다)", () => {
    const view = buildRecapView({ challenge, participants, viewerId: "u-minji", now });
    const mvpIds = view.members.filter((m) => m.isMvp).map((m) => m.id);
    expect(mvpIds).toEqual(["u-jj"]);
    expect(view.anyoneAchieved).toBe(true);
  });

  it("전원 미달 → anyoneAchieved=false · MVP 0명", () => {
    const view = buildRecapView({
      challenge,
      participants: participants.map((p) => ({ ...p, doneByWeek: dbw(1) })),
      viewerId: "u-minji",
      now,
    });
    expect(view.anyoneAchieved).toBe(false);
    expect(view.members.every((m) => m.isMvp === false)).toBe(true);
  });

  it("over(active+만기): status='active' 그대로 반환, cutoff=duration", () => {
    const view = buildRecapView({
      challenge: { ...challenge, status: "active", closed_at: null },
      participants,
      viewerId: "u-minji",
      now,
    });
    expect(view.status).toBe("active");
    expect(view.viewerPerHeadPenalty).toBe(0); // 민지 week1 달성
  });

  it("조기 종료: 28일·주3회를 day10 종료 → 1주차만 정산", () => {
    const early = {
      ...challenge,
      duration_days: 28,
      end_at: "2026-05-29T00:00:00Z",
      closed_at: "2026-05-10T01:00:00Z",
    };
    // 민지: week1 미달(1회). week2~4 는 미발생/중도 → 미부과. → penalty 1회분만.
    const view = buildRecapView({
      challenge: early,
      participants: [{ user_id: "u-minji", display_name: "민지", doneByWeek: new Map([[1, 1]]) }],
      viewerId: "u-minji",
      now,
    });
    expect(view.viewerPerHeadPenalty).toBe(3000);
    expect(view.viewerAchieved).toBe(false);
    expect(view.viewerElapsedWeeks).toBe(1); // day10 cutoff → week1 만 끝남
    expect(view.viewerAchievedWeeks).toBe(0); // week1 미달
  });
});
