// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PenaltyPicker } from "./penalty-picker";

describe("PenaltyPicker", () => {
  it("renders 4 presets as a radiogroup with KRW labels", () => {
    render(<PenaltyPicker value={1000} onChange={() => {}} />);
    expect(screen.getByRole("radiogroup")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "1,000원" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "3,000원" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "5,000원" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "10,000원" })).toBeTruthy();
  });

  it("calls onChange when a preset is picked", () => {
    const onChange = vi.fn();
    render(<PenaltyPicker value={1000} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "5,000원" }));
    expect(onChange).toHaveBeenCalledWith(5000);
  });

  it("marks the matching preset as checked with roving tabindex", () => {
    render(<PenaltyPicker value={3000} onChange={() => {}} />);
    const three = screen.getByRole("radio", { name: "3,000원" });
    const one = screen.getByRole("radio", { name: "1,000원" });
    expect(three.getAttribute("aria-checked")).toBe("true");
    expect(one.getAttribute("aria-checked")).toBe("false");
    expect(three.getAttribute("tabindex")).toBe("0");
    expect(one.getAttribute("tabindex")).toBe("-1");
  });

  it("moves selection with arrow keys and wraps at edges", () => {
    const onChange = vi.fn();
    render(<PenaltyPicker value={1000} onChange={onChange} />);
    const first = screen.getByRole("radio", { name: "1,000원" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(3000);
    fireEvent.keyDown(screen.getByRole("radio", { name: "3,000원" }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith(1000);
  });

  it("jumps to first/last via Home/End", () => {
    const onChange = vi.fn();
    render(<PenaltyPicker value={1000} onChange={onChange} />);
    const first = screen.getByRole("radio", { name: "1,000원" });
    first.focus();
    fireEvent.keyDown(first, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(10000);
    fireEvent.keyDown(screen.getByRole("radio", { name: "10,000원" }), { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(1000);
  });
});
