import { describe, expect, it } from "vitest";
import { pointBalanceFor, type PointLedgerEntry } from "./point-ledger";

function entry(userId: string, groupId: string, delta: number): PointLedgerEntry {
  return { userId, groupId, delta };
}

describe("pointBalanceFor", () => {
  it("returns the signed delta sum for a user/group ledger history", () => {
    const history = [
      entry("u1", "g1", 5000),
      entry("u1", "g1", -3000),
      entry("u1", "g1", 1000),
      entry("u1", "g2", 9999),
      entry("u2", "g1", 9999),
    ];

    expect(pointBalanceFor(history, { userId: "u1", groupId: "g1" })).toBe(3000);
  });

  it("keeps balance drift at zero for deterministic arbitrary histories", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const history: PointLedgerEntry[] = [];
      let expected = 0;

      for (let i = 0; i < seed; i++) {
        const delta = (((seed * 37 + i * 17) % 11) - 5) * 1000;
        history.push(entry("u1", "g1", delta));
        expected += delta;
      }

      expect(pointBalanceFor(history, { userId: "u1", groupId: "g1" })).toBe(expected);
    }
  });
});
