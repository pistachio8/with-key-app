// src/components/app-shell/fab-menu.spec.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { FabMenu } from "./fab-menu";

let mockPath = "/home";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const toastMock = vi.fn();
vi.mock("sonner", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

// 하위 Dialog 들은 동작만 검증 — portal 복잡성 회피용 스텁.
vi.mock("./group-switcher-sheet", () => ({
  GroupSwitcherSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="group-sheet" /> : null,
}));
vi.mock("./fab-photo-verify-sheet", () => ({
  FabPhotoVerifySheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="verify-sheet" /> : null,
}));

const oneActive = [{ id: "c1", title: "아침 기상", groupName: "새벽반" }];
const twoActive = [
  { id: "c1", title: "아침 기상", groupName: "새벽반" },
  { id: "c2", title: "만보 걷기", groupName: "걷기모임" },
];

beforeEach(() => {
  mockPath = "/home";
  toastMock.mockReset();
});

describe("FabMenu", () => {
  it("닫힘 상태: 메인 버튼 aria-expanded=false, 라벨 '메뉴 열기'", () => {
    render(<FabMenu activeChallenges={oneActive} groups={[]} newGroupNamePreview="내 그룹" />);
    const main = screen.getByRole("button", { name: "메뉴 열기" });
    expect(main.getAttribute("aria-expanded")).toBe("false");
  });

  it("메인 탭 시 aria-expanded=true 로 토글되고 자식 3개(홈/사진 인증/그룹) 노출", () => {
    render(<FabMenu activeChallenges={oneActive} groups={[]} newGroupNamePreview="내 그룹" />);
    fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
    expect(screen.getByRole("button", { name: "메뉴 닫기" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(screen.getByRole("link", { name: "홈" }).getAttribute("href")).toBe("/home");
    expect(screen.getByLabelText("사진 인증")).toBeTruthy();
    expect(screen.getByLabelText("그룹")).toBeTruthy();
  });

  it("그룹 0개면 그룹 버튼이 /group/new 링크", () => {
    render(<FabMenu activeChallenges={oneActive} groups={[]} newGroupNamePreview="내 그룹" />);
    fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
    const group = screen.getByLabelText("그룹");
    expect(group.getAttribute("href")).toBe("/group/new");
  });

  it("그룹 1개+면 그룹 버튼 클릭 시 그룹 시트 오픈", () => {
    render(
      <FabMenu
        activeChallenges={oneActive}
        groups={[{ id: "g1", name: "러닝" }]}
        newGroupNamePreview="내 그룹"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
    fireEvent.click(screen.getByLabelText("그룹"));
    expect(screen.getByTestId("group-sheet")).toBeTruthy();
  });

  it("active 1개면 사진 인증이 그 챌린지 action 링크", () => {
    render(<FabMenu activeChallenges={oneActive} groups={[]} newGroupNamePreview="내 그룹" />);
    fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
    expect(screen.getByLabelText("사진 인증").getAttribute("href")).toBe("/challenge/c1/action");
  });

  it("active 2개+면 사진 인증 클릭 시 선택 시트 오픈", () => {
    render(<FabMenu activeChallenges={twoActive} groups={[]} newGroupNamePreview="내 그룹" />);
    fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
    fireEvent.click(screen.getByLabelText("사진 인증"));
    expect(screen.getByTestId("verify-sheet")).toBeTruthy();
  });

  it("active 0개면 사진 인증 클릭 시 toast 안내", () => {
    render(<FabMenu activeChallenges={[]} groups={[]} newGroupNamePreview="내 그룹" />);
    fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
    fireEvent.click(screen.getByLabelText("사진 인증"));
    expect(toastMock).toHaveBeenCalledWith("진행 중인 챌린지가 없어요");
  });

  it("/challenge/[id]/action 경로에서는 렌더하지 않음", () => {
    mockPath = "/challenge/c1/action";
    render(<FabMenu activeChallenges={oneActive} groups={[]} newGroupNamePreview="내 그룹" />);
    expect(screen.queryByRole("button", { name: "메뉴 열기" })).toBeNull();
  });

  it("챌린지 화면 안이면 사진 인증이 그 챌린지로 직행", () => {
    mockPath = "/challenge/c2/dashboard";
    render(<FabMenu activeChallenges={twoActive} groups={[]} newGroupNamePreview="내 그룹" />);
    fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
    expect(screen.getByLabelText("사진 인증").getAttribute("href")).toBe("/challenge/c2/action");
  });
});
