// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

let mockPathname = "/home";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

import { ActionVisitKeyProvider, useActionVisitKey } from "./action-visit-key";

function Probe() {
  const k = useActionVisitKey();
  return <span data-testid="vk">{k}</span>;
}

function tree() {
  return (
    <ActionVisitKeyProvider>
      <Probe />
    </ActionVisitKeyProvider>
  );
}

describe("ActionVisitKeyProvider", () => {
  it("bumps the visit key on every /action (re)entry, not on leaving", () => {
    mockPathname = "/home";
    const { rerender, getByTestId } = render(tree());
    const vk = () => getByTestId("vk").textContent;
    expect(vk()).toBe("0");

    // 진입: /home → /action → +1
    mockPathname = "/challenge/c1/action";
    rerender(tree());
    expect(vk()).toBe("1");

    // 이탈: /action → /home → 변화 없음
    mockPathname = "/home";
    rerender(tree());
    expect(vk()).toBe("1");

    // 동일-챌린지 재진입(주 증상) → +1 (key 변경 → ActionForm remount)
    mockPathname = "/challenge/c1/action";
    rerender(tree());
    expect(vk()).toBe("2");

    // 교차 챌린지 진입 → +1
    mockPathname = "/challenge/c2/action";
    rerender(tree());
    expect(vk()).toBe("3");
  });
});
