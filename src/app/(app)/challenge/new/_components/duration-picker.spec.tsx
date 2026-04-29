// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DurationPicker } from "./duration-picker";

describe("DurationPicker", () => {
  it("renders 1주/2주/4주 preset + 직접 선택 as a radiogroup", () => {
    render(<DurationPicker value={7} onChange={() => {}} />);
    expect(screen.getByRole("radiogroup")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "1주" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "2주" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "4주" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /직접/ })).toBeTruthy();
  });

  it("calls onChange when a preset is picked", () => {
    const onChange = vi.fn();
    render(<DurationPicker value={7} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "2주" }));
    expect(onChange).toHaveBeenCalledWith(14);
  });

  it("marks the matching preset as checked with roving tabindex", () => {
    render(<DurationPicker value={14} onChange={() => {}} />);
    const two = screen.getByRole("radio", { name: "2주" });
    const one = screen.getByRole("radio", { name: "1주" });
    expect(two.getAttribute("aria-checked")).toBe("true");
    expect(one.getAttribute("aria-checked")).toBe("false");
    expect(two.getAttribute("tabindex")).toBe("0");
    expect(one.getAttribute("tabindex")).toBe("-1");
  });

  it("exposes a custom-days input when 직접 선택 is chosen", () => {
    const onChange = vi.fn();
    render(<DurationPicker value={7} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /직접/ }));
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "30" } });
    expect(onChange).toHaveBeenLastCalledWith(30);
  });

  it("clamps custom days to 1..90", () => {
    const onChange = vi.fn();
    render(<DurationPicker value={7} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /직접/ }));
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "999" } });
    expect(onChange).toHaveBeenLastCalledWith(90);
    fireEvent.change(input, { target: { value: "0" } });
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it("moves selection with ArrowRight/ArrowLeft and wraps at edges", () => {
    const onChange = vi.fn();
    render(<DurationPicker value={7} onChange={onChange} />);
    const oneWeek = screen.getByRole("radio", { name: "1주" });
    oneWeek.focus();
    fireEvent.keyDown(oneWeek, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(14);
    fireEvent.keyDown(screen.getByRole("radio", { name: "2주" }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith(7);
  });

  it("jumps to first/last via Home/End", () => {
    const onChange = vi.fn();
    render(<DurationPicker value={7} onChange={onChange} />);
    const oneWeek = screen.getByRole("radio", { name: "1주" });
    oneWeek.focus();
    fireEvent.keyDown(oneWeek, { key: "End" });
    // End lands on 직접 선택 (last option) — no days onChange, just mode flip.
    expect(screen.getByRole("spinbutton")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("radio", { name: /직접/ }), { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(7);
  });

  it("associates custom input with 1..90 hint via aria-describedby", () => {
    render(<DurationPicker value={7} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: /직접/ }));
    const input = screen.getByRole("spinbutton");
    const hintId = input.getAttribute("aria-describedby");
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId!)?.textContent).toMatch(/90일/);
  });
});
