// @vitest-environment jsdom
// src/app/(app)/challenge/[id]/recap/_components/account-copy-button.spec.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { copyFn, state } = vi.hoisted(() => ({
  copyFn: vi.fn(),
  state: { copying: false },
}));
vi.mock("../../_components/use-copy-account-number", () => ({
  useCopyAccountNumber: () => ({ copy: copyFn, copying: state.copying }),
}));

import { AccountCopyButton } from "./account-copy-button";

describe("AccountCopyButton", () => {
  beforeEach(() => {
    copyFn.mockReset();
    state.copying = false;
  });

  it("클릭 시 copy() 호출", () => {
    render(<AccountCopyButton groupId="g1" />);
    fireEvent.click(screen.getByRole("button", { name: /계좌번호 복사/ }));
    expect(copyFn).toHaveBeenCalledTimes(1);
  });

  it("copying 중에는 '복사 중...' 표시 + disabled", () => {
    state.copying = true;
    render(<AccountCopyButton groupId="g1" />);
    const btn = screen.getByRole("button", { name: /복사 중/ });
    expect(btn.hasAttribute("disabled")).toBe(true);
  });
});
