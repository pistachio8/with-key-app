// src/lib/db/reads/recap.spec.ts
import { describe, it, expect } from "vitest";
import { buildRecapView, buildVisibleDoneByUserByWeek } from "./recap";

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
    feed_type: "image" as const,
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

// EVAL-0041 회귀 — 정산 recap 의 인증 집계가 auto_verify_status='peer_rejected'(과반 반려) 를
// 제외하는지. 같은 doneByWeek 집합이 인증 횟수·판정·정산 금액 셋을 모두 만들므로 셋 다 영향.
// 버그 시점엔 필터가 없어 반려된 날도 done 으로 세었다(횟수 부풀림 → 판정 달성 오인 · penalty 과소).
describe("buildVisibleDoneByUserByWeek — peer_rejected 제외 (EVAL-0041)", () => {
  // 7일·주3회 closed 챌린지. start_at=2026-05-01(KST). u1 이 3일 인증하되 05-03 은 peer_rejected.
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
    feed_type: "image" as const,
  };
  const now = new Date("2026-05-08T00:00:00Z");
  // 03:00Z = 12:00 KST → 각각 05-01·02·03 (KST distinct day). 05-03 만 반려.
  const logs = [
    { user_id: "u1", created_at: "2026-05-01T03:00:00Z", auto_verify_status: "passed" },
    { user_id: "u1", created_at: "2026-05-02T03:00:00Z", auto_verify_status: "passed" },
    { user_id: "u1", created_at: "2026-05-03T03:00:00Z", auto_verify_status: "peer_rejected" },
  ];

  it("반려된 날은 주차 집계에서 빠진다 (3건 중 1건 반려 → week1 2일)", () => {
    const byWeek = buildVisibleDoneByUserByWeek(logs, "2026-05-01", 7);
    expect(byWeek.get("u1")?.get(1) ?? 0).toBe(2); // 버그 시점엔 3
  });

  it("recap 파생값 — 인증 횟수·판정·정산 금액 모두 반려 제외 반영", () => {
    const byWeek = buildVisibleDoneByUserByWeek(logs, "2026-05-01", 7);
    const view = buildRecapView({
      challenge,
      participants: [
        {
          user_id: "u1",
          display_name: "u1",
          doneByWeek: byWeek.get("u1") ?? new Map<number, number>(),
        },
      ],
      viewerId: "u1",
      now,
    });
    expect(view.viewerDoneCount).toBe(2); // 버그 시점 3
    expect(view.viewerAchieved).toBe(false); // goal 3 > 2 (버그 시점 true)
    expect(view.viewerPerHeadPenalty).toBe(3000); // 버그 시점 0
  });

  it("startKey 없으면 빈 집계 (start_at 미설정 챌린지)", () => {
    expect(buildVisibleDoneByUserByWeek(logs, null, 7).size).toBe(0);
  });
});
