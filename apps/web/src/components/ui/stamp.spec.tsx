import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Stamp } from "./stamp";

describe("Stamp", () => {
  it("label variant: label 텍스트 + aria-label 노출", () => {
    render(<Stamp label="시작" tone="success" />);
    expect(screen.getByRole("img", { name: "시작" })).toBeTruthy();
    expect(screen.getByText("시작")).toBeTruthy();
  });

  it("wordmark variant: from·with 락업 + 기본 aria-label", () => {
    render(<Stamp variant="wordmark" tone="onPrimary" />);
    expect(screen.getByRole("img", { name: "from·with" })).toBeTruthy();
    expect(screen.getByText("from")).toBeTruthy();
    expect(screen.getByText("with")).toBeTruthy();
  });

  it("onPrimary tone: 흰색(primary-foreground) 테두리·텍스트 클래스 적용", () => {
    render(<Stamp variant="wordmark" tone="onPrimary" />);
    const el = screen.getByRole("img");
    expect(el.className).toContain("border-primary-foreground");
    expect(el.className).toContain("text-primary-foreground");
  });

  it("className override: twMerge 로 size-20 → size-14 치환 (primary 카드 대비 픽스 메커니즘)", () => {
    render(<Stamp variant="wordmark" className="size-14" />);
    const el = screen.getByRole("img");
    expect(el.className).toContain("size-14");
    expect(el.className).not.toContain("size-20");
  });
});
