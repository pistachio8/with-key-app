import { describe, it, expect } from "vitest";
import { BANK_CODES, BANK_NAMES } from "./codes";

describe("BANK_CODES / BANK_NAMES", () => {
  it("every code has a Korean display name", () => {
    for (const code of BANK_CODES) {
      const name = BANK_NAMES[code];
      expect(name, `no name for ${code}`).toBeTruthy();
      expect(name!.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate codes", () => {
    expect(new Set(BANK_CODES).size).toBe(BANK_CODES.length);
  });

  it("has no duplicate display names", () => {
    const names = BANK_CODES.map((c) => BANK_NAMES[c]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every code matches the MOF 3-digit format", () => {
    for (const code of BANK_CODES) {
      expect(code, `bad code ${code}`).toMatch(/^[0-9]{3}$/);
    }
  });
});
