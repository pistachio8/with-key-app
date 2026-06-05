// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PenaltyPicker } from "./penalty-picker";

describe("PenaltyPicker", () => {
  it("renders 4 presets (없음 / 3천원 / 5천원 / 만원)", () => {
    render(<PenaltyPicker value={0} onChange={() => {}} />);
    expect(screen.getByRole("radiogroup")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "없음" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "3천원" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "5천원" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "만원" })).toBeTruthy();
  });

  it("calls onChange when a preset is picked", () => {
    const onChange = vi.fn();
    render(<PenaltyPicker value={0} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "5천원" }));
    expect(onChange).toHaveBeenCalledWith(5000);
  });

  it("marks the matching preset as checked with roving tabindex", () => {
    render(<PenaltyPicker value={3000} onChange={() => {}} />);
    const three = screen.getByRole("radio", { name: "3천원" });
    const zero = screen.getByRole("radio", { name: "없음" });
    expect(three.getAttribute("aria-checked")).toBe("true");
    expect(zero.getAttribute("aria-checked")).toBe("false");
    expect(three.getAttribute("tabindex")).toBe("0");
    expect(zero.getAttribute("tabindex")).toBe("-1");
  });

  it("moves selection with arrow keys and wraps at edges", () => {
    const onChange = vi.fn();
    render(<PenaltyPicker value={0} onChange={onChange} />);
    const first = screen.getByRole("radio", { name: "없음" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(3000);
    fireEvent.keyDown(screen.getByRole("radio", { name: "3천원" }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("jumps to first/last via Home/End", () => {
    const onChange = vi.fn();
    render(<PenaltyPicker value={0} onChange={onChange} />);
    const first = screen.getByRole("radio", { name: "없음" });
    first.focus();
    fireEvent.keyDown(first, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(10000);
    fireEvent.keyDown(screen.getByRole("radio", { name: "만원" }), { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("helper 텍스트: 0원 → '강제력 없이…', 그 외 → 'N원 자동 누적'", () => {
    const { rerender } = render(<PenaltyPicker value={0} onChange={() => {}} />);
    expect(screen.getByText(/강제력 없이/)).toBeTruthy();
    rerender(<PenaltyPicker value={5000} onChange={() => {}} />);
    expect(screen.getByText(/5,000원이 자동으로 누적/)).toBeTruthy();
  });
});
