import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf-8");

function extractToken(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`token --${name} not found`);
  return match[1].trim();
}

describe("design tokens (globals.css)", () => {
  it("primary token uses 2026-05-14 mockup palette", () => {
    expect(extractToken("primary")).toContain("oklch(0.72 0.106 268)");
  });
  it("secondary token uses mockup yellow", () => {
    expect(extractToken("secondary")).toContain("oklch(0.886 0.107 87)");
  });
  it("background uses mockup off-white", () => {
    expect(extractToken("background")).toContain("oklch(0.975 0.005 264)");
  });
  it("radius is 0.875rem (14px) per mockup card radius", () => {
    expect(extractToken("radius")).toBe("0.875rem");
  });
  it("brand-* tokens exist for non-semantic mockup colors", () => {
    expect(() => extractToken("brand-pink")).not.toThrow();
    expect(() => extractToken("brand-warn")).not.toThrow();
    expect(() => extractToken("brand-success")).not.toThrow();
    expect(() => extractToken("brand-primary-deep")).not.toThrow();
  });
  it("motion tokens are present", () => {
    expect(() => extractToken("motion-fast")).not.toThrow();
    expect(() => extractToken("motion-base")).not.toThrow();
    expect(() => extractToken("motion-stamp")).not.toThrow();
  });
  it("dark mode infrastructure retained (inactive)", () => {
    expect(css).toMatch(/\.dark\s*{/);
  });
});
