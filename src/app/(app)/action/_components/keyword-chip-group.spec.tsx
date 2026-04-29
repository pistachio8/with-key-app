// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KeywordChipGroup } from "./keyword-chip-group";

const shown = ["펌핑", "PR도전", "하체데이", "스쿼트"];

describe("KeywordChipGroup", () => {
  it("toggles keyword up to 3", () => {
    const onChange = vi.fn();
    render(<KeywordChipGroup shown={shown} selected={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "펌핑" }));
    expect(onChange).toHaveBeenCalledWith(["펌핑"]);
  });

  it("oldest selection auto-drops when selecting a 4th", () => {
    const onChange = vi.fn();
    render(
      <KeywordChipGroup
        shown={shown}
        selected={["펌핑", "PR도전", "하체데이"]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "스쿼트" }));
    expect(onChange).toHaveBeenCalledWith(["PR도전", "하체데이", "스쿼트"]);
  });

  it("deselects when clicking selected chip", () => {
    const onChange = vi.fn();
    render(<KeywordChipGroup shown={shown} selected={["펌핑"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "펌핑" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
