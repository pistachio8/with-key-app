// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RecapMembersList } from "./recap-members-list";

describe("RecapMembersList", () => {
  it("각 멤버 이름 · 인증 횟수 표시", () => {
    render(
      <RecapMembersList
        goalCount={3}
        members={[
          { id: "a", displayName: "민지", doneCount: 3, achieved: true, isMvp: false },
          { id: "b", displayName: "JJ", doneCount: 5, achieved: true, isMvp: true },
        ]}
      />,
    );
    expect(screen.getByText("민지")).toBeTruthy();
    expect(screen.getByText("JJ")).toBeTruthy();
    expect(screen.getByText("3 / 3")).toBeTruthy();
    expect(screen.getByText("5 / 3")).toBeTruthy();
  });

  it("MVP 멤버에 MVP 뱃지 표시", () => {
    render(
      <RecapMembersList
        goalCount={3}
        members={[{ id: "b", displayName: "JJ", doneCount: 5, achieved: true, isMvp: true }]}
      />,
    );
    expect(screen.getByLabelText(/MVP/)).toBeTruthy();
  });

  it("미달성 멤버는 '아쉬워요' 뱃지", () => {
    render(
      <RecapMembersList
        goalCount={3}
        members={[{ id: "c", displayName: "희수", doneCount: 1, achieved: false, isMvp: false }]}
      />,
    );
    expect(screen.getByText("아쉬워요")).toBeTruthy();
  });
});
