import { describe, it, expect } from "vitest";
import {
  weekIndexOf,
  totalWeeks,
  weekGoal,
  weekEndDayIndex,
  cutoffDayIndex,
  elapsedWeeks,
  weekBucketsFromDayKeys,
  countDoneDaysByUserByWeek,
  confirmedPenalty,
  achievedAllElapsedWeeks,
  doneInElapsedWeeks,
  countAchievedWeeks,
  computeAccruedPot,
  pickMvpIds,
  currentWeekStatus,
  buildWeekChips,
  unreachableParticipants,
  type CutoffContext,
} from "./weekly";

describe("weekIndexOf / totalWeeks / weekEndDayIndex", () => {
  it("dayIndex 1..7 → week 1, 8..14 → week 2", () => {
    expect(weekIndexOf(1)).toBe(1);
    expect(weekIndexOf(7)).toBe(1);
    expect(weekIndexOf(8)).toBe(2);
    expect(weekIndexOf(14)).toBe(2);
    expect(weekIndexOf(15)).toBe(3);
  });

  it("totalWeeks = ceil(durationDays / 7)", () => {
    expect(totalWeeks(7)).toBe(1);
    expect(totalWeeks(10)).toBe(2);
    expect(totalWeeks(28)).toBe(4);
    expect(totalWeeks(90)).toBe(13);
  });

  it("weekEndDayIndex 는 자투리 주에서 durationDays 로 클램프", () => {
    expect(weekEndDayIndex(1, 10)).toBe(7);
    expect(weekEndDayIndex(2, 10)).toBe(10); // min(14, 10)
    expect(weekEndDayIndex(4, 28)).toBe(28);
  });
});

describe("weekGoal", () => {
  it("full week 는 goalCount 그대로", () => {
    expect(weekGoal(1, 2, 3, 10)).toBe(3);
    expect(weekGoal(1, 4, 3, 28)).toBe(3); // 28%7===0 → 마지막 주도 full
    expect(weekGoal(4, 4, 3, 28)).toBe(3);
  });

  it("마지막 자투리 주만 일수 비례(올림)", () => {
    // 10일·주3회: 자투리 3일 → ceil(3*3/7)=ceil(1.28)=2
    expect(weekGoal(2, 2, 3, 10)).toBe(2);
    // 8일·주7회: 자투리 1일 → ceil(7*1/7)=1
    expect(weekGoal(2, 2, 7, 8)).toBe(1);
    // 13일·주3회: 자투리 6일 → ceil(3*6/7)=ceil(2.57)=3
    expect(weekGoal(2, 2, 3, 13)).toBe(3);
  });
});

describe("cutoffDayIndex / elapsedWeeks", () => {
  const base = { durationDays: 28, todayDayIndex: 0, closedAt: null, startKey: "2026-05-01" };

  it("running: today-1 (완료된 날만)", () => {
    const ctx: CutoffContext = { ...base, phase: "running", todayDayIndex: 16 };
    expect(cutoffDayIndex(ctx)).toBe(15);
  });

  it("over: durationDays (예정 전 주 실제 진행)", () => {
    const ctx: CutoffContext = { ...base, phase: "over" };
    expect(cutoffDayIndex(ctx)).toBe(28);
  });

  it("closed 자연 종료(closed_at >= end_at): durationDays 로 수렴", () => {
    // 28일 챌린지, start 2026-05-01 → day28 = 2026-05-28. closed_at 2026-05-29 → dayIndex 29 → min(28,29)=28
    const ctx: CutoffContext = { ...base, phase: "closed", closedAt: "2026-05-29T01:00:00Z" };
    expect(cutoffDayIndex(ctx)).toBe(28);
  });

  it("closed 조기 종료(closed_at < end_at): 종료일까지만", () => {
    // start 2026-05-01 → day10 = 2026-05-10. closed_at 2026-05-10 → dayIndex 10 → min(28,10)=10
    const ctx: CutoffContext = { ...base, phase: "closed", closedAt: "2026-05-10T01:00:00Z" };
    expect(cutoffDayIndex(ctx)).toBe(10);
  });

  it("closed_at NULL 폴백: durationDays", () => {
    const ctx: CutoffContext = { ...base, phase: "closed", closedAt: null };
    expect(cutoffDayIndex(ctx)).toBe(28);
  });

  it("elapsedWeeks: 조기 종료 day10 → 1주차만(week2 end=14 > 10)", () => {
    const ctx: CutoffContext = { ...base, phase: "closed", closedAt: "2026-05-10T01:00:00Z" };
    expect(elapsedWeeks(ctx)).toEqual([1]);
  });

  it("elapsedWeeks: over 10일 챌린지 → 자투리 주 포함 전 주", () => {
    const ctx: CutoffContext = {
      phase: "over",
      durationDays: 10,
      todayDayIndex: 0,
      closedAt: null,
      startKey: "2026-05-01",
    };
    expect(elapsedWeeks(ctx)).toEqual([1, 2]);
  });
});

describe("weekBucketsFromDayKeys / countDoneDaysByUserByWeek", () => {
  const startKey = "2026-05-01";

  it("dayKey 를 주차 버킷으로 분배 (하루 1회)", () => {
    // 2026-05-01(day1·week1), 2026-05-02(day2·week1), 2026-05-09(day9·week2)
    const buckets = weekBucketsFromDayKeys(
      ["2026-05-01", "2026-05-02", "2026-05-09"],
      startKey,
      28,
    );
    expect(buckets.get(1)).toBe(2);
    expect(buckets.get(2)).toBe(1);
  });

  it("stray 로그 가드: dayIndex 가 [1, durationDays] 밖이면 버킷 제외", () => {
    // 2026-04-30(day0·시작 전), 2026-05-29(day29·종료 후, duration 28)
    const buckets = weekBucketsFromDayKeys(["2026-04-30", "2026-05-29"], startKey, 28);
    expect(buckets.size).toBe(0);
  });

  it("countDoneDaysByUserByWeek: 같은 날 N개 로그 → 1 (distinct day) 후 주차 분배", () => {
    const logs = [
      { user_id: "u-a", created_at: "2026-05-01T00:00:00Z" }, // KST day1
      { user_id: "u-a", created_at: "2026-05-01T10:00:00Z" }, // 같은 날
      { user_id: "u-a", created_at: "2026-05-08T00:00:00Z" }, // KST day8 week2
      { user_id: "u-b", created_at: "2026-05-02T00:00:00Z" },
    ];
    const out = countDoneDaysByUserByWeek(logs, startKey, 28);
    expect(out.get("u-a")?.get(1)).toBe(1);
    expect(out.get("u-a")?.get(2)).toBe(1);
    expect(out.get("u-b")?.get(1)).toBe(1);
  });
});

type DoneByWeek = Map<number, number>;
const dbw = (entries: Array<[number, number]>): DoneByWeek => new Map(entries);

describe("confirmedPenalty / achievedAllElapsedWeeks / doneInElapsedWeeks", () => {
  const params = { goalCount: 3, penaltyAmount: 3000 };

  it("28일·주3회: 주1 달성·주2·주3 미달·주4 진행 중 → 확정 = 2×penalty", () => {
    // running, today day25(week4). cutoff=24 → elapsed weeks 1,2,3 (week4 end=28 > 24 제외)
    const ctx: CutoffContext = {
      phase: "running",
      durationDays: 28,
      todayDayIndex: 25,
      closedAt: null,
      startKey: "2026-05-01",
    };
    const done = dbw([
      [1, 3], // 달성
      [2, 1], // 미달
      [3, 0], // 미달
      [4, 2], // 진행 중 (합계 제외)
    ]);
    expect(confirmedPenalty(done, ctx, params)).toBe(6000);
  });

  it("전원 달성 시 0원 (현황판 placeholder 버그 회귀 방지)", () => {
    const ctx: CutoffContext = {
      phase: "over",
      durationDays: 7,
      todayDayIndex: 0,
      closedAt: null,
      startKey: "2026-05-01",
    };
    expect(confirmedPenalty(dbw([[1, 3]]), ctx, params)).toBe(0);
    expect(achievedAllElapsedWeeks(dbw([[1, 3]]), ctx, { goalCount: 3 })).toBe(true);
  });

  it("penaltyAmount 음수/NaN 방어 → 0", () => {
    const ctx: CutoffContext = {
      phase: "over",
      durationDays: 7,
      todayDayIndex: 0,
      closedAt: null,
      startKey: "2026-05-01",
    };
    expect(confirmedPenalty(dbw([[1, 0]]), ctx, { goalCount: 3, penaltyAmount: -1 })).toBe(0);
    expect(confirmedPenalty(dbw([[1, 0]]), ctx, { goalCount: 3, penaltyAmount: NaN })).toBe(0);
  });

  it("1주 챌린지(7일·주3회) 회귀 동등성: 3회→0 / 1회→penalty", () => {
    const ctx: CutoffContext = {
      phase: "over",
      durationDays: 7,
      todayDayIndex: 0,
      closedAt: null,
      startKey: "2026-05-01",
    };
    expect(confirmedPenalty(dbw([[1, 3]]), ctx, params)).toBe(0);
    expect(confirmedPenalty(dbw([[1, 1]]), ctx, params)).toBe(3000);
  });

  it("10일·주3회 자투리: week2 goal=2, 미달 시 penalty", () => {
    const ctx: CutoffContext = {
      phase: "over",
      durationDays: 10,
      todayDayIndex: 0,
      closedAt: null,
      startKey: "2026-05-01",
    };
    expect(
      confirmedPenalty(
        dbw([
          [1, 3],
          [2, 2],
        ]),
        ctx,
        params,
      ),
    ).toBe(0); // 둘 다 달성
    expect(
      confirmedPenalty(
        dbw([
          [1, 3],
          [2, 1],
        ]),
        ctx,
        params,
      ),
    ).toBe(3000); // 자투리 미달
  });

  it("조기 closed day10: 28일·주3회 → 1주차만 정산, 미발생 주 charge=0", () => {
    const ctx: CutoffContext = {
      phase: "closed",
      durationDays: 28,
      todayDayIndex: 0,
      closedAt: "2026-05-10T01:00:00Z",
      startKey: "2026-05-01",
    };
    // week1 미달 → 3000. week2(end14 > cutoff10 중도 잘림)·week3·week4 미발생 → 미부과
    expect(confirmedPenalty(dbw([[1, 0]]), ctx, params)).toBe(3000);
  });

  it("doneInElapsedWeeks: 끝난 주 done 합 (현재/미발생 주 제외)", () => {
    const ctx: CutoffContext = {
      phase: "running",
      durationDays: 28,
      todayDayIndex: 25,
      closedAt: null,
      startKey: "2026-05-01",
    };
    expect(
      doneInElapsedWeeks(
        dbw([
          [1, 3],
          [2, 1],
          [3, 2],
          [4, 5],
        ]),
        ctx,
      ),
    ).toBe(6); // week4 제외
  });

  it("countAchievedWeeks: 끝난 주 중 달성 주 수 (영수증 'N주 중 M주')", () => {
    const ctx: CutoffContext = {
      phase: "running",
      durationDays: 28,
      todayDayIndex: 25,
      closedAt: null,
      startKey: "2026-05-01",
    };
    // elapsed weeks 1,2,3. week1 달성·week2 미달·week3 달성 → 2
    expect(
      countAchievedWeeks(
        dbw([
          [1, 3],
          [2, 1],
          [3, 3],
          [4, 0],
        ]),
        ctx,
        { goalCount: 3 },
      ),
    ).toBe(2);
  });
});

describe("computeAccruedPot / pickMvpIds", () => {
  const params = { goalCount: 3, penaltyAmount: 3000 };
  const ctx: CutoffContext = {
    phase: "over",
    durationDays: 14,
    todayDayIndex: 0,
    closedAt: null,
    startKey: "2026-05-01",
  };

  it("computeAccruedPot: 미달자만 합산", () => {
    const members = [
      {
        doneByWeek: dbw([
          [1, 3],
          [2, 3],
        ]),
      }, // 달성 0원
      {
        doneByWeek: dbw([
          [1, 1],
          [2, 3],
        ]),
      }, // week1 미달 3000
      {
        doneByWeek: dbw([
          [1, 0],
          [2, 0],
        ]),
      }, // 둘 다 미달 6000
    ];
    expect(computeAccruedPot(members, ctx, params)).toBe(9000);
  });

  it("pickMvpIds: 끝난 모든 주 달성자 중 총 인증일 최다 (동률 공동)", () => {
    const members = [
      {
        id: "a",
        doneByWeek: dbw([
          [1, 3],
          [2, 3],
        ]),
      }, // 달성, 총 6
      {
        id: "b",
        doneByWeek: dbw([
          [1, 3],
          [2, 4],
        ]),
      }, // 달성, 총 7
      {
        id: "c",
        doneByWeek: dbw([
          [1, 1],
          [2, 7],
        ]),
      }, // week1 미달 → 후보 제외
    ];
    expect(pickMvpIds(members, ctx, { goalCount: 3 })).toEqual(["b"]);
  });

  it("pickMvpIds: 달성자 없으면 빈 배열", () => {
    const members = [
      {
        id: "a",
        doneByWeek: dbw([
          [1, 1],
          [2, 1],
        ]),
      },
    ];
    expect(pickMvpIds(members, ctx, { goalCount: 3 })).toEqual([]);
  });

  it("불변식 (ii): 단일 멤버 computeAccruedPot == 그 멤버 confirmedPenalty (이중 SoT 방지)", () => {
    // 현황판 potTotal(내 몫)·홈 myConfirmedPenalty·recap viewerPerHeadPenalty 가 같은 cutoff·함수를
    // 쓰면 동일해야 한다. 같은 ctx·doneByWeek 로 두 경로가 일치함을 함수 레벨에서 못박는다.
    const doneByWeek = dbw([
      [1, 1],
      [2, 3],
    ]); // week1 미달 → 3000
    expect(computeAccruedPot([{ doneByWeek }], ctx, params)).toBe(
      confirmedPenalty(doneByWeek, ctx, params),
    );
  });
});

describe("currentWeekStatus", () => {
  const params = { goalCount: 3, penaltyAmount: 3000 };

  it("over/closed 면 null (링·위험 미표시)", () => {
    const overCtx: CutoffContext = {
      phase: "over",
      durationDays: 28,
      todayDayIndex: 0,
      closedAt: null,
      startKey: "2026-05-01",
    };
    expect(currentWeekStatus(new Map(), overCtx, params)).toBeNull();
  });

  it("running: 이번 주 week·goal·done·shortfall 산출", () => {
    // today day10 → week2. done 1 → shortfall 2. weekEnd(week2,28)=14, daysLeft=14-10+1=5
    const ctx: CutoffContext = {
      phase: "running",
      durationDays: 28,
      todayDayIndex: 10,
      closedAt: null,
      startKey: "2026-05-01",
    };
    const s = currentWeekStatus(dbw([[2, 1]]), ctx, params);
    expect(s).not.toBeNull();
    expect(s?.week).toBe(2);
    expect(s?.goal).toBe(3);
    expect(s?.done).toBe(1);
    expect(s?.daysLeftInWeek).toBe(5);
    expect(s?.shortfall).toBe(2);
    expect(s?.atRiskAmount).toBe(3000);
    expect(s?.imminent).toBe(false); // daysLeft 5 > shortfall 2
  });

  it("마감 임박(무여유): done 1·shortfall 2, 남은 2일 → imminent=true", () => {
    // duration 7, today day6 → week1. weekEnd=7 daysLeft=7-6+1=2. shortfall 2 → daysLeft<=shortfall
    const ctx: CutoffContext = {
      phase: "running",
      durationDays: 7,
      todayDayIndex: 6,
      closedAt: null,
      startKey: "2026-05-01",
    };
    const s = currentWeekStatus(dbw([[1, 1]]), ctx, params); // done 1, shortfall 2, daysLeft 2
    expect(s?.imminent).toBe(true); // daysLeft 2 <= shortfall 2
    expect(s?.atRiskAmount).toBe(3000);
  });

  it("마감 임박 spec 정확 케이스: 주3회·0회, 남은 2일 → imminent=true", () => {
    // duration 7, today day6 → week1. done 0, shortfall 3, weekEnd 7, daysLeft 2 → 2 <= 3
    const ctx: CutoffContext = {
      phase: "running",
      durationDays: 7,
      todayDayIndex: 6,
      closedAt: null,
      startKey: "2026-05-01",
    };
    const s = currentWeekStatus(new Map(), ctx, params); // done 0
    expect(s?.shortfall).toBe(3);
    expect(s?.imminent).toBe(true);
    expect(s?.atRiskAmount).toBe(3000);
  });

  it("0원 챌린지: atRiskAmount=0, imminent=false", () => {
    const ctx: CutoffContext = {
      phase: "running",
      durationDays: 7,
      todayDayIndex: 6,
      closedAt: null,
      startKey: "2026-05-01",
    };
    const s = currentWeekStatus(dbw([[1, 0]]), ctx, { goalCount: 3, penaltyAmount: 0 });
    expect(s?.atRiskAmount).toBe(0);
    expect(s?.imminent).toBe(false);
  });

  it("회복 불가(unreachable): 7일·주7회, done 1, 남은 2일 → shortfall 6 > daysLeft 2 → true", () => {
    // b088ae54 실측 케이스: goal 7(매일)·1일만 인증·day6.
    const ctx: CutoffContext = {
      phase: "running",
      durationDays: 7,
      todayDayIndex: 6,
      closedAt: null,
      startKey: "2026-05-01",
    };
    const s = currentWeekStatus(dbw([[1, 1]]), ctx, { goalCount: 7, penaltyAmount: 3000 });
    expect(s?.shortfall).toBe(6);
    expect(s?.daysLeftInWeek).toBe(2);
    expect(s?.unreachable).toBe(true);
    expect(s?.imminent).toBe(true); // unreachable ⊂ imminent
    expect(s?.atRiskAmount).toBe(3000);
  });

  it("경계: shortfall == daysLeft → 아직 회복 가능 (unreachable=false, imminent=true)", () => {
    // today day6 → daysLeft 2. done 1·goal 3 → shortfall 2 == daysLeft 2.
    const ctx: CutoffContext = {
      phase: "running",
      durationDays: 7,
      todayDayIndex: 6,
      closedAt: null,
      startKey: "2026-05-01",
    };
    const s = currentWeekStatus(dbw([[1, 1]]), ctx, params);
    expect(s?.shortfall).toBe(2);
    expect(s?.daysLeftInWeek).toBe(2);
    expect(s?.unreachable).toBe(false);
    expect(s?.imminent).toBe(true);
  });

  it("unreachable 는 penalty 무관: 0원 챌린지도 달성 불가면 true (atRiskAmount=0)", () => {
    const ctx: CutoffContext = {
      phase: "running",
      durationDays: 7,
      todayDayIndex: 6,
      closedAt: null,
      startKey: "2026-05-01",
    };
    const s = currentWeekStatus(new Map(), ctx, { goalCount: 7, penaltyAmount: 0 });
    expect(s?.unreachable).toBe(true); // done 0, shortfall 7 > daysLeft 2
    expect(s?.atRiskAmount).toBe(0);
    expect(s?.imminent).toBe(false); // penalty 0 → imminent false
  });
});

describe("buildWeekChips", () => {
  const params = { goalCount: 3, penaltyAmount: 3000 };

  it("running 28일·주3회 today day10(week2): 달성/미달/현재/미래 상태", () => {
    const ctx: CutoffContext = {
      phase: "running",
      durationDays: 28,
      todayDayIndex: 10,
      closedAt: null,
      startKey: "2026-05-01",
    };
    const chips = buildWeekChips(
      dbw([
        [1, 3],
        [2, 1],
      ]),
      ctx,
      params,
    );
    expect(chips).toEqual([
      { week: 1, goal: 3, done: 3, state: "achieved" },
      { week: 2, goal: 3, done: 1, state: "current" },
      { week: 3, goal: 3, done: 0, state: "future" },
      { week: 4, goal: 3, done: 0, state: "future" },
    ]);
  });

  it("over 10일·주3회: 자투리 주 goal=2, 끝난 주는 달성/미달", () => {
    const ctx: CutoffContext = {
      phase: "over",
      durationDays: 10,
      todayDayIndex: 0,
      closedAt: null,
      startKey: "2026-05-01",
    };
    const chips = buildWeekChips(
      dbw([
        [1, 3],
        [2, 1],
      ]),
      ctx,
      params,
    );
    expect(chips).toEqual([
      { week: 1, goal: 3, done: 3, state: "achieved" },
      { week: 2, goal: 2, done: 1, state: "missed" },
    ]);
  });

  it("running 현재 주가 회복 불가면 'missed'(current 아님)", () => {
    // 7일·주3회, today day6 → daysLeft 2. done 0·goal 3 → shortfall 3 > 2 → 회복 불가.
    const ctx: CutoffContext = {
      phase: "running",
      durationDays: 7,
      todayDayIndex: 6,
      closedAt: null,
      startKey: "2026-05-01",
    };
    expect(buildWeekChips(new Map(), ctx, params)).toEqual([
      { week: 1, goal: 3, done: 0, state: "missed" },
    ]);
  });

  it("running 현재 주가 아직 회복 가능하면 'current' 유지", () => {
    // 7일·주3회, today day3 → daysLeft weekEnd(1,7)-3+1 = 5. shortfall 3 <= 5 → current.
    const ctx: CutoffContext = {
      phase: "running",
      durationDays: 7,
      todayDayIndex: 3,
      closedAt: null,
      startKey: "2026-05-01",
    };
    expect(buildWeekChips(new Map(), ctx, params)).toEqual([
      { week: 1, goal: 3, done: 0, state: "current" },
    ]);
  });
});

describe("unreachableParticipants", () => {
  const params = { goalCount: 7, penaltyAmount: 3000 };
  const runningCtx: CutoffContext = {
    phase: "running",
    durationDays: 7,
    todayDayIndex: 6,
    closedAt: null,
    startKey: "2026-05-30",
  };

  it("회복 불가 참가자만 (week·atRiskAmount 동반) 반환", () => {
    // u1: 5/30 1회만(done 1, shortfall 6 > daysLeft 2) → 회복 불가.
    // u2: 5/30~6/4 6일(done 6, shortfall 1 <= 2) → 아직 가능.
    const u2Days = [
      "2026-05-30",
      "2026-05-31",
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
    ];
    const logs = [
      { user_id: "u1", created_at: "2026-05-30T01:00:00Z" },
      ...u2Days.map((d) => ({ user_id: "u2", created_at: `${d}T01:00:00Z` })),
    ];
    const out = unreachableParticipants(logs, ["u1", "u2"], runningCtx, params);
    expect(out).toEqual([{ userId: "u1", week: 1, atRiskAmount: 3000 }]);
  });

  it("로그 0건 참가자(done 0)도 회복 불가로 잡는다", () => {
    const out = unreachableParticipants([], ["solo"], runningCtx, params);
    expect(out).toEqual([{ userId: "solo", week: 1, atRiskAmount: 3000 }]);
  });

  it("running 이 아니면 빈 배열 (over/closed 는 정산이 담당)", () => {
    const overCtx: CutoffContext = { ...runningCtx, phase: "over" };
    expect(unreachableParticipants([], ["solo"], overCtx, params)).toEqual([]);
  });
});
