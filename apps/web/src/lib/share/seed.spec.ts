import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { makeShareSeed } = await import("./seed");

describe("makeShareSeed", () => {
  it("[0, 2^31) 범위의 정수를 반환", () => {
    for (let i = 0; i < 50; i += 1) {
      const s = makeShareSeed();
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(2_147_483_647);
    }
  });
});
