import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Stamp } from "@/components/ui/stamp";

describe("Stamp", () => {
  it("applies animate-stamp-in on mount so the stamp animation always plays", () => {
    const { container } = render(<Stamp label="인증 완료" />);
    const el = container.querySelector("[role='img']");
    expect(el).not.toBeNull();
    expect(el?.className).toContain("animate-stamp-in");
  });
});
