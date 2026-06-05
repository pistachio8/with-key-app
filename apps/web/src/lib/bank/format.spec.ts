import { describe, it, expect } from "vitest";
import { maskAccountNumber, formatAccountHolder } from "./format";

describe("maskAccountNumber", () => {
  it("formats last4 as ****-**-****XXXX", () => {
    expect(maskAccountNumber("1234")).toBe("****-**-****1234");
    expect(maskAccountNumber("0000")).toBe("****-**-****0000");
  });

  it("rejects non-4-digit last4", () => {
    expect(() => maskAccountNumber("123")).toThrow();
    expect(() => maskAccountNumber("12345")).toThrow();
    expect(() => maskAccountNumber("abcd")).toThrow();
    expect(() => maskAccountNumber("")).toThrow();
  });
});

describe("formatAccountHolder", () => {
  it("trims surrounding whitespace", () => {
    expect(formatAccountHolder("  홍길동  ")).toBe("홍길동");
  });

  it("preserves inner whitespace", () => {
    expect(formatAccountHolder("홍 길동")).toBe("홍 길동");
  });
});
