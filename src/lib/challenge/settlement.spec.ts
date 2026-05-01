import { describe, it, expect } from "vitest";
import { computePerHeadPenalty } from "./settlement";

describe("computePerHeadPenalty", () => {
  it("목표 달성자는 0원", () => {
    expect(computePerHeadPenalty({ doneCount: 3, goalCount: 3, penaltyAmount: 3000 })).toBe(0);
    expect(computePerHeadPenalty({ doneCount: 5, goalCount: 3, penaltyAmount: 3000 })).toBe(0);
  });

  it("목표 미달자는 penalty_amount 그대로 (POC 은 표시만 · 과태료 비례 계산 없음)", () => {
    expect(computePerHeadPenalty({ doneCount: 0, goalCount: 3, penaltyAmount: 3000 })).toBe(3000);
    expect(computePerHeadPenalty({ doneCount: 2, goalCount: 3, penaltyAmount: 3000 })).toBe(3000);
  });

  it("penaltyAmount 음수/NaN 방어 — 0 반환", () => {
    expect(computePerHeadPenalty({ doneCount: 0, goalCount: 3, penaltyAmount: -500 })).toBe(0);
    expect(computePerHeadPenalty({ doneCount: 0, goalCount: 3, penaltyAmount: NaN })).toBe(0);
  });
});
