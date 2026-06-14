// D-7 spec scenario 2 — domain 계약 테스트. submitActionLogResponseSchema 가 성공/실패
// 봉투를 accept, 계약 위반을 reject 한다. web BFF route·RN boundary eval 과 같은 공유
// fixture 를 parse 해 단일 계약(parity by construction)을 증명한다.
import { describe, expect, it } from "vitest";
import {
  SUBMIT_SUCCESS_ENVELOPE,
  SUBMIT_FAILURE_ENVELOPE,
  SUBMIT_VALIDATION_FAILURE_ENVELOPE,
  SUBMIT_MALFORMED_ENVELOPE,
} from "../../../../evals/fixtures/write-contracts/action-log";
import { submitActionLogResponseSchema } from "./action-log";

describe("submitActionLogResponseSchema", () => {
  it("성공 봉투(ok:true + SubmitResult)를 accept 한다", () => {
    const parsed = submitActionLogResponseSchema.parse(SUBMIT_SUCCESS_ENVELOPE);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data.verifiedDays).toEqual([1]);
  });

  it("실패 봉투(ok:false + error)를 accept 한다", () => {
    const parsed = submitActionLogResponseSchema.parse(SUBMIT_FAILURE_ENVELOPE);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toBe("forbidden");
  });

  it("검증 실패 봉투(issues 동반)를 accept 한다", () => {
    const parsed = submitActionLogResponseSchema.parse(SUBMIT_VALIDATION_FAILURE_ENVELOPE);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues?.selectedKeywords).toHaveLength(1);
  });

  it("계약 위반(data 누락)은 reject — 깨진 데이터가 화면에 닿지 않는다", () => {
    expect(() => submitActionLogResponseSchema.parse(SUBMIT_MALFORMED_ENVELOPE)).toThrow();
  });

  it("error 가 허용 코드 밖이면 reject", () => {
    expect(() => submitActionLogResponseSchema.parse({ ok: false, error: "teapot" })).toThrow();
  });
});
