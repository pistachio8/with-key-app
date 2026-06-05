// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KudosBar } from "./kudos-bar";

describe("KudosBar", () => {
  const counts = { "🔥": 3, "💪": 1, "👏": 0 } as const;

  it("renders all 3 PRD emojis even when count is 0", () => {
    render(<KudosBar counts={counts} viewerKudos={[]} onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: /🔥 응원 3/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /💪 응원 1/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /👏 응원 0/ })).toBeTruthy();
  });

  it("marks pressed buttons via aria-pressed when viewerKudos contains the emoji", () => {
    render(<KudosBar counts={counts} viewerKudos={["🔥"]} onToggle={() => {}} />);
    expect(
      screen.getByRole("button", { name: /🔥 응원 3 · 내가 누름/ }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("button", { name: /💪 응원 1/ }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("invokes onToggle with the clicked emoji", () => {
    const onToggle = vi.fn();
    render(<KudosBar counts={counts} viewerKudos={[]} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: /💪/ }));
    expect(onToggle).toHaveBeenCalledWith("💪");
  });

  it("disables all buttons when disabled=true (self-author)", () => {
    render(<KudosBar counts={counts} viewerKudos={[]} onToggle={() => {}} disabled />);
    for (const btn of screen.getAllByRole("button")) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
