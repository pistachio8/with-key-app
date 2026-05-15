import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { Stamp } from "@/components/ui/stamp";

describe("Stamp", () => {
  it("registers IntersectionObserver on mount", () => {
    const observe = vi.fn();
    global.IntersectionObserver = class {
      observe = observe;
      disconnect = vi.fn();
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
      root = null;
      rootMargin = "";
      thresholds = [];
    };
    render(<Stamp label="인증 완료" />);
    expect(observe).toHaveBeenCalledTimes(1);
  });
});
