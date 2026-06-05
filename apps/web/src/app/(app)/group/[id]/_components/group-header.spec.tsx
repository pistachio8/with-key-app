// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GroupHeader } from "./group-header";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("../_actions", () => ({
  renameGroup: vi.fn(),
  deleteGroup: vi.fn(),
}));

const baseProps = {
  groupId: "22222222-2222-4222-8222-222222222222",
  name: "러닝 크루",
  isOwner: true,
  memberCount: 1,
  challengeCount: 0,
  hasOpenChallenge: false,
};

describe("GroupHeader", () => {
  it("renders a new challenge link when owner has no open challenge", () => {
    render(<GroupHeader {...baseProps} />);

    const link = screen.getByRole("link", { name: /이 그룹에서 새 챌린지/ });
    expect(link.getAttribute("href")).toBe(`/challenge/new?groupId=${baseProps.groupId}`);
  });

  it("disables the new challenge CTA while an open challenge exists", () => {
    render(<GroupHeader {...baseProps} hasOpenChallenge={true} />);

    expect(screen.getByRole("button", { name: /현재 진행 중인 챌린지가 있어요/ })).toBeDisabled();
    expect(screen.queryByRole("link", { name: /이 그룹에서 새 챌린지/ })).toBeNull();
  });

  it("disables delete for groups with two or more members", () => {
    render(<GroupHeader {...baseProps} memberCount={2} />);

    const button = screen.getByRole("button", { name: "그룹 삭제" });
    expect(button).toBeDisabled();
    expect(button.getAttribute("title")).toBe("친구와 함께한 그룹은 삭제할 수 없어요");
  });

  it("disables delete for groups with any challenge history", () => {
    render(<GroupHeader {...baseProps} challengeCount={1} />);

    const button = screen.getByRole("button", { name: "그룹 삭제" });
    expect(button).toBeDisabled();
    expect(button.getAttribute("title")).toBe(
      "한 번이라도 챌린지를 시작한 그룹은 삭제할 수 없어요",
    );
  });

  it("hides owner tools from non-owners", () => {
    render(<GroupHeader {...baseProps} isOwner={false} />);

    expect(screen.queryByRole("button", { name: "그룹 이름 바꾸기" })).toBeNull();
    expect(screen.queryByRole("button", { name: "그룹 삭제" })).toBeNull();
    expect(screen.queryByRole("link", { name: /이 그룹에서 새 챌린지/ })).toBeNull();
  });
});
