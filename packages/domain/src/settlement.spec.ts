import { describe, expect, it } from "vitest";
import {
  computeSettlement,
  settleOnce,
  type SettlementInput,
  type SettlementLedgerEntry,
} from "./settlement";
import { pointBalanceFor, type PointLedgerEntry } from "./point-ledger";

const GROUP = "g1";

// 한 참가자의 전체 생애 원장(grant → hold → settle)을 만들어 잔액=Σdelta 검증에 쓴다.
function lifecycleLedger(
  userId: string,
  grant: number,
  held: number,
  settleEntries: ReadonlyArray<SettlementLedgerEntry>,
): PointLedgerEntry[] {
  const ledger: PointLedgerEntry[] = [
    { userId, groupId: GROUP, delta: grant }, // bundle_grant
    { userId, groupId: GROUP, delta: -held }, // deposit_hold
  ];
  for (const e of settleEntries) {
    if (e.userId === userId) ledger.push({ userId, groupId: GROUP, delta: e.delta });
  }
  return ledger;
}

describe("computeSettlement — 정산 분배 결정론 (EVAL-0006)", () => {
  it("TS-settle-1: 달성자 환급 + 미달분 공동주머니, 개인 재분배 0행", () => {
    const result = computeSettlement([
      { userId: "a", heldDeposit: 1000, confirmedPenalty: 0 },
      { userId: "b", heldDeposit: 1000, confirmedPenalty: 0 },
      { userId: "c", heldDeposit: 1000, confirmedPenalty: 1000 },
    ]);

    // 달성 2명: release(+1000) 한 줄, penalty 없음
    expect(result.entries.filter((e) => e.userId === "a")).toEqual([
      { userId: "a", delta: 1000, reason: "deposit_release" },
    ]);
    expect(result.entries.filter((e) => e.userId === "b")).toEqual([
      { userId: "b", delta: 1000, reason: "deposit_release" },
    ]);

    // 미달 1명: release(+1000) 후 penalty(-1000)
    expect(result.entries.filter((e) => e.userId === "c")).toEqual([
      { userId: "c", delta: 1000, reason: "deposit_release" },
      { userId: "c", delta: -1000, reason: "penalty" },
    ]);

    // 미달분 합 = 공동 주머니
    expect(result.poolPoints).toBe(1000);

    // 개인↔개인 재분배 행 없음(AC-settle-6): 원장에는 deposit_release/penalty 만,
    // pool 은 settlements.pool_points 에만 적재되고 어떤 user 로도 흘러가지 않는다.
    expect(
      result.entries.every((e) => e.reason === "deposit_release" || e.reason === "penalty"),
    ).toBe(true);
  });

  it("(b) 정합: 각 참가자 held = net + forfeit, pool = Σforfeit (release+penalty 보존)", () => {
    const parts: SettlementInput[] = [
      { userId: "a", heldDeposit: 3000, confirmedPenalty: 0 },
      { userId: "b", heldDeposit: 3000, confirmedPenalty: 1000 },
      { userId: "c", heldDeposit: 3000, confirmedPenalty: 3000 },
    ];
    const r = computeSettlement(parts);

    let poolCheck = 0;
    for (const p of parts) {
      const share = r.distribution[p.userId];
      expect(share.released).toBe(p.heldDeposit); // 전액 환급
      expect(share.released).toBe(share.net + share.forfeit); // held = net + forfeit
      poolCheck += share.forfeit;
    }
    expect(r.poolPoints).toBe(poolCheck);
  });

  it("잔액=Σdelta: grant→hold→settle 생애 후 잔액 = grant - forfeit (drift 0, AC-deposit-hold-5)", () => {
    const grant = 5000;
    const held = 1000;
    const r = computeSettlement([
      { userId: "a", heldDeposit: held, confirmedPenalty: 0 }, // 달성 → forfeit 0
      { userId: "c", heldDeposit: held, confirmedPenalty: 1000 }, // 미달 → forfeit 1000
    ]);

    const balA = pointBalanceFor(lifecycleLedger("a", grant, held, r.entries), {
      userId: "a",
      groupId: GROUP,
    });
    const balC = pointBalanceFor(lifecycleLedger("c", grant, held, r.entries), {
      userId: "c",
      groupId: GROUP,
    });

    expect(balA).toBe(grant - 0); // 달성자: 보증금 전액 회수
    expect(balC).toBe(grant - 1000); // 미달자: 미달분만 손실
  });

  it("AC-settle-4: 미달분 주 단위 누적(binary 아님) — 2주 미달이면 forfeit = 2×주벌금", () => {
    // confirmedPenalty 는 weekly.ts 가 산정한 "끝난 주 미달 합". 여기선 2주 미달 = 2000.
    const r = computeSettlement([{ userId: "x", heldDeposit: 4000, confirmedPenalty: 2000 }]);
    const share = r.distribution["x"];
    expect(share.forfeit).toBe(2000); // 전액(4000)도 0 도 아닌 주 단위 누적분
    expect(share.net).toBe(2000);
  });

  it("보증금 한도: confirmedPenalty > heldDeposit 이면 forfeit = heldDeposit (초과분 미징수)", () => {
    const r = computeSettlement([{ userId: "y", heldDeposit: 1000, confirmedPenalty: 3000 }]);
    expect(r.distribution["y"].forfeit).toBe(1000);
    expect(r.distribution["y"].net).toBe(0);
    expect(r.poolPoints).toBe(1000);
  });

  it("CHECK(delta<>0) 보존: held 0·forfeit 0 참가자는 원장 행을 만들지 않는다", () => {
    const r = computeSettlement([
      { userId: "z", heldDeposit: 0, confirmedPenalty: 0 },
      { userId: "w", heldDeposit: 1000, confirmedPenalty: 0 },
    ]);
    expect(r.entries.some((e) => e.userId === "z")).toBe(false);
    expect(r.entries.every((e) => e.delta !== 0)).toBe(true);
  });

  it("음수·비정수 입력 방어: 음수 hold→0, 소수는 내림", () => {
    const r = computeSettlement([
      { userId: "neg", heldDeposit: -500, confirmedPenalty: 100 },
      { userId: "frac", heldDeposit: 1000.9, confirmedPenalty: 250.7 },
    ]);
    expect(r.distribution["neg"]).toEqual({ released: 0, forfeit: 0, net: 0 });
    expect(r.distribution["frac"]).toEqual({ released: 1000, forfeit: 250, net: 750 });
  });
});

describe("settleOnce — 이중 정산 멱등 (AC-settle-trigger-3 / TS-settle-trigger-2)", () => {
  const parts: SettlementInput[] = [{ userId: "a", heldDeposit: 1000, confirmedPenalty: 1000 }];

  it("최초 트리거: 정산 행 생성", () => {
    const first = settleOnce(false, parts);
    expect(first.entries.length).toBeGreaterThan(0);
    expect(first.poolPoints).toBe(1000);
  });

  it("재트리거(클릭+cron 동시): 이미 정산됨 → 추가 원장 0행·pool 0(no-op)", () => {
    const again = settleOnce(true, parts);
    expect(again.entries).toHaveLength(0);
    expect(again.poolPoints).toBe(0);
    expect(again.distribution).toEqual({});
  });

  it("결정론: 동일 입력 → 동일 출력(분배 재현성, AC-settle-5)", () => {
    expect(computeSettlement(parts)).toEqual(computeSettlement(parts));
  });
});
