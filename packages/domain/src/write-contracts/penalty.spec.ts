import { describe, it, expect } from "vitest";
import { penaltyProofSubmitResponseSchema } from "./penalty";

describe("penaltyProofSubmitResponseSchema", () => {
  it("성공 봉투를 parse", () => {
    const parsed = penaltyProofSubmitResponseSchema.parse({
      ok: true,
      data: { proofId: "11111111-1111-1111-1111-111111111111", status: "pending" },
    });
    expect(parsed.ok).toBe(true);
  });

  it("실패 봉투를 parse", () => {
    const parsed = penaltyProofSubmitResponseSchema.parse({ ok: false, error: "forbidden" });
    expect(parsed.ok).toBe(false);
  });

  it("data의 extra 키(mediaPath)는 strip", () => {
    const parsed = penaltyProofSubmitResponseSchema.parse({
      ok: true,
      data: { proofId: "x", status: "pending", mediaPath: "u/c/penalty-abc.mov" },
    });
    if (parsed.ok) expect("mediaPath" in parsed.data).toBe(false);
  });

  it("알 수 없는 error 코드는 throw", () => {
    expect(() => penaltyProofSubmitResponseSchema.parse({ ok: false, error: "teapot" })).toThrow();
  });
});
