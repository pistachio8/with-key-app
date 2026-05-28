import { describe, it, expect } from "vitest";
import { computePerHeadPenalty } from "./settlement";
import { computeAccruedPot } from "./settlement";
import { pickMvpIds } from "./settlement";

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

describe("computeAccruedPot", () => {
  it("미시작(pending/accepted)은 doneCount 무관 0원", () => {
    const members = [{ doneCount: 0 }, { doneCount: 0 }];
    expect(
      computeAccruedPot({ status: "pending", goalCount: 3, penaltyAmount: 3000, members }),
    ).toBe(0);
    expect(
      computeAccruedPot({ status: "accepted", goalCount: 3, penaltyAmount: 3000, members }),
    ).toBe(0);
  });

  it("active — 미달자만 합산, 달성자는 제외", () => {
    expect(
      computeAccruedPot({
        status: "active",
        goalCount: 3,
        penaltyAmount: 3000,
        members: [{ doneCount: 3 }, { doneCount: 1 }, { doneCount: 5 }],
      }),
    ).toBe(3000);
  });

  it("active — 전원 달성 시 0원 (버그 재현: 이전엔 인원수 × 벌금)", () => {
    expect(
      computeAccruedPot({
        status: "active",
        goalCount: 3,
        penaltyAmount: 3000,
        members: [{ doneCount: 3 }, { doneCount: 4 }],
      }),
    ).toBe(0);
  });

  it("closed — 전원 미달 시 인원수 × 벌금과 동일 (최대값)", () => {
    expect(
      computeAccruedPot({
        status: "closed",
        goalCount: 3,
        penaltyAmount: 3000,
        members: [{ doneCount: 0 }, { doneCount: 2 }],
      }),
    ).toBe(6000);
  });

  it("참여자 없으면 0원", () => {
    expect(
      computeAccruedPot({ status: "active", goalCount: 3, penaltyAmount: 3000, members: [] }),
    ).toBe(0);
  });
});

describe("pickMvpIds", () => {
  const baseMember = (overrides: { id: string; doneCount: number }) => ({
    id: overrides.id,
    doneCount: overrides.doneCount,
  });

  it("아무도 목표 미달성 시 빈 배열", () => {
    expect(
      pickMvpIds({
        goalCount: 3,
        members: [baseMember({ id: "a", doneCount: 1 }), baseMember({ id: "b", doneCount: 2 })],
      }),
    ).toEqual([]);
  });

  it("단독 1위", () => {
    expect(
      pickMvpIds({
        goalCount: 3,
        members: [
          baseMember({ id: "a", doneCount: 3 }),
          baseMember({ id: "b", doneCount: 5 }),
          baseMember({ id: "c", doneCount: 4 }),
        ],
      }),
    ).toEqual(["b"]);
  });

  it("동률 1위는 모두 MVP", () => {
    expect(
      pickMvpIds({
        goalCount: 3,
        members: [
          baseMember({ id: "a", doneCount: 3 }),
          baseMember({ id: "b", doneCount: 5 }),
          baseMember({ id: "c", doneCount: 5 }),
        ],
      }),
    ).toEqual(["b", "c"]);
  });

  it("목표 미달자는 doneCount 가 더 커도 MVP 후보에서 제외 (이론적 케이스)", () => {
    // 방어적 — MVP 정의상 goalCount 달성이 선행 조건.
    expect(
      pickMvpIds({
        goalCount: 10,
        members: [baseMember({ id: "a", doneCount: 9 }), baseMember({ id: "b", doneCount: 8 })],
      }),
    ).toEqual([]);
  });
});
