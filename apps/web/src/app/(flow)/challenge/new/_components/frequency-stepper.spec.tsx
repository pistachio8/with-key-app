import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FrequencyStepper } from "./frequency-stepper";

describe("FrequencyStepper", () => {
  it("value=7 → '매일' + 헬퍼 '한 주에 7번 인증'", () => {
    render(<FrequencyStepper value={7} onChange={() => {}} />);
    expect(screen.getByText("매일")).toBeTruthy();
    expect(screen.getByText("한 주에 7번 인증")).toBeTruthy();
  });

  it("value=3 → '주 3번'", () => {
    render(<FrequencyStepper value={3} onChange={() => {}} />);
    expect(screen.getByText("주 3번")).toBeTruthy();
  });

  it("+ 클릭 시 onChange(value+1)", () => {
    const onChange = vi.fn();
    render(<FrequencyStepper value={3} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /늘리기/ }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("max 도달 시 onChange 호출 안 함", () => {
    const onChange = vi.fn();
    render(<FrequencyStepper value={7} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /늘리기/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ArrowUp 키보드 → onChange(value+1)", () => {
    const onChange = vi.fn();
    render(<FrequencyStepper value={3} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith(4);
  });
});
