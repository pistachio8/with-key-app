// src/components/app-shell/fab-photo-verify-sheet.spec.tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { FabPhotoVerifySheet } from "./fab-photo-verify-sheet";

const challenges = [
  { id: "c1", title: "아침 7시 기상", groupName: "새벽반" },
  { id: "c2", title: "매일 만보 걷기", groupName: "걷기모임" },
];

describe("FabPhotoVerifySheet", () => {
  it("open=true 면 각 챌린지가 /challenge/{id}/action 링크로 렌더", () => {
    render(<FabPhotoVerifySheet open onOpenChange={vi.fn()} challenges={challenges} />);
    expect(screen.getByRole("link", { name: /아침 7시 기상/ }).getAttribute("href")).toBe(
      "/challenge/c1/action",
    );
    expect(screen.getByRole("link", { name: /매일 만보 걷기/ }).getAttribute("href")).toBe(
      "/challenge/c2/action",
    );
  });

  it("링크 클릭 시 onOpenChange(false) 호출", () => {
    const onOpenChange = vi.fn();
    render(<FabPhotoVerifySheet open onOpenChange={onOpenChange} challenges={challenges} />);
    screen.getByRole("link", { name: /아침 7시 기상/ }).click();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
