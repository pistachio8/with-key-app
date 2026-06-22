// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PeerRejectButton } from "./peer-reject-button";

describe("PeerRejectButton", () => {
  it("'반려' 라벨과 카운트를 렌더한다", () => {
    render(<PeerRejectButton count={3} active={false} onToggle={() => {}} />);
    expect(screen.getByText("반려")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("active 면 aria-pressed=true 와 '내가 반려함' 안내를 노출한다", () => {
    render(<PeerRejectButton count={3} active onToggle={() => {}} />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.getAttribute("aria-label")).toContain("내가 반려함");
  });

  it("클릭 시 onToggle 을 호출한다", () => {
    const onToggle = vi.fn();
    render(<PeerRejectButton count={0} active={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("disabled 면 클릭이 onToggle 을 호출하지 않는다", () => {
    const onToggle = vi.fn();
    render(<PeerRejectButton count={0} active={false} onToggle={onToggle} disabled />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
