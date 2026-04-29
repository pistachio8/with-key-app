// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemberStrip } from "./member-strip";

describe("MemberStrip", () => {
  const baseMembers = [
    { id: "u1", displayName: "나", doneCount: 2 },
    { id: "u2", displayName: "민지", doneCount: 3 },
    { id: "u3", displayName: "JJ", doneCount: 1 },
  ];

  it("renders each member with doneCount/goalCount", () => {
    render(<MemberStrip goalCount={3} members={baseMembers} />);
    expect(screen.getByText("나")).toBeTruthy();
    expect(screen.getByText("민지")).toBeTruthy();
    expect(screen.getByText("JJ")).toBeTruthy();
    expect(screen.getByText("2/3회")).toBeTruthy();
    expect(screen.getByText("3/3회")).toBeTruthy();
    expect(screen.getByText("1/3회")).toBeTruthy();
  });

  it("each member has a progressbar with correct aria-valuenow", () => {
    render(<MemberStrip goalCount={3} members={baseMembers} />);
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(3);
    expect(bars[0].getAttribute("aria-valuenow")).toBe("67");
    expect(bars[1].getAttribute("aria-valuenow")).toBe("100");
    expect(bars[2].getAttribute("aria-valuenow")).toBe("33");
  });

  it("clamps over-goal doneCount at 100%", () => {
    render(<MemberStrip goalCount={3} members={[{ id: "u1", displayName: "나", doneCount: 5 }]} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
  });

  it("treats goalCount=0 as 0% (zero-division guard)", () => {
    render(<MemberStrip goalCount={0} members={[{ id: "u1", displayName: "나", doneCount: 1 }]} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
  });

  it("shows empty state when members is empty", () => {
    render(<MemberStrip goalCount={3} members={[]} />);
    expect(screen.queryAllByRole("progressbar")).toHaveLength(0);
    expect(screen.getByText("아직 참여한 멤버가 없어요.")).toBeTruthy();
  });

  it("clamps negative doneCount at 0%", () => {
    render(
      <MemberStrip goalCount={3} members={[{ id: "u1", displayName: "나", doneCount: -1 }]} />,
    );
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
  });
});
