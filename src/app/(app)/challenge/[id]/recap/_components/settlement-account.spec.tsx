// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SettlementAccount } from "./settlement-account";

describe("SettlementAccount", () => {
  it("세 값 모두 있으면 은행명 · 마스킹 번호 · 예금주 표시", () => {
    render(<SettlementAccount bankCode="088" holder="김주은" last4="1234" />);
    expect(screen.getByText(/신한/)).toBeTruthy();
    expect(screen.getByText(/\*\*\*\*1234/)).toBeTruthy();
    expect(screen.getByText(/김주은/)).toBeTruthy();
  });

  it("bankCode/holder/last4 중 하나라도 null 이면 null 렌더", () => {
    const { container: c1 } = render(<SettlementAccount bankCode={null} holder="x" last4="1234" />);
    expect(c1.firstChild).toBeNull();
    const { container: c2 } = render(
      <SettlementAccount bankCode="088" holder={null} last4="1234" />,
    );
    expect(c2.firstChild).toBeNull();
    const { container: c3 } = render(<SettlementAccount bankCode="088" holder="x" last4={null} />);
    expect(c3.firstChild).toBeNull();
  });

  it("알 수 없는 bankCode 면 코드 자체 출력 (BANK_NAMES 폴백)", () => {
    render(<SettlementAccount bankCode="999" holder="x" last4="1234" />);
    expect(screen.getByText(/999/)).toBeTruthy();
  });
});
