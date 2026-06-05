import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { InvitedChallengeBanner } from "./invited-challenge-banner";

describe("InvitedChallengeBanner", () => {
  it("invites.length=0 → null 렌더", () => {
    const { container } = render(<InvitedChallengeBanner invites={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("invites 1건 → 제목 노출 + 1 배지", () => {
    render(
      <InvitedChallengeBanner
        invites={[{ challengeId: "c1", title: "30일 헬스장 출석", groupName: "찐친4" }]}
      />,
    );
    expect(screen.getByText("초대받은 챌린지")).toBeTruthy();
    expect(screen.getByLabelText("1건")).toBeTruthy();
    expect(screen.getByText("찐친4 · 30일 헬스장 출석")).toBeTruthy();
  });

  it("link href 는 /challenge/{id}/pledge", () => {
    render(
      <InvitedChallengeBanner
        invites={[{ challengeId: "c1", title: "30일 헬스장 출석", groupName: null }]}
      />,
    );
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/challenge/c1/pledge");
  });
});
