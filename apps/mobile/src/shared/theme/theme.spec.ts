// apps/mobile/src/shared/theme/theme.spec.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { converter } from "culori";

import { colors } from "./colors";
import { typography } from "./typography";
import { radius } from "./radius";
import { motion } from "./motion";
import { spacing } from "./spacing";

// monorepo 상대경로: apps/mobile/src/shared/theme → repo root → apps/web/src/app/globals.css
const GLOBALS = readFileSync(join(__dirname, "../../../../web/src/app/globals.css"), "utf8");

const toRgb = converter("rgb");
function oklchToHex(oklch: string): string {
  const c = toRgb(oklch);
  if (!c) throw new Error(`culori failed to parse ${oklch}`);
  const to255 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  const hex = (v: number) => to255(v).toString(16).padStart(2, "0");
  return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`.toUpperCase();
}

describe("colors — web globals.css hex SoT 미러", () => {
  // (a) hex 원본이 globals.css 주석/정의에 있는 토큰들
  const HEX_SOT: Record<string, string> = {
    background: "#F7F8FB",
    foreground: "#22262E",
    primary: "#8AA4FF",
    secondary: "#FFD46B",
    accent: "#BCA6FF",
    destructive: "#FF6B6B",
    border: "#E8EBF0",
    brandPink: "#FFB6C6",
    brandWarn: "#FF8A4E",
    brandSuccess: "#52C28C",
    brandPrimarySoft: "#E8EDFF",
    brandSecondarySoft: "#FFF5DA",
  };

  it.each(Object.entries(HEX_SOT))("%s = globals.css hex SoT", (key, hex) => {
    expect(colors[key as keyof typeof colors]).toBe(hex);
    // globals.css 주석에 그 hex 가 실제로 존재하는지 (SoT 추적성)
    expect(GLOBALS.toUpperCase()).toContain(hex);
  });

  // (b) OKLCH 가 SoT 인 AA 보정 토큰 — culori 변환 일치
  const OKLCH_SOT: Record<string, string> = {
    muted: "oklch(0.955 0.005 264)",
    mutedForeground: "oklch(0.5 0.015 264)",
    brandPrimaryDeep: "oklch(0.66 0.13 268)",
  };

  it.each(Object.entries(OKLCH_SOT))("%s = culori(OKLCH SoT)", (key, oklch) => {
    expect(colors[key as keyof typeof colors]).toBe(oklchToHex(oklch));
  });

  // (b-2) 신규 시맨틱 토큰 — globals.css OKLCH 정의를 culori 로 미러 (input·ring·popover·popoverForeground)
  const SEMANTIC_OKLCH_SOT: Record<string, string> = {
    input: "oklch(0.939 0.007 260.7)", // = --border
    ring: "oklch(0.737 0.135 270.7)", // = --primary
    popover: "oklch(1 0 0)", // = --card
    popoverForeground: "oklch(0.268 0.016 264.3)", // = --foreground
  };

  it.each(Object.entries(SEMANTIC_OKLCH_SOT))("%s = culori(globals.css OKLCH)", (key, oklch) => {
    expect(colors[key as keyof typeof colors]).toBe(oklchToHex(oklch));
    expect(GLOBALS).toContain(oklch); // globals.css 에 정의 존재 (SoT 추적성)
  });

  it("popover/input/ring 이 동일-OKLCH 형제 토큰과 일치", () => {
    expect(colors.input).toBe(colors.border);
    expect(colors.ring).toBe(colors.primary);
    expect(colors.popover).toBe(colors.card);
    expect(colors.popoverForeground).toBe(colors.cardForeground);
  });

  // (b-3) streak 채도 단계 (globals.css:103-109) — OKLCH SoT culori 변환
  const STREAK_OKLCH_SOT: Record<string, string> = {
    streak1: "oklch(0.93 0.045 270.7)",
    streak2: "oklch(0.885 0.067 270.7)",
    streak3: "oklch(0.84 0.088 270.7)",
    streak4: "oklch(0.79 0.108 270.7)",
    streak5: "oklch(0.74 0.125 270.7)",
    streak6: "oklch(0.685 0.138 270.7)",
    streak7: "oklch(0.62 0.15 270.7)",
  };

  it.each(Object.entries(STREAK_OKLCH_SOT))("%s = culori(OKLCH SoT)", (key, oklch) => {
    expect(colors[key as keyof typeof colors]).toBe(oklchToHex(oklch));
    expect(GLOBALS).toContain(oklch); // streak 은 hex SoT 부재 — OKLCH 정의로만 추적
  });

  // (c) invite 팔레트 (globals.css 직접 hex)
  it("invite 팔레트가 globals.css hex 와 일치", () => {
    expect(colors.invite).toEqual({
      bg: "#faf6ef",
      ink: "#2a221c",
      muted: "#5e4838",
      accent: "#b07a4d",
      gold: "#c9a878",
      line: "#e5d8c2",
      terra: "#c2683d",
      subtext: "#8e8579",
      dashline: "#c9c0b0",
      stamp: "#4a3f37",
    });
    for (const v of Object.values(colors.invite)) {
      expect(GLOBALS).toContain(v);
    }
  });

  // (d) 레거시 alias 보존 (기존 화면 비파괴)
  it("레거시 키가 새 토큰으로 alias 된다", () => {
    expect(colors.textStrong).toBe(colors.foreground);
    expect(colors.text).toBe(colors.foreground);
    expect(colors.textSubtle).toBe(colors.mutedForeground);
    expect(colors.textMuted).toBe(colors.mutedForeground);
    expect(colors.primarySoft).toBe(colors.brandPrimarySoft);
    expect(colors.success).toBe(colors.brandSuccess);
    expect(colors.warn).toBe(colors.brandWarn);
    expect(colors.danger).toBe(colors.destructive);
    expect(colors.inverse).toBe(colors.primaryForeground);
  });
});

describe("typography — globals.css .t-* 환산", () => {
  it("h1 = 28/800/-0.56/33.6", () => {
    expect(typography.h1).toEqual({
      fontSize: 28,
      fontWeight: "800",
      letterSpacing: -0.56, // -0.02em × 28
      lineHeight: 33.6, // 1.2 × 28
    });
  });
  it("h2 = 22/700/-0.22/27.5", () => {
    expect(typography.h2).toEqual({
      fontSize: 22,
      fontWeight: "700",
      letterSpacing: -0.22,
      lineHeight: 27.5,
    });
  });
  it("h3 = 18/700/-0.18/23.4", () => {
    expect(typography.h3).toEqual({
      fontSize: 18,
      fontWeight: "700",
      letterSpacing: -0.18,
      lineHeight: 23.4,
    });
  });
  it("body = 14/500/21", () => {
    expect(typography.body).toEqual({
      fontSize: 14,
      fontWeight: "500",
      lineHeight: 21,
    });
  });
  it("sub = 13/500/18.85 + mutedForeground", () => {
    expect(typography.sub).toEqual({
      fontSize: 13,
      fontWeight: "500",
      lineHeight: 18.85,
      color: "#5F636C",
    });
  });
  it("caption = 11/600/0.44 + mutedForeground", () => {
    expect(typography.caption).toEqual({
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 0.44,
      color: "#5F636C",
    });
  });
});

describe("radius — globals.css 14px 파생", () => {
  it("sm~3xl 파생값", () => {
    expect(radius).toEqual({
      sm: 8.4, // 14 × 0.6
      md: 11.2, // 14 × 0.8
      lg: 14, // 14 × 1.0
      xl: 19.6, // 14 × 1.4
      "2xl": 25.2, // 14 × 1.8
      "3xl": 30.8, // 14 × 2.2
    });
  });
});

describe("motion — globals.css duration/easing", () => {
  it("duration 토큰", () => {
    expect(motion.duration).toEqual({ fast: 120, base: 200, slow: 320, stamp: 520 });
  });
  it("easing factory 가 함수를 반환", () => {
    expect(typeof motion.easeOutSoft).toBe("function");
    expect(typeof motion.easeInSoft).toBe("function");
  });
});

describe("spacing — 8px 그리드 scale", () => {
  it("xs~2xl 정규 scale", () => {
    expect(spacing).toEqual({ xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32 });
  });

  it("모든 값이 4px 하프스텝 그리드에 정렬되고 단조 증가", () => {
    const vals = Object.values(spacing);
    for (const v of vals) expect(v % 4).toBe(0);
    expect(vals).toEqual([...vals].sort((a, b) => a - b));
  });
});
