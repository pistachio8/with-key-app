// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemberRoster } from "./member-roster";

describe("MemberRoster", () => {
  it("멤버 전원의 displayName 표시 (달성·미달성 차이 없음)", () => {
    render(
      <MemberRoster
        members={[
          { id: "a", displayName: "김주은", isMvp: false },
          { id: "b", displayName: "최소원", isMvp: false },
          { id: "c", displayName: "이성훈", isMvp: false },
          { id: "d", displayName: "박지민", isMvp: false },
        ]}
      />,
    );
    expect(screen.getByText("김주은")).toBeTruthy();
    expect(screen.getByText("박지민")).toBeTruthy();
  });

  it("동명이인이 있어도 key 충돌 없이 둘 다 렌더", () => {
    render(
      <MemberRoster
        members={[
          { id: "u1", displayName: "민지", isMvp: false },
          { id: "u2", displayName: "민지", isMvp: false },
        ]}
      />,
    );
    expect(screen.getAllByText("민지")).toHaveLength(2);
  });

  it("isMvp true 멤버 옆에 왕관 아이콘 (aria-label='MVP')", () => {
    render(<MemberRoster members={[{ id: "b", displayName: "JJ", isMvp: true }]} />);
    expect(screen.getByLabelText("MVP")).toBeTruthy();
  });

  it("멤버 0명이면 null", () => {
    const { container } = render(<MemberRoster members={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
