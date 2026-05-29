// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const confettiFn = vi.fn();
vi.mock("canvas-confetti", () => ({ default: (...args: unknown[]) => confettiFn(...args) }));

import { ConfettiBurst } from "./confetti-burst";

describe("ConfettiBurst", () => {
  beforeEach(() => {
    confettiFn.mockClear();
    // 명시적으로 모션 허용.
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  });

  it("fire=true 면 confetti 를 호출한다", async () => {
    render(<ConfettiBurst fire />);
    await waitFor(() => expect(confettiFn).toHaveBeenCalled());
  });

  it("fire=false 면 호출하지 않는다", () => {
    render(<ConfettiBurst fire={false} />);
    expect(confettiFn).not.toHaveBeenCalled();
  });

  it("reduced-motion 이면 생략한다", async () => {
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    render(<ConfettiBurst fire />);
    await new Promise((r) => setTimeout(r, 40));
    expect(confettiFn).not.toHaveBeenCalled();
  });
});
