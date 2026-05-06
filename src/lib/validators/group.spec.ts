import { describe, it, expect } from "vitest";
import { groupInputSchema } from "./group";
import { inviteTokenSchema } from "./invite";

const VALID = {
  bankCode: "088", // 신한
  accountHolder: "홍길동",
  accountNumber: "11012345678",
} as const;

describe("groupInputSchema", () => {
  it("allows empty object (all fields optional)", () => {
    expect(groupInputSchema.safeParse({}).success).toBe(true);
  });

  it("accepts name + full account triple", () => {
    const result = groupInputSchema.safeParse({ name: "민지네", ...VALID });
    expect(result.success).toBe(true);
  });

  it("accepts name alone (no account)", () => {
    expect(groupInputSchema.safeParse({ name: "민지네" }).success).toBe(true);
  });

  it("rejects partial triple — only 1 of 3", () => {
    expect(
      groupInputSchema.safeParse({ name: "민지네", accountNumber: VALID.accountNumber }).success,
    ).toBe(false);
    expect(groupInputSchema.safeParse({ name: "민지네", bankCode: VALID.bankCode }).success).toBe(
      false,
    );
  });

  it("rejects partial triple — 2 of 3", () => {
    expect(
      groupInputSchema.safeParse({
        name: "민지네",
        bankCode: VALID.bankCode,
        accountHolder: VALID.accountHolder,
      }).success,
    ).toBe(false);
  });

  it("rejects account number with non-digit characters", () => {
    for (const bad of ["1101-234-5678", "abc12345", "", " 11012345678"]) {
      const result = groupInputSchema.safeParse({ ...VALID, accountNumber: bad });
      expect(result.success, `expected reject for ${JSON.stringify(bad)}`).toBe(false);
    }
  });

  it("rejects account number shorter than 8 digits", () => {
    expect(groupInputSchema.safeParse({ ...VALID, accountNumber: "1234567" }).success).toBe(false);
  });

  it("rejects account number longer than 16 digits", () => {
    expect(groupInputSchema.safeParse({ ...VALID, accountNumber: "1".repeat(17) }).success).toBe(
      false,
    );
  });

  it("rejects unknown bank code", () => {
    expect(groupInputSchema.safeParse({ ...VALID, bankCode: "999" }).success).toBe(false);
  });

  it("rejects name over 30 chars", () => {
    expect(groupInputSchema.safeParse({ name: "x".repeat(31) }).success).toBe(false);
  });

  it("reject error output does not echo raw accountNumber (no plaintext leak)", () => {
    const secret = "11012345678";
    // Trigger a partial-triple reject so the schema produces an issue on accountNumber path.
    const result = groupInputSchema.safeParse({
      name: "민지네",
      accountNumber: secret,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const serialized = JSON.stringify(result.error.flatten());
      expect(serialized, "plaintext account number must not appear in zod issues").not.toContain(
        secret,
      );
    }
  });
});

describe("inviteTokenSchema", () => {
  it("accepts non-empty string", () => {
    expect(inviteTokenSchema.safeParse("abc").success).toBe(true);
  });

  it("rejects empty string", () => {
    expect(inviteTokenSchema.safeParse("").success).toBe(false);
  });
});
