import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildKakaoPayLink } from "./link";

const ORIGINAL = process.env.NEXT_PUBLIC_KAKAOPAY_SEND_URL;

describe("buildKakaoPayLink", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_KAKAOPAY_SEND_URL = "https://qr.kakaopay.com/abc123";
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_KAKAOPAY_SEND_URL;
    else process.env.NEXT_PUBLIC_KAKAOPAY_SEND_URL = ORIGINAL;
  });

  it("appends amount + memo as query params", () => {
    const url = buildKakaoPayLink({ amount: 3000, memo: "주 3회 헬스장 벌금" });
    expect(url).toContain("https://qr.kakaopay.com/abc123");
    expect(url).toContain("amount=3000");
    // URLSearchParams uses x-www-form-urlencoded (spaces → '+').
    const parsed = new URL(url);
    expect(parsed.searchParams.get("memo")).toBe("주 3회 헬스장 벌금");
  });

  it("omits memo when blank", () => {
    const url = buildKakaoPayLink({ amount: 3000 });
    expect(url).toContain("amount=3000");
    expect(url).not.toContain("memo=");
  });

  it("falls back to pay.kakao.com when env missing", () => {
    delete process.env.NEXT_PUBLIC_KAKAOPAY_SEND_URL;
    const url = buildKakaoPayLink({ amount: 1000 });
    expect(url.startsWith("https://pay.kakao.com/")).toBe(true);
  });

  it("rejects non-positive amount", () => {
    expect(() => buildKakaoPayLink({ amount: 0 })).toThrow();
    expect(() => buildKakaoPayLink({ amount: -100 })).toThrow();
  });

  it("rejects disallowed host (open-redirect defense)", () => {
    process.env.NEXT_PUBLIC_KAKAOPAY_SEND_URL = "https://evil.example.com/path";
    expect(() => buildKakaoPayLink({ amount: 1000 })).toThrow(/disallowed kakaopay host/);
  });

  it("accepts whitelisted hosts", () => {
    for (const host of ["qr.kakaopay.com", "pay.kakao.com", "link.kakao.com"]) {
      process.env.NEXT_PUBLIC_KAKAOPAY_SEND_URL = `https://${host}/xyz`;
      expect(() => buildKakaoPayLink({ amount: 1000 })).not.toThrow();
    }
  });
});
