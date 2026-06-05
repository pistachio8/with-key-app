import { describe, expect, it } from "vitest";
import { completedTitle, firstSuccessTitle } from "./action-result-copy";

describe("action-result-copy", () => {
  it("completedTitle: 활동별 라벨 포함", () => {
    expect(completedTitle("gym")).toBe("오늘 헬스 인증 완료!");
    expect(completedTitle("running")).toBe("오늘 러닝 인증 완료!");
    expect(completedTitle("meal")).toBe("오늘 식단 인증 완료!");
  });

  it("completedTitle: other는 활동명 생략", () => {
    expect(completedTitle("other")).toBe("오늘 인증 완료!");
  });

  it("firstSuccessTitle: 활동별 라벨 포함", () => {
    expect(firstSuccessTitle("yoga")).toBe("첫 요가 인증 성공!");
  });

  it("firstSuccessTitle: other는 활동명 생략", () => {
    expect(firstSuccessTitle("other")).toBe("첫 인증 성공!");
  });
});
