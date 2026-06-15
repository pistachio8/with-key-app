import { describe, expect, it } from "vitest";
import { loadVerifyConfig, loadVerifyOpsConfig } from "./config";

// θ env 주입(config.ts) 검증 — 기본값(spec 잠정 θ)·파싱·경계 실패를 본다.
// process.env 전역을 오염시키지 않도록 env 객체를 직접 주입한다.

describe("loadVerifyConfig", () => {
  it("미설정 시 spec 잠정 θ 기본값(6/10, shadow)", () => {
    expect(loadVerifyConfig({})).toEqual({
      phashFailMax: 6,
      phashReviewMax: 10,
      enforce: false,
    });
  });

  it("빈 문자열은 미설정과 동일하게 기본값 폴백", () => {
    expect(loadVerifyConfig({ VERIFY_PHASH_FAIL_MAX: "", VERIFY_ENFORCE: "" })).toEqual({
      phashFailMax: 6,
      phashReviewMax: 10,
      enforce: false,
    });
  });

  it("env 값을 θ 로 파싱한다 — 코드 변경 없이 주입값만 교체 가능", () => {
    expect(
      loadVerifyConfig({
        VERIFY_PHASH_FAIL_MAX: "4",
        VERIFY_PHASH_REVIEW_MAX: "8",
        VERIFY_ENFORCE: "true",
      }),
    ).toEqual({ phashFailMax: 4, phashReviewMax: 8, enforce: true });
  });

  it("failMax > reviewMax 면 경계에서 빠르게 throw", () => {
    expect(() =>
      loadVerifyConfig({ VERIFY_PHASH_FAIL_MAX: "12", VERIFY_PHASH_REVIEW_MAX: "8" }),
    ).toThrow();
  });

  it("숫자/불리언이 아닌 값은 throw — 조용한 폴백 금지", () => {
    expect(() => loadVerifyConfig({ VERIFY_PHASH_FAIL_MAX: "six" })).toThrow();
    expect(() => loadVerifyConfig({ VERIFY_ENFORCE: "yes" })).toThrow();
  });
});

// 운영 이상 알림 임계(θ 무관) — 기본값·env override·빈 문자열 폴백 검증.
describe("loadVerifyOpsConfig", () => {
  it("기본값 — failed 0.3 / reject 0.3 / minSample 3", () => {
    expect(loadVerifyOpsConfig({})).toEqual({ failedRate: 0.3, rejectRate: 0.3, minSample: 3 });
  });

  it("env override 를 zod coerce 한다", () => {
    const c = loadVerifyOpsConfig({ VERIFY_OPS_FAILED_RATE: "0.5", VERIFY_OPS_MIN_SAMPLE: "5" });
    expect(c.failedRate).toBe(0.5);
    expect(c.minSample).toBe(5);
  });

  it("빈 문자열은 기본값 폴백", () => {
    expect(loadVerifyOpsConfig({ VERIFY_OPS_REJECT_RATE: "" }).rejectRate).toBe(0.3);
  });
});
