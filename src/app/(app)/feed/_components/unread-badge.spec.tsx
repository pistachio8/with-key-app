import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { UnreadBadge } from "./unread-badge";

describe("UnreadBadge", () => {
  it("count=0 이면 아무것도 렌더하지 않음", () => {
    const { container } = render(<UnreadBadge count={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("count=3 → '새 응원 3건'", () => {
    render(<UnreadBadge count={3} />);
    expect(screen.getByText("새 응원 3건")).toBeTruthy();
  });

  it("count>=100 → '새 응원 99+건' 으로 상한", () => {
    render(<UnreadBadge count={250} />);
    expect(screen.getByText("새 응원 99+건")).toBeTruthy();
  });
});
