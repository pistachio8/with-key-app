import { describe, it, expect } from "vitest";
import { makeUserMessage, FALLBACK_ERROR_MESSAGE } from "./error-messages";
import type { ErrorCode } from "./response";

describe("makeUserMessage", () => {
  it("maps default codes to Korean copy", () => {
    const userMessage = makeUserMessage();
    expect(userMessage("unauthorized")).toBe("로그인이 필요해요. 로그인 화면으로 이동할게요.");
    expect(userMessage("invalid_input")).toBe("입력값을 다시 확인해 주세요.");
  });

  it("has Korean copy for every ErrorCode", () => {
    const m = makeUserMessage();
    const codes: ErrorCode[] = [
      "unauthorized",
      "forbidden",
      "invalid_input",
      "not_found",
      "conflict",
      "rate_limited",
      "upstream_error",
    ];
    for (const c of codes) {
      expect(m(c)).toBeTruthy();
    }
  });

  it("rate_limited default copy asks the user to wait", () => {
    const m = makeUserMessage();
    expect(m("rate_limited")).toBe("요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.");
  });

  it("falls back for unknown codes (runtime safety)", () => {
    const userMessage = makeUserMessage();
    // Simulate a malformed wire value arriving from an untrusted source.
    expect(userMessage("internal_error" as unknown as ErrorCode)).toBe(FALLBACK_ERROR_MESSAGE);
    expect(userMessage("anything_else" as unknown as ErrorCode)).toBe(FALLBACK_ERROR_MESSAGE);
  });

  it("applies overrides without mutating defaults", () => {
    const custom = makeUserMessage({ invalid_input: "서약서 정보를 확인해 주세요." });
    expect(custom("invalid_input")).toBe("서약서 정보를 확인해 주세요.");
    const plain = makeUserMessage();
    expect(plain("invalid_input")).toBe("입력값을 다시 확인해 주세요.");
  });

  it("override a single code still falls back for unknown runtime codes", () => {
    const custom = makeUserMessage({ unauthorized: "로그인이 필요해요." });
    expect(custom("unauthorized")).toBe("로그인이 필요해요.");
    expect(custom("internal_error" as unknown as ErrorCode)).toBe(FALLBACK_ERROR_MESSAGE);
  });
});
