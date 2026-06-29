# RN 정산 디자인 시스템 정합 (SL0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** web 디자인 시스템(`globals.css`/`DESIGN.md`)을 RN(`apps/mobile`)으로 미러해서, 정산 화면 3종(C1·C2·C3)이 소비할 theme 토큰과 핵심 UI primitive를 갖춘다.

**Architecture:** RN `shared/theme/`에 web `globals.css`의 hex SoT를 그대로 옮긴 토큰 4종(colors·typography·radius·motion)을 만들고, `shared/ui/`에 web `components/ui/*` 모양을 미러한 RN primitive 6종(Button·Chip·Card·Stamp·EmptyState·ErrorState)을 만든다. 색은 OKLCH가 아니라 hex로 표현한다(RN은 OKLCH 미지원). 토큰 일치는 parity 테스트가, 컴포넌트는 렌더 스냅샷이 보장한다.

**Tech Stack:** Expo React Native · TypeScript · StyleSheet · jest-expo + @testing-library/react-native · `@withkey/domain`

**Spec:** [`docs/superpowers/specs/2026-06-29-rn-settlement-points-redemption-design.md`](../specs/2026-06-29-rn-settlement-points-redemption-design.md) §SL0

**Branch:** `feat/rn-settlement-sl0-design` (base: `develop`). 이 계획의 모든 커밋은 이 브랜치에서. 푸시·PR은 사용자 확인 후.

---

## 배경: 핵심 SoT 사실 (구현 전 필독)

코드를 쓰기 전에 아래를 사실로 받아들인다. 추정·눈대중 금지.

1. **web `globals.css`는 hex가 SoT다.** `apps/web/src/app/globals.css:61-62` 주석: "모킹업 v4 팔레트 — hex SoT … OKLCH 값은 hex의 sRGB→OkLab 정밀 변환." 즉 OKLCH는 web Tailwind용 파생값이고, **RN은 hex 원본을 그대로 옮기면 된다.**
2. **AA 보정된 토큰 3개만 hex 원본이 없다** — `muted`·`muted-foreground`·`brand-primary-deep`. 이들은 OKLCH가 SoT이므로 sRGB hex로 변환해야 한다(Task 1에서 처리, parity 테스트가 변환 일치를 강제).
3. **invite(정산 영수증) 팔레트는 `globals.css:127-138`에 hex로 직접 정의**되어 있다(`#faf6ef` 등). 그대로 옮긴다.
4. **RN은 OKLCH 색 문자열을 렌더하지 못한다.** 모든 색은 `#RRGGBB` 또는 `rgba(...)`로 표현한다.
5. **기존 `apps/mobile/src/shared/theme/colors.ts`(teal POC 팔레트)는 14개 키가 모두 기존 화면에서 사용 중**이다(`textStrong` 33회, `primary` 21회 등). 재작성 시 **레거시 키를 새 토큰으로 alias 보존**해야 기존 화면(`home.tsx`·`me.tsx`·`screen-states.tsx`·feed/challenge 컴포넌트)이 컴파일된다. **왜**: SL0 범위를 정산 디자인 토큰으로 외과적으로 유지하고, 기존 화면의 색 마이그레이션은 후속 슬라이스로 미룬다.
6. **`shared/ui/` 디렉토리는 아직 없다.** 신규 생성한다. 기존 공용 컴포넌트는 `shared/components/{screen-states,placeholder-screen}.tsx`에 있고 이번에 건드리지 않는다.

### web hex SoT 토큰 (globals.css → RN colors 매핑표)

| RN colors 키          | hex             | globals.css 출처                          |
| --------------------- | --------------- | ----------------------------------------- |
| `background`          | `#F7F8FB`       | `:69` 주석 `#F7F8FB`                      |
| `foreground`          | `#22262E`       | `:64` 주석 `#22262E`                      |
| `card`                | `#FFFFFF`       | `:65` `oklch(1 0 0)` = white              |
| `cardForeground`      | `#22262E`       | `:66`                                     |
| `primary`             | `#8AA4FF`       | `:69` 주석 `#8AA4FF`                      |
| `primaryForeground`   | `#FFFFFF`       | `:70` `oklch(1 0 0)`                      |
| `secondary`           | `#FFD46B`       | `:71` 주석 `#FFD46B`                      |
| `secondaryForeground` | `#22262E`       | `:72`                                     |
| `accent`              | `#BCA6FF`       | `:77` 주석 `#BCA6FF`                      |
| `accentForeground`    | `#22262E`       | `:78`                                     |
| `destructive`         | `#FF6B6B`       | `:79` 주석 `#FF6B6B`                      |
| `border`              | `#E8EBF0`       | `:80` 주석 `#E8EBF0`                      |
| `brandPink`           | `#FFB6C6`       | `:91` 주석 `#FFB6C6`                      |
| `brandWarn`           | `#FF8A4E`       | `:93` 주석 `#FF8A4E`                      |
| `brandSuccess`        | `#52C28C`       | `:94` 주석 `#52C28C`                      |
| `brandPrimarySoft`    | `#E8EDFF`       | `:95` 주석 `#E8EDFF`                      |
| `brandSecondarySoft`  | `#FFF5DA`       | `:96` 주석 `#FFF5DA`                      |
| `muted`               | `#EEF0F4` ※변환 | `:73` `oklch(0.955 0.005 264)`            |
| `mutedForeground`     | `#5F636C` ※변환 | `:76` `oklch(0.5 0.015 264)` (AA 보정)    |
| `brandPrimaryDeep`    | `#708EE2` ※변환 | `:97-99` `oklch(0.66 0.13 268)` (AA 보정) |

※변환 = OKLCH→sRGB hex. 아래 값은 수기 변환 결과이며 **Task 1의 parity 테스트(culori)가 정확값을 강제**한다. 테스트가 다른 값을 출력하면 colors.ts를 그 값으로 교정한다.

### invite 팔레트 (globals.css:127-138 → RN colors.invite)

`inviteBg #faf6ef` · `inviteInk #2a221c` · `inviteMuted #5e4838` · `inviteAccent #b07a4d` · `inviteGold #c9a878` · `inviteLine #e5d8c2` · `inviteTerra #c2683d` · `inviteSubtext #8e8579` · `inviteDashline #c9c0b0` · `inviteStamp #4a3f37`

### 레거시 alias 매핑 (기존 teal 키 → 새 토큰)

| 레거시 키                                      | 새 매핑 값                      |
| ---------------------------------------------- | ------------------------------- |
| `textStrong`                                   | `foreground` (`#22262E`)        |
| `text`                                         | `foreground` (`#22262E`)        |
| `textSubtle`                                   | `mutedForeground` (`#5F636C`)   |
| `textMuted`                                    | `mutedForeground` (`#5F636C`)   |
| `primarySoft`                                  | `brandPrimarySoft` (`#E8EDFF`)  |
| `success`                                      | `brandSuccess` (`#52C28C`)      |
| `warn`                                         | `brandWarn` (`#FF8A4E`)         |
| `danger`                                       | `destructive` (`#FF6B6B`)       |
| `inverse`                                      | `primaryForeground` (`#FFFFFF`) |
| `background`·`card`·`border`·`muted`·`primary` | 동명 새 토큰으로 값 갱신        |

---

## File Structure

신규 생성:

- `apps/mobile/src/shared/theme/colors.ts` — **재작성**. web 정합 시맨틱 토큰 + invite 팔레트 + 레거시 alias
- `apps/mobile/src/shared/theme/typography.ts` — `.t-*` → RN TextStyle
- `apps/mobile/src/shared/theme/radius.ts` — 14px 파생 sm~3xl
- `apps/mobile/src/shared/theme/motion.ts` — duration + easing
- `apps/mobile/src/shared/theme/index.ts` — barrel
- `apps/mobile/src/shared/theme/theme.spec.ts` — 토큰 parity 테스트
- `apps/mobile/src/shared/ui/button.tsx`
- `apps/mobile/src/shared/ui/chip.tsx`
- `apps/mobile/src/shared/ui/card.tsx`
- `apps/mobile/src/shared/ui/stamp.tsx`
- `apps/mobile/src/shared/ui/empty-state.tsx`
- `apps/mobile/src/shared/ui/error-state.tsx`
- `apps/mobile/src/shared/ui/index.ts` — barrel
- `apps/mobile/src/shared/ui/ui.spec.tsx` — 컴포넌트 렌더 스냅샷

devDependency 추가: `culori`(parity 테스트의 OKLCH→hex 변환용. 테스트 전용, 런타임 번들 미포함)

---

## Task 1: colors.ts — web hex SoT 미러 + 레거시 alias

**Files:**

- Modify(재작성): `apps/mobile/src/shared/theme/colors.ts`
- Create: `apps/mobile/src/shared/theme/theme.spec.ts`
- Modify: `apps/mobile/package.json` (devDependencies에 `culori`)

- [ ] **Step 1: culori 설치 (parity 테스트용 devDependency)**

Run: `pnpm --filter @withkey/mobile add -D culori`
Expected: `apps/mobile/package.json`의 devDependencies에 `culori` 추가, lockfile 갱신.

> 패키지명이 `@withkey/mobile`이 아니면 `apps/mobile/package.json`의 `name` 필드를 확인해 그 이름으로 `--filter` 한다.

- [ ] **Step 2: colors parity 실패 테스트 작성**

`apps/mobile/src/shared/theme/theme.spec.ts` 생성. 이 테스트는 (a) hex SoT 토큰이 globals.css 주석 hex와 일치, (b) OKLCH 변환 토큰이 globals.css OKLCH의 culori 변환과 일치(소수 반올림 허용), (c) 레거시 alias 존재를 검증한다.

```typescript
// apps/mobile/src/shared/theme/theme.spec.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { converter } from "culori";
import { colors } from "./colors";

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
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `pnpm --filter @withkey/mobile test -- theme.spec`
Expected: FAIL — colors.ts에 새 토큰이 없어 `colors.background` 등이 `undefined` 또는 teal 값.

- [ ] **Step 4: colors.ts 재작성**

```typescript
// apps/mobile/src/shared/theme/colors.ts
// web 디자인 시스템 정합 토큰 (SL0). SoT: apps/web/src/app/globals.css.
// globals.css 는 hex 가 SoT(:61-62) — 여기 값은 그 hex 를 그대로 옮긴 것이다.
// AA 보정된 muted/mutedForeground/brandPrimaryDeep 3개만 OKLCH(globals.css)를
// sRGB hex 로 변환한 값(theme.spec.ts 가 culori 로 일치 강제).
// 레거시 키(textStrong 등)는 기존 화면 비파괴용 alias — 후속 슬라이스에서 정리.
export const colors = {
  // 시맨틱 토큰 (globals.css hex SoT)
  background: "#F7F8FB",
  foreground: "#22262E",
  card: "#FFFFFF",
  cardForeground: "#22262E",
  primary: "#8AA4FF",
  primaryForeground: "#FFFFFF",
  secondary: "#FFD46B",
  secondaryForeground: "#22262E",
  accent: "#BCA6FF",
  accentForeground: "#22262E",
  destructive: "#FF6B6B",
  border: "#E8EBF0",
  // OKLCH SoT (AA 보정) → sRGB hex 변환
  muted: "#EEF0F4",
  mutedForeground: "#5F636C",
  // brand 계열
  brandPink: "#FFB6C6",
  brandWarn: "#FF8A4E",
  brandSuccess: "#52C28C",
  brandPrimarySoft: "#E8EDFF",
  brandSecondarySoft: "#FFF5DA",
  brandPrimaryDeep: "#708EE2",
  // 정산 영수증(invite) 팔레트 (globals.css:127-138, hex 직접 정의)
  invite: {
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
  },
  // --- 레거시 alias (기존 화면 호환, 후속 정리) ---
  textStrong: "#22262E", // = foreground
  text: "#22262E", // = foreground
  textSubtle: "#5F636C", // = mutedForeground
  textMuted: "#5F636C", // = mutedForeground
  primarySoft: "#E8EDFF", // = brandPrimarySoft
  success: "#52C28C", // = brandSuccess
  warn: "#FF8A4E", // = brandWarn
  danger: "#FF6B6B", // = destructive
  inverse: "#FFFFFF", // = primaryForeground
} as const;
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `pnpm --filter @withkey/mobile test -- theme.spec`
Expected: PASS. 만약 OKLCH 변환 테스트(b)가 실패하면, 실패 메시지의 `Expected`(culori 출력)값으로 `colors.ts`의 `muted`/`mutedForeground`/`brandPrimaryDeep`을 교정 후 재실행.

- [ ] **Step 6: 기존 화면 비파괴 확인 (typecheck)**

Run: `pnpm --filter @withkey/mobile exec tsc --noEmit`
Expected: PASS — 레거시 alias 덕에 `home.tsx`·`screen-states.tsx` 등의 `colors.textStrong` 등이 모두 유효.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/shared/theme/colors.ts apps/mobile/src/shared/theme/theme.spec.ts apps/mobile/package.json pnpm-lock.yaml
git commit -m "feat(mobile/theme): colors 토큰 web globals.css 정합 미러 + 레거시 alias"
```

---

## Task 2: typography.ts — `.t-*` → RN TextStyle

**Files:**

- Create: `apps/mobile/src/shared/theme/typography.ts`
- Modify: `apps/mobile/src/shared/theme/theme.spec.ts`

globals.css `.t-h1`~`.t-caption`(`:186-220`)을 RN TextStyle로 변환한다. RN은 `letterSpacing`·`lineHeight`가 절대 px이므로 web의 `em`·배수를 px로 환산한다: `letterSpacing = em × fontSize`, `lineHeight = ratio × fontSize`.

- [ ] **Step 1: typography 실패 테스트 추가**

`theme.spec.ts`에 아래 describe 블록을 추가한다.

```typescript
// theme.spec.ts 에 추가
import { typography } from "./typography";

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
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm --filter @withkey/mobile test -- theme.spec`
Expected: FAIL — `typography`를 import 못 함.

- [ ] **Step 3: typography.ts 작성**

```typescript
// apps/mobile/src/shared/theme/typography.ts
// web globals.css .t-* (:186-220) → RN TextStyle.
// letterSpacing = em × fontSize, lineHeight = ratio × fontSize (RN 은 절대 px).
import type { TextStyle } from "react-native";

import { colors } from "./colors";

export const typography = {
  h1: { fontSize: 28, fontWeight: "800", letterSpacing: -0.56, lineHeight: 33.6 },
  h2: { fontSize: 22, fontWeight: "700", letterSpacing: -0.22, lineHeight: 27.5 },
  h3: { fontSize: 18, fontWeight: "700", letterSpacing: -0.18, lineHeight: 23.4 },
  body: { fontSize: 14, fontWeight: "500", lineHeight: 21 },
  sub: { fontSize: 13, fontWeight: "500", lineHeight: 18.85, color: colors.mutedForeground },
  caption: { fontSize: 11, fontWeight: "600", letterSpacing: 0.44, color: colors.mutedForeground },
} satisfies Record<string, TextStyle>;
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm --filter @withkey/mobile test -- theme.spec`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/shared/theme/typography.ts apps/mobile/src/shared/theme/theme.spec.ts
git commit -m "feat(mobile/theme): typography 토큰 .t-* RN TextStyle 환산"
```

---

## Task 3: radius.ts — 14px 파생

**Files:**

- Create: `apps/mobile/src/shared/theme/radius.ts`
- Modify: `apps/mobile/src/shared/theme/theme.spec.ts`

globals.css `--radius: 0.875rem`(=14px)와 파생(`:52-57`). `sm 0.6 / md 0.8 / lg 1.0 / xl 1.4 / 2xl 1.8 / 3xl 2.2`.

- [ ] **Step 1: radius 실패 테스트 추가**

```typescript
// theme.spec.ts 에 추가
import { radius } from "./radius";

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
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm --filter @withkey/mobile test -- theme.spec`
Expected: FAIL — `radius` import 불가.

- [ ] **Step 3: radius.ts 작성**

```typescript
// apps/mobile/src/shared/theme/radius.ts
// web globals.css --radius(14px) 파생 (:52-57).
const BASE = 14;
export const radius = {
  sm: BASE * 0.6, // 8.4
  md: BASE * 0.8, // 11.2
  lg: BASE, // 14
  xl: BASE * 1.4, // 19.6
  "2xl": BASE * 1.8, // 25.2
  "3xl": BASE * 2.2, // 30.8
} as const;
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm --filter @withkey/mobile test -- theme.spec`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/shared/theme/radius.ts apps/mobile/src/shared/theme/theme.spec.ts
git commit -m "feat(mobile/theme): radius 토큰 14px 파생"
```

---

## Task 4: motion.ts — duration + easing

**Files:**

- Create: `apps/mobile/src/shared/theme/motion.ts`
- Modify: `apps/mobile/src/shared/theme/theme.spec.ts`

globals.css `--motion-*`(`:120-125`) duration + bezier easing. RN `Easing.bezier`로 표현. 정산 도장 회전은 **정적(생략)**이지만, motion 토큰은 후속 화면 전이용으로 둔다.

- [ ] **Step 1: motion 실패 테스트 추가**

```typescript
// theme.spec.ts 에 추가
import { motion } from "./motion";

describe("motion — globals.css duration/easing", () => {
  it("duration 토큰", () => {
    expect(motion.duration).toEqual({ fast: 120, base: 200, slow: 320, stamp: 520 });
  });
  it("easing factory 가 함수를 반환", () => {
    expect(typeof motion.easeOutSoft).toBe("function");
    expect(typeof motion.easeInSoft).toBe("function");
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm --filter @withkey/mobile test -- theme.spec`
Expected: FAIL — `motion` import 불가.

- [ ] **Step 3: motion.ts 작성**

```typescript
// apps/mobile/src/shared/theme/motion.ts
// web globals.css --motion-* (:120-125). RN Easing.bezier 로 cubic-bezier 미러.
// 정산 도장 회전 애니메이션은 SL0 범위에서 정적 처리(생략) — duration 토큰은 화면 전이용 보존.
import { Easing } from "react-native";

export const motion = {
  duration: { fast: 120, base: 200, slow: 320, stamp: 520 },
  // --ease-out-soft: cubic-bezier(0.2, 0.8, 0.2, 1)
  easeOutSoft: Easing.bezier(0.2, 0.8, 0.2, 1),
  // --ease-in-soft: cubic-bezier(0.8, 0.2, 1, 0.6)
  easeInSoft: Easing.bezier(0.8, 0.2, 1, 0.6),
} as const;
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm --filter @withkey/mobile test -- theme.spec`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/shared/theme/motion.ts apps/mobile/src/shared/theme/theme.spec.ts
git commit -m "feat(mobile/theme): motion duration/easing 토큰"
```

---

## Task 5: theme barrel

**Files:**

- Create: `apps/mobile/src/shared/theme/index.ts`

기존 import는 `@/shared/theme/colors`를 직접 참조하므로(예: `screen-states.tsx:5`), 기존 경로를 깨지 않으면서 barrel을 추가한다. barrel은 새 화면이 `@/shared/theme`로 일괄 import하게 한다.

- [ ] **Step 1: barrel 작성**

```typescript
// apps/mobile/src/shared/theme/index.ts
export { colors } from "./colors";
export { typography } from "./typography";
export { radius } from "./radius";
export { motion } from "./motion";
```

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @withkey/mobile exec tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/shared/theme/index.ts
git commit -m "feat(mobile/theme): theme barrel export"
```

---

## Task 6: Button primitive

**Files:**

- Create: `apps/mobile/src/shared/ui/button.tsx`
- Create: `apps/mobile/src/shared/ui/ui.spec.tsx`

web `components/ui/button.tsx` 미러. variant 5개(default·outline·secondary·ghost·destructive), size 3개(default·sm·lg). 터치 타깃 ≥44px(접근성). web의 `link` variant·icon size는 정산 도메인 미사용이므로 YAGNI 제외.

- [ ] **Step 1: Button 실패 테스트 작성 (ui.spec.tsx)**

```tsx
// apps/mobile/src/shared/ui/ui.spec.tsx
import { render, screen, fireEvent } from "@testing-library/react-native";
import { Button } from "./button";

describe("Button", () => {
  it("label 렌더 + onPress 호출", () => {
    const onPress = jest.fn();
    render(<Button onPress={onPress}>확인</Button>);
    const node = screen.getByText("확인");
    expect(node).toBeTruthy();
    fireEvent.press(node);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("disabled 면 onPress 미호출", () => {
    const onPress = jest.fn();
    render(
      <Button onPress={onPress} disabled>
        확인
      </Button>,
    );
    fireEvent.press(screen.getByText("확인"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("접근성 role=button + 터치 타깃 ≥44px", () => {
    render(<Button onPress={() => {}}>확인</Button>);
    const btn = screen.getByRole("button");
    // Pressable 의 style 은 ({pressed}) => [...] 함수이므로 평가 후 flatten 한다.
    const styleProp = btn.props.style;
    const resolved = typeof styleProp === "function" ? styleProp({ pressed: false }) : styleProp;
    const flat = require("react-native").StyleSheet.flatten(resolved);
    expect(flat.minHeight).toBeGreaterThanOrEqual(44);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm --filter @withkey/mobile test -- ui.spec`
Expected: FAIL — `./button` 없음.

- [ ] **Step 3: button.tsx 작성**

```tsx
// apps/mobile/src/shared/ui/button.tsx
// web components/ui/button.tsx 미러. variant 5 + size 3. 터치 타깃 ≥44px(RN 접근성).
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { colors } from "@/shared/theme/colors";
import { radius } from "@/shared/theme/radius";

export type ButtonVariant = "default" | "outline" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "default" | "sm" | "lg";

interface ButtonProps {
  children: ReactNode;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

// destructive 배경 = web bg-destructive/10 (10% alpha)
const DESTRUCTIVE_SOFT = "rgba(255,107,107,0.1)";

const VARIANT = {
  default: { bg: colors.primary, fg: colors.primaryForeground, border: "transparent" },
  outline: { bg: colors.background, fg: colors.foreground, border: colors.border },
  secondary: { bg: colors.secondary, fg: colors.secondaryForeground, border: "transparent" },
  ghost: { bg: "transparent", fg: colors.foreground, border: "transparent" },
  destructive: { bg: DESTRUCTIVE_SOFT, fg: colors.destructive, border: "transparent" },
} as const;

const SIZE = {
  default: { minHeight: 44, paddingHorizontal: 16, fontSize: 14 },
  sm: { minHeight: 44, paddingHorizontal: 12, fontSize: 13 },
  lg: { minHeight: 52, paddingHorizontal: 20, fontSize: 16 },
} as const;

export function Button({
  children,
  onPress,
  variant = "default",
  size = "default",
  disabled = false,
  style,
}: ButtonProps) {
  const v = VARIANT[variant];
  const s = SIZE[size];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: s.minHeight,
          paddingHorizontal: s.paddingHorizontal,
          backgroundColor: v.bg,
          borderColor: v.border,
        },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, { color: v.fg, fontSize: s.fontSize }]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  label: { fontWeight: "600" },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm --filter @withkey/mobile test -- ui.spec`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/shared/ui/button.tsx apps/mobile/src/shared/ui/ui.spec.tsx
git commit -m "feat(mobile/ui): Button primitive (variant 5 · size 3 · 터치 ≥44px)"
```

---

## Task 7: Chip primitive

**Files:**

- Create: `apps/mobile/src/shared/ui/chip.tsx`
- Modify: `apps/mobile/src/shared/ui/ui.spec.tsx`

web `components/ui/chip.tsx` 미러. tone 5개. web `bg-brand-success/15`·`bg-destructive/12`는 alpha이므로 rgba로.

- [ ] **Step 1: Chip 실패 테스트 추가**

```tsx
// ui.spec.tsx 에 추가
import { Chip } from "./chip";

describe("Chip", () => {
  it("label 렌더", () => {
    render(<Chip tone="primary">진행 중</Chip>);
    expect(screen.getByText("진행 중")).toBeTruthy();
  });
  it("tone=danger 텍스트색 = destructive", () => {
    render(<Chip tone="danger">미달</Chip>);
    const flat = require("react-native").StyleSheet.flatten(screen.getByText("미달").props.style);
    expect(flat.color).toBe("#FF6B6B");
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm --filter @withkey/mobile test -- ui.spec`
Expected: FAIL — `./chip` 없음.

- [ ] **Step 3: chip.tsx 작성**

```tsx
// apps/mobile/src/shared/ui/chip.tsx
// web components/ui/chip.tsx 미러. tone 5. /15·/12 alpha 는 rgba 로.
import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors } from "@/shared/theme/colors";

export type ChipTone = "neutral" | "primary" | "secondary" | "success" | "danger";

interface ChipProps {
  children: ReactNode;
  tone?: ChipTone;
  style?: StyleProp<ViewStyle>;
}

const TONE = {
  neutral: { bg: colors.muted, fg: colors.mutedForeground },
  primary: { bg: colors.brandPrimarySoft, fg: colors.primary },
  secondary: { bg: colors.brandSecondarySoft, fg: colors.foreground },
  success: { bg: "rgba(82,194,140,0.15)", fg: colors.brandSuccess }, // #52C28C/15
  danger: { bg: "rgba(255,107,107,0.12)", fg: colors.destructive }, // #FF6B6B/12
} as const;

export function Chip({ children, tone = "neutral", style }: ChipProps) {
  const t = TONE[tone];
  return (
    <View style={[styles.base, { backgroundColor: t.bg }, style]}>
      <Text style={[styles.label, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  label: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5 },
});
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm --filter @withkey/mobile test -- ui.spec`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/shared/ui/chip.tsx apps/mobile/src/shared/ui/ui.spec.tsx
git commit -m "feat(mobile/ui): Chip primitive (tone 5)"
```

---

## Task 8: Card primitive

**Files:**

- Create: `apps/mobile/src/shared/ui/card.tsx`
- Modify: `apps/mobile/src/shared/ui/ui.spec.tsx`

web `components/ui/card.tsx` 미러. padding(none/sm/md/lg) + tone(default/muted/primary). web `rounded-[14px]`, `shadow-[0_1px_2px_rgba(20,24,36,0.04)]`을 RN shadow로.

- [ ] **Step 1: Card 실패 테스트 추가**

```tsx
// ui.spec.tsx 에 추가
import { Card } from "./card";
import { Text } from "react-native";

describe("Card", () => {
  it("자식 렌더 + borderRadius 14", () => {
    render(
      <Card>
        <Text>내용</Text>
      </Card>,
    );
    expect(screen.getByText("내용")).toBeTruthy();
  });
  it("tone=primary 배경 = primary", () => {
    render(
      <Card tone="primary" testID="c">
        <Text>x</Text>
      </Card>,
    );
    const flat = require("react-native").StyleSheet.flatten(screen.getByTestId("c").props.style);
    expect(flat.backgroundColor).toBe("#8AA4FF");
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm --filter @withkey/mobile test -- ui.spec`
Expected: FAIL — `./card` 없음.

- [ ] **Step 3: card.tsx 작성**

```tsx
// apps/mobile/src/shared/ui/card.tsx
// web components/ui/card.tsx 미러. padding 4 + tone 3.
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { colors } from "@/shared/theme/colors";
import { radius } from "@/shared/theme/radius";

export type CardPadding = "none" | "sm" | "md" | "lg";
export type CardTone = "default" | "muted" | "primary";

interface CardProps {
  children: ReactNode;
  padding?: CardPadding;
  tone?: CardTone;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const PADDING = { none: 0, sm: 10, md: 14, lg: 20 } as const; // web p-2.5/3.5/5

export function Card({ children, padding = "md", tone = "default", style, testID }: CardProps) {
  const toneStyle =
    tone === "primary"
      ? { backgroundColor: colors.primary, borderColor: "transparent" }
      : tone === "muted"
        ? { backgroundColor: colors.muted, borderColor: "transparent" }
        : { backgroundColor: colors.card, borderColor: colors.border };
  return (
    <View
      testID={testID}
      style={[
        styles.base,
        tone === "default" && styles.shadow,
        { padding: PADDING[padding] },
        toneStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg, // 14
    borderWidth: 1,
  },
  // web shadow-[0_1px_2px_rgba(20,24,36,0.04)]
  shadow: {
    elevation: 1,
    shadowColor: "#141824",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
});
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm --filter @withkey/mobile test -- ui.spec`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/shared/ui/card.tsx apps/mobile/src/shared/ui/ui.spec.tsx
git commit -m "feat(mobile/ui): Card primitive (padding 4 · tone 3)"
```

---

## Task 9: Stamp primitive (정적)

**Files:**

- Create: `apps/mobile/src/shared/ui/stamp.tsx`
- Modify: `apps/mobile/src/shared/ui/ui.spec.tsx`

web `components/ui/stamp.tsx` 미러. **회전 애니메이션 생략(정적)** — 스펙 §SL0 "Stamp(정산 도장 — 정적/단순화, 회전 애니메이션 생략)". variant `label`(단어) / `wordmark`(from·with 2줄 + 이중 링). tone 4개. size 80px(web `size-20`), border 3px. `color` prop으로 invite 영수증의 커스텀 색(`#4a3f37`)을 주입 가능하게 한다(web은 className override).

- [ ] **Step 1: Stamp 실패 테스트 추가**

```tsx
// ui.spec.tsx 에 추가
import { Stamp } from "./stamp";

describe("Stamp (정적)", () => {
  it("variant=label 텍스트 렌더 + role=image", () => {
    render(<Stamp variant="label" label="달성" tone="success" />);
    expect(screen.getByText("달성")).toBeTruthy();
    expect(screen.getByLabelText("달성")).toBeTruthy();
  });
  it("variant=wordmark 는 from·with 락업 + 기본 aria-label", () => {
    render(<Stamp variant="wordmark" />);
    expect(screen.getByText("from")).toBeTruthy();
    expect(screen.getByText("with")).toBeTruthy();
    expect(screen.getByLabelText("from·with")).toBeTruthy();
  });
  it("color prop 으로 테두리·글자색 override", () => {
    render(<Stamp variant="wordmark" color="#4a3f37" />);
    const flat = require("react-native").StyleSheet.flatten(
      screen.getByLabelText("from·with").props.style,
    );
    expect(flat.borderColor).toBe("#4a3f37");
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm --filter @withkey/mobile test -- ui.spec`
Expected: FAIL — `./stamp` 없음.

- [ ] **Step 3: stamp.tsx 작성**

```tsx
// apps/mobile/src/shared/ui/stamp.tsx
// web components/ui/stamp.tsx 미러 — 단, 회전 애니메이션 생략(정적). 스펙 §SL0.
// tone 4 또는 color prop 직접 주입(영수증 invite-stamp #4a3f37 용).
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/shared/theme/colors";

export type StampTone = "primary" | "success" | "danger" | "onPrimary";
export type StampVariant = "label" | "wordmark";

interface StampProps {
  variant?: StampVariant;
  label?: string;
  tone?: StampTone;
  /** 직접 색 주입(예: 영수증 invite-stamp). 지정 시 tone 무시. */
  color?: string;
}

const TONE: Record<StampTone, string> = {
  primary: colors.primary,
  success: colors.brandSuccess,
  danger: colors.destructive,
  onPrimary: colors.primaryForeground,
};

export function Stamp({ variant = "label", label, tone = "primary", color }: StampProps) {
  const ink = color ?? TONE[tone];
  const accessibilityLabel = variant === "wordmark" ? (label ?? "from·with") : (label ?? "");
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[styles.base, { borderColor: ink }]}
    >
      {variant === "wordmark" ? (
        <>
          <View pointerEvents="none" style={[styles.innerRing, { borderColor: ink }]} />
          <Text style={[styles.from, { color: ink }]}>from</Text>
          <View style={[styles.divider, { backgroundColor: ink }]} />
          <Text style={[styles.with, { color: ink }]}>with</Text>
        </>
      ) : (
        <Text style={[styles.labelText, { color: ink }]}>{label}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: 9999,
    borderWidth: 3,
    height: 80,
    justifyContent: "center",
    width: 80,
  },
  innerRing: {
    borderRadius: 9999,
    borderWidth: 1,
    bottom: 2,
    left: 2,
    opacity: 0.45,
    position: "absolute",
    right: 2,
    top: 2,
  },
  from: { fontSize: 8, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
  divider: { borderRadius: 9999, height: 2, marginVertical: 1, width: 24 },
  with: { fontSize: 11, fontWeight: "900", letterSpacing: -0.1, textTransform: "uppercase" },
  labelText: { fontSize: 13, fontWeight: "700", paddingHorizontal: 8, textAlign: "center" },
});
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm --filter @withkey/mobile test -- ui.spec`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/shared/ui/stamp.tsx apps/mobile/src/shared/ui/ui.spec.tsx
git commit -m "feat(mobile/ui): Stamp primitive (정적 · label/wordmark · color 주입)"
```

---

## Task 10: EmptyState primitive

**Files:**

- Create: `apps/mobile/src/shared/ui/empty-state.tsx`
- Modify: `apps/mobile/src/shared/ui/ui.spec.tsx`

web `components/ui/empty-state.tsx` 미러. web은 `icon: ComponentType`(lucide)지만 RN은 아이콘 라이브러리 의존을 피하기 위해 `icon?: ReactNode`(이미 렌더된 노드, optional)로 받는다. title은 `typography.h3`, description은 `typography.sub`, action은 자유 노드.

- [ ] **Step 1: EmptyState 실패 테스트 추가**

```tsx
// ui.spec.tsx 에 추가
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("title·description·action 렌더", () => {
    render(
      <EmptyState
        title="아직 없어요"
        description="첫 항목을 올려보세요"
        action={<Button onPress={() => {}}>시작</Button>}
      />,
    );
    expect(screen.getByText("아직 없어요")).toBeTruthy();
    expect(screen.getByText("첫 항목을 올려보세요")).toBeTruthy();
    expect(screen.getByText("시작")).toBeTruthy();
  });
  it("description·action 없이도 렌더", () => {
    render(<EmptyState title="비어 있어요" />);
    expect(screen.getByText("비어 있어요")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm --filter @withkey/mobile test -- ui.spec`
Expected: FAIL — `./empty-state` 없음.

- [ ] **Step 3: empty-state.tsx 작성**

```tsx
// apps/mobile/src/shared/ui/empty-state.tsx
// web components/ui/empty-state.tsx 미러. icon 은 RN 의존 회피 위해 optional ReactNode.
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { typography } from "@/shared/theme/typography";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      {icon}
      <Text style={typography.h3}>{title}</Text>
      {description ? <Text style={[typography.sub, styles.desc]}>{description}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 12, justifyContent: "center", paddingVertical: 48 },
  desc: { maxWidth: 280, textAlign: "center" },
  action: { marginTop: 8 },
});
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm --filter @withkey/mobile test -- ui.spec`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/shared/ui/empty-state.tsx apps/mobile/src/shared/ui/ui.spec.tsx
git commit -m "feat(mobile/ui): EmptyState primitive"
```

---

## Task 11: ErrorState primitive

**Files:**

- Create: `apps/mobile/src/shared/ui/error-state.tsx`
- Modify: `apps/mobile/src/shared/ui/ui.spec.tsx`

web `components/ui/error-state.tsx` 미러. 기본 문구(title "문제가 발생했어요" / description "잠시 후 다시 시도해 주세요" / retryLabel "다시 시도"), `onRetry` 있을 때만 재시도 버튼(`Button variant="ghost"`). 기존 `shared/components/screen-states.tsx`의 `ReadErrorScreen`과는 별개(그건 후속에 이 primitive로 대체 가능, SL0 범위 외).

- [ ] **Step 1: ErrorState 실패 테스트 추가**

```tsx
// ui.spec.tsx 에 추가
import { ErrorState } from "./error-state";

describe("ErrorState", () => {
  it("기본 문구 + onRetry 버튼 호출", () => {
    const onRetry = jest.fn();
    render(<ErrorState onRetry={onRetry} />);
    expect(screen.getByText("문제가 발생했어요")).toBeTruthy();
    expect(screen.getByText("잠시 후 다시 시도해 주세요")).toBeTruthy();
    fireEvent.press(screen.getByText("다시 시도"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
  it("onRetry 없으면 버튼 없음", () => {
    render(<ErrorState />);
    expect(screen.queryByText("다시 시도")).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm --filter @withkey/mobile test -- ui.spec`
Expected: FAIL — `./error-state` 없음.

- [ ] **Step 3: error-state.tsx 작성**

```tsx
// apps/mobile/src/shared/ui/error-state.tsx
// web components/ui/error-state.tsx 미러. 기본 문구 + 선택 재시도 버튼.
import { StyleSheet, Text, View } from "react-native";

import { typography } from "@/shared/theme/typography";

import { Button } from "./button";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({
  title = "문제가 발생했어요",
  description = "잠시 후 다시 시도해 주세요",
  onRetry,
  retryLabel = "다시 시도",
}: ErrorStateProps) {
  return (
    <View style={styles.wrap}>
      <Text style={typography.h3}>{title}</Text>
      <Text style={[typography.sub, styles.desc]}>{description}</Text>
      {onRetry ? (
        <Button variant="ghost" size="sm" onPress={onRetry} style={styles.btn}>
          {retryLabel}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 12, justifyContent: "center", paddingVertical: 48 },
  desc: { maxWidth: 280, textAlign: "center" },
  btn: { marginTop: 8 },
});
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm --filter @withkey/mobile test -- ui.spec`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/shared/ui/error-state.tsx apps/mobile/src/shared/ui/ui.spec.tsx
git commit -m "feat(mobile/ui): ErrorState primitive (web 기본 문구 미러)"
```

---

## Task 12: ui barrel + 전체 검증

**Files:**

- Create: `apps/mobile/src/shared/ui/index.ts`

- [ ] **Step 1: ui barrel 작성**

```typescript
// apps/mobile/src/shared/ui/index.ts
export { Button, type ButtonVariant, type ButtonSize } from "./button";
export { Chip, type ChipTone } from "./chip";
export { Card, type CardPadding, type CardTone } from "./card";
export { Stamp, type StampTone, type StampVariant } from "./stamp";
export { EmptyState } from "./empty-state";
export { ErrorState } from "./error-state";
```

- [ ] **Step 2: 전체 게이트 — typecheck + lint + test**

Run: `pnpm --filter @withkey/mobile exec tsc --noEmit`
Expected: PASS

Run: `pnpm --filter @withkey/mobile lint`
Expected: PASS (ESLint 위반 0)

Run: `pnpm --filter @withkey/mobile test`
Expected: PASS — theme.spec(parity 전부) + ui.spec(6 컴포넌트) + 기존 테스트(recap-reads·feed-card·bff-client 등) 모두 green

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/shared/ui/index.ts
git commit -m "feat(mobile/ui): ui barrel + SL0 디자인 시스템 정합 완료"
```

---

## 완료 기준 (Definition of Done)

- [ ] `shared/theme/{colors,typography,radius,motion}.ts` + barrel 존재, parity 테스트 green
- [ ] colors의 hex SoT 토큰이 globals.css와 일치, OKLCH 3종이 culori 변환과 일치, invite 팔레트 일치, 레거시 alias 보존
- [ ] `shared/ui/{button,chip,card,stamp,empty-state,error-state}.tsx` + barrel 존재, 렌더 스냅샷 green
- [ ] Stamp는 정적(회전 애니메이션 없음)
- [ ] `pnpm --filter @withkey/mobile {typecheck,lint,test}` 모두 PASS (기존 화면 비파괴)
- [ ] 푸시·PR은 사용자 확인 후 (브랜치 `feat/rn-settlement-sl0-design`)

## 후속 (이 계획 범위 밖)

- 기존 화면(`home`·`me`·feed·challenge)의 레거시 alias → 시맨틱 토큰 마이그레이션 + alias 제거
- C1 recap이 이 primitive를 실제 소비(다음 계획 `2026-06-29-rn-settlement-c1-recap.md`)
- KeywordDonut·ShareCard·streak 팔레트 등 정산 도메인 밖 토큰/컴포넌트 (YAGNI 제외)
