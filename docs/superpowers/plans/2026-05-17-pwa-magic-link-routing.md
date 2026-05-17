---
plan: 2026-05-17-pwa-magic-link-routing
title: PWA 설치 유도 + 매직링크 standalone 분기 구현 계획
author: pistachio8
date: 2026-05-17
status: draft
spec: docs/superpowers/specs/2026-05-17-pwa-magic-link-routing.md
---

# PWA 설치 유도 + 매직링크 standalone 분기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/home` 진입 시 PWA 설치 상태(`display-mode: standalone` + `pwa.everInstalled` localStorage 플래그)를 클라이언트에서 감지해, 미설치 사용자에게는 부드러운 설치 배너를, 설치는 했으나 이번 진입이 브라우저인 사용자에게는 "앱으로 열기" 강제 모달을 보여준다. manifest 에 `launch_handler` · `capture_links` 를 추가해 Android Chrome 에서는 매직링크가 자동으로 PWA로 캡처되도록 한다.

**Architecture:** 인증 경로(`src/app/auth/callback/route.ts` · `src/lib/supabase/middleware.ts`) 는 변경하지 않는다. PWA 판단은 `/home` 라우트에 마운트되는 `<PwaGate />` 클라이언트 컴포넌트에서만 일어나고, 거기서 단일 훅(`useDisplayMode`) 을 통해 두 분기 컴포넌트(`<InstallBanner />` · `<OpenInAppModal />`) 중 하나를 렌더한다. dismiss 정책 3종(`everInstalled` 영구 / banner 7일 / modal 세션) 은 각자 다른 storage 키로 격리한다.

**Tech Stack:** Next.js 16 (App Router · React 19) · TypeScript · vitest + jsdom + @testing-library/react · shadcn (base-ui) Dialog primitive · localStorage / sessionStorage / matchMedia / `beforeinstallprompt` Web API.

---

## 영향 범위

- **변경 경로 (신규)**: `src/components/pwa/use-display-mode.ts`, `src/components/pwa/use-display-mode.spec.ts`, `src/components/pwa/install-banner.tsx`, `src/components/pwa/install-banner.spec.tsx`, `src/components/pwa/open-in-app-modal.tsx`, `src/components/pwa/open-in-app-modal.spec.tsx`, `src/app/(app)/home/_components/pwa-gate.tsx`, `src/app/(app)/home/_components/pwa-gate.spec.tsx`, `src/components/pwa-register.spec.tsx`
- **변경 경로 (수정)**: `public/manifest.json`, `src/components/pwa-register.tsx`, `src/app/(app)/home/page.tsx`
- **데이터/RLS 영향**: 없음
- **외부 서비스**: 없음 (모두 정적 자산 · 브라우저 API)
- **재사용 후보**: `src/components/ui/dialog.tsx` (shadcn Dialog primitive), `src/components/ui/button.tsx`, `src/lib/utils.ts` (`cn`)

---

## File Structure

| 파일                                          | 책임                                                                                                                               | 의존성                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `src/components/pwa/use-display-mode.ts`      | `display-mode: standalone` + `navigator.standalone` 평가, `pwa.everInstalled` localStorage 플래그 read/set, matchMedia change 구독 | `react`, Web API                                        |
| `src/components/pwa/install-banner.tsx`       | iOS 가이드 텍스트 / Android `beforeinstallprompt` 트리거. dismiss 시 7일 숨김 (`pwa.banner.dismissedUntil`)                        | `useDisplayMode` (간접), `Button`, `cn`, `lucide-react` |
| `src/components/pwa/open-in-app-modal.tsx`    | 백드롭 dim · non-click. "앱으로 열기" / "웹으로 계속". 세션 dismiss (`pwa.modal.thisSession`)                                      | shadcn `Dialog`, `Button`                               |
| `src/app/(app)/home/_components/pwa-gate.tsx` | mode + everInstalled 조합으로 위 둘 중 하나(또는 null) 렌더. /home 외에서는 사용 안 함                                             | `useDisplayMode`, `InstallBanner`, `OpenInAppModal`     |
| `public/manifest.json`                        | `launch_handler` · `capture_links` 추가 (Android 자동 캡처)                                                                        | —                                                       |
| `src/components/pwa-register.tsx`             | SW 등록 직후 standalone 이면 `pwa.everInstalled = 1` set (결정적 시그널 확보)                                                      | 기존 + Web API                                          |
| `src/app/(app)/home/page.tsx`                 | `<PwaGate />` 한 줄 마운트                                                                                                         | `PwaGate`                                               |

---

## 작업 단계

### Task 1: useDisplayMode 훅 (TDD)

display-mode 감지 + everInstalled 영구 플래그 관리. 모든 후속 컴포넌트의 단일 시그널 소스.

**Files:**

- Create: `src/components/pwa/use-display-mode.ts`
- Test: `src/components/pwa/use-display-mode.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/pwa/use-display-mode.spec.ts
// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDisplayMode } from "./use-display-mode";

describe("useDisplayMode", () => {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  let mediaState = { matches: false };

  beforeEach(() => {
    listeners.clear();
    mediaState = { matches: false };
    const matchMediaMock = vi.fn().mockImplementation(() => ({
      get matches() {
        return mediaState.matches;
      },
      addEventListener: (_e: string, cb: (e: MediaQueryListEvent) => void) => {
        listeners.add(cb);
      },
      removeEventListener: (_e: string, cb: (e: MediaQueryListEvent) => void) => {
        listeners.delete(cb);
      },
    }));
    Object.defineProperty(window, "matchMedia", { configurable: true, value: matchMediaMock });
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("브라우저 모드면 mode='browser', everInstalled=false (플래그 없음)", () => {
    mediaState.matches = false;
    const { result } = renderHook(() => useDisplayMode());
    expect(result.current.mode).toBe("browser");
    expect(result.current.everInstalled).toBe(false);
  });

  it("standalone 모드면 mode='standalone' 이고 pwa.everInstalled=1 을 set 한다", () => {
    mediaState.matches = true;
    const { result } = renderHook(() => useDisplayMode());
    expect(result.current.mode).toBe("standalone");
    expect(result.current.everInstalled).toBe(true);
    expect(window.localStorage.getItem("pwa.everInstalled")).toBe("1");
  });

  it("이전에 standalone 진입 기록(localStorage)이 있으면 브라우저 모드에서도 everInstalled=true", () => {
    window.localStorage.setItem("pwa.everInstalled", "1");
    mediaState.matches = false;
    const { result } = renderHook(() => useDisplayMode());
    expect(result.current.mode).toBe("browser");
    expect(result.current.everInstalled).toBe(true);
  });

  it("matchMedia change 이벤트로 mode 가 갱신된다", () => {
    mediaState.matches = false;
    const { result } = renderHook(() => useDisplayMode());
    expect(result.current.mode).toBe("browser");
    act(() => {
      mediaState.matches = true;
      listeners.forEach((cb) => cb({ matches: true } as MediaQueryListEvent));
    });
    expect(result.current.mode).toBe("standalone");
    expect(window.localStorage.getItem("pwa.everInstalled")).toBe("1");
  });

  it("iOS Safari fallback: navigator.standalone === true 이면 standalone 으로 본다", () => {
    mediaState.matches = false;
    Object.defineProperty(window.navigator, "standalone", { configurable: true, value: true });
    const { result } = renderHook(() => useDisplayMode());
    expect(result.current.mode).toBe("standalone");
    Object.defineProperty(window.navigator, "standalone", { configurable: true, value: undefined });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/components/pwa/use-display-mode.spec.ts
```

Expected: FAIL — `Cannot find module './use-display-mode'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/pwa/use-display-mode.ts
"use client";

import { useEffect, useState } from "react";

export type DisplayMode = "standalone" | "browser";

export interface DisplayModeState {
  mode: DisplayMode | null;
  everInstalled: boolean;
}

const STORAGE_KEY = "pwa.everInstalled";

function evaluateStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mql = window.matchMedia?.("(display-mode: standalone)");
  if (mql?.matches) return true;
  // iOS Safari: 비표준 legacy 플래그.
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function readEverInstalled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeEverInstalled(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* localStorage 차단 — silent. */
  }
}

export function useDisplayMode(): DisplayModeState {
  const [mode, setMode] = useState<DisplayMode | null>(null);
  const [everInstalled, setEverInstalled] = useState<boolean>(false);

  useEffect(() => {
    const isStandalone = evaluateStandalone();
    setMode(isStandalone ? "standalone" : "browser");
    if (isStandalone) {
      writeEverInstalled();
      setEverInstalled(true);
    } else {
      setEverInstalled(readEverInstalled());
    }

    const mql = window.matchMedia?.("(display-mode: standalone)");
    if (!mql) return;
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setMode("standalone");
        writeEverInstalled();
        setEverInstalled(true);
      } else {
        setMode("browser");
      }
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return { mode, everInstalled };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run src/components/pwa/use-display-mode.spec.ts
```

Expected: 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/pwa/use-display-mode.ts src/components/pwa/use-display-mode.spec.ts
git commit -m "feat(pwa): useDisplayMode 훅 — standalone 감지 + everInstalled 플래그"
```

---

### Task 2: PwaRegister 가 standalone 진입 시 everInstalled 결정적 set

`PwaRegister` 는 root layout 에 항상 마운트되므로 standalone 진입 첫 순간을 가장 빨리 잡는 지점. `useDisplayMode` 도 같은 일을 하지만 /home 도착 전 다른 라우트(예: /login 직후 redirect) 에서 standalone 진입한 적이 있다면 그 시점에 기록해 둬야 /home 의 게이트가 정확히 동작한다.

**Files:**

- Modify: `src/components/pwa-register.tsx`
- Create test: `src/components/pwa-register.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/pwa-register.spec.tsx
// @vitest-environment jsdom
import { render, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PwaRegister } from "./pwa-register";

describe("PwaRegister", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window.navigator, "serviceWorker", {
      configurable: true,
      value: { register: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("standalone 모드에서 마운트되면 pwa.everInstalled=1 을 set 한다", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    render(<PwaRegister />);
    expect(window.localStorage.getItem("pwa.everInstalled")).toBe("1");
  });

  it("브라우저 모드에서 마운트되면 플래그는 set 되지 않는다", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    render(<PwaRegister />);
    expect(window.localStorage.getItem("pwa.everInstalled")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/components/pwa-register.spec.tsx
```

Expected: FAIL — 첫 테스트에서 `pwa.everInstalled` 가 여전히 null.

- [ ] **Step 3: Modify implementation**

```tsx
// src/components/pwa-register.tsx
"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // standalone 으로 마운트됐다는 건 이미 설치돼 있다는 결정적 증거 — 영구 플래그를 기록한다.
    // 같은 origin 의 브라우저 컨텍스트와 localStorage 가 공유되므로, 이후 브라우저로 들어왔을 때
    // /home 의 PwaGate 가 "이 사용자는 깐 적이 있음" 으로 판정할 수 있다.
    try {
      const isStandalone =
        window.matchMedia?.("(display-mode: standalone)")?.matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (isStandalone) {
        window.localStorage.setItem("pwa.everInstalled", "1");
      }
    } catch {
      /* localStorage 차단 — useDisplayMode 가 다음 기회에 재시도. */
    }

    if (!("serviceWorker" in navigator)) return;
    const register = async () => {
      try {
        await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[pwa] SW register failed", error);
        }
      }
    };
    void register();
  }, []);
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run src/components/pwa-register.spec.tsx
```

Expected: 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/pwa-register.tsx src/components/pwa-register.spec.tsx
git commit -m "feat(pwa): PwaRegister 가 standalone 진입 시 everInstalled 플래그 set"
```

---

### Task 3: manifest 에 launch_handler 추가

Android Chrome 에서 매직링크가 설치된 PWA로 전달되었을 때, 이미 열려 있던 PWA 윈도우가 새 URL(`/auth/callback?code=...`) 로 navigate 하도록 한다. **`focus-existing` 이 아니라 `navigate-existing`** — 전자는 navigate 하지 않아 Supabase 코드 교환이 일어나지 않는다. `capture_links` 키는 W3C 표준에서 빠졌고 비표준 값만 존재했으므로 **추가하지 않는다** (Android 의 외부 링크 캡처는 launch_handler + OS 휴리스틱이 처리). iOS Safari 는 launch_handler 를 무시 — 회귀 없음.

**Files:**

- Modify: `public/manifest.json`

- [ ] **Step 1: 현재 manifest 확인**

```bash
cat public/manifest.json
```

기존 키(`name`, `short_name`, `start_url`, `scope`, `display`, `background_color`, `theme_color`, `icons`) 를 보존해야 한다.

- [ ] **Step 2: launch_handler 추가**

```json
{
  "name": "from. with — 친구와 함께하는 운동 서약서",
  "short_name": "FROMWITH",
  "start_url": "/home",
  "scope": "/",
  "display": "standalone",
  "background_color": "#FFFFFF",
  "theme_color": "#FFFFFF",
  "launch_handler": { "client_mode": "navigate-existing" },
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    {
      "src": "/icons/icon-512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

- [ ] **Step 3: JSON 파싱 검증**

```bash
node -e "JSON.parse(require('fs').readFileSync('public/manifest.json', 'utf8')); console.log('manifest valid')"
```

Expected: `manifest valid` 출력.

- [ ] **Step 4: 빌드 회귀 없음 확인**

```bash
pnpm build
```

Expected: 성공.

- [ ] **Step 5: Commit**

```bash
git add public/manifest.json
git commit -m "feat(pwa): manifest 에 launch_handler navigate-existing 추가 (Android PWA 캡처)"
```

---

### Task 4: InstallBanner 컴포넌트 (TDD)

미설치 추정 사용자에게 "홈에 추가" 안내. Android 는 `beforeinstallprompt` 가 잡혀 있으면 즉시 설치 prompt, iOS 는 공유 → 홈에 추가 안내 텍스트. 7일 dismiss.

회귀 방지 3건 포함:

- **`appinstalled` 이벤트**: 사용자가 prompt 수락해 설치가 끝나면 그 세션은 여전히 브라우저 — 배너가 다시 노출되는 회귀를 막기 위해 `appinstalled` 구독으로 즉시 hidden + `pwa.everInstalled = 1` 동기 set.
- **`prompt()` 1회 소비**: 호출 후 `setDeferred(null)` 로 버튼 숨김.
- **`userChoice` dismissed 처리**: 거부하면 7일 dismiss 자동 적용 — 같은 prompt 로 반복 괴롭히지 않음.

**Files:**

- Create: `src/components/pwa/install-banner.tsx`
- Test: `src/components/pwa/install-banner.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/pwa/install-banner.spec.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InstallBanner } from "./install-banner";

// vi.useFakeTimers() 는 setTimeout 도 가로채 testing-library 의 findByRole(...) 폴링과
// 충돌 → hang. Date.now() 만 결정적으로 만들기 위해 spyOn 으로 한정한다.
const FIXED_NOW = new Date("2026-05-17T00:00:00Z").getTime();

describe("InstallBanner", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("기본 렌더 — '홈 화면에 추가' 안내 텍스트 노출", () => {
    render(<InstallBanner />);
    expect(screen.getByText(/홈 화면에 추가/)).toBeInTheDocument();
  });

  it("dismissedUntil 이 미래면 렌더하지 않는다", () => {
    const future = new Date("2026-05-20T00:00:00Z").getTime();
    window.localStorage.setItem("pwa.banner.dismissedUntil", String(future));
    const { container } = render(<InstallBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("dismissedUntil 이 과거면 다시 렌더한다", () => {
    const past = new Date("2026-05-10T00:00:00Z").getTime();
    window.localStorage.setItem("pwa.banner.dismissedUntil", String(past));
    render(<InstallBanner />);
    expect(screen.getByText(/홈 화면에 추가/)).toBeInTheDocument();
  });

  it("닫기 버튼 클릭 시 dismissedUntil 을 +7일로 set 하고 사라진다", () => {
    const { container } = render(<InstallBanner />);
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    const stored = window.localStorage.getItem("pwa.banner.dismissedUntil");
    const expected = new Date("2026-05-24T00:00:00Z").getTime();
    expect(Number(stored)).toBe(expected);
    expect(container.firstChild).toBeNull();
  });

  it("beforeinstallprompt 이벤트가 잡히면 '설치' 버튼이 노출되고 클릭 시 prompt() 호출 + 버튼 사라짐", async () => {
    render(<InstallBanner />);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const fakeEvent = Object.assign(new Event("beforeinstallprompt"), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
    });
    fireEvent(window, fakeEvent);
    const installBtn = await screen.findByRole("button", { name: "설치" });
    fireEvent.click(installBtn);
    expect(prompt).toHaveBeenCalledTimes(1);
    // prompt() 후 deferred 가 null 로 reset → '설치' 버튼이 사라져야 한다.
    await vi.waitFor(() => {
      expect(screen.queryByRole("button", { name: "설치" })).toBeNull();
    });
  });

  it("prompt 결과가 'dismissed' 면 7일 dismiss 가 자동 적용된다", async () => {
    render(<InstallBanner />);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const fakeEvent = Object.assign(new Event("beforeinstallprompt"), {
      prompt,
      userChoice: Promise.resolve({ outcome: "dismissed", platform: "web" }),
    });
    fireEvent(window, fakeEvent);
    const installBtn = await screen.findByRole("button", { name: "설치" });
    fireEvent.click(installBtn);
    await vi.waitFor(() => {
      const stored = window.localStorage.getItem("pwa.banner.dismissedUntil");
      const expected = new Date("2026-05-24T00:00:00Z").getTime();
      expect(Number(stored)).toBe(expected);
    });
  });

  it("appinstalled 이벤트 발생 시 배너가 즉시 사라지고 pwa.everInstalled=1 set", () => {
    const { container } = render(<InstallBanner />);
    fireEvent(window, new Event("appinstalled"));
    expect(container.firstChild).toBeNull();
    expect(window.localStorage.getItem("pwa.everInstalled")).toBe("1");
  });

  it("beforeinstallprompt 가 없으면 iOS 가이드 텍스트만 표시 (설치 버튼 없음)", () => {
    render(<InstallBanner />);
    expect(screen.queryByRole("button", { name: "설치" })).toBeNull();
    expect(screen.getByText(/공유.*홈 화면에 추가/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/components/pwa/install-banner.spec.tsx
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/pwa/install-banner.tsx
"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "pwa.banner.dismissedUntil";
const DISMISS_DAYS = 7;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function readDismissedUntil(): number {
  try {
    const v = window.localStorage.getItem(DISMISS_KEY);
    return v ? Number(v) : 0;
  } catch {
    return 0;
  }
}

function writeDismissedUntil(ts: number): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(ts));
  } catch {
    /* localStorage 차단 — 다음 mount 에서 다시 노출되어도 OK. */
  }
}

const EVER_INSTALLED_KEY = "pwa.everInstalled";

function markEverInstalled(): void {
  try {
    window.localStorage.setItem(EVER_INSTALLED_KEY, "1");
  } catch {
    /* localStorage 차단 — useDisplayMode 가 다음 mount 에서 재시도. */
  }
}

export function InstallBanner({ className }: { className?: string }) {
  const [hidden, setHidden] = useState<boolean>(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const until = readDismissedUntil();
    if (until > Date.now()) {
      setHidden(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    // 설치 완료 시 즉시 hidden + everInstalled set — 같은 세션에서 배너가 재노출되는 회귀 방지.
    const onInstalled = () => {
      markEverInstalled();
      setHidden(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden) return null;

  function dismiss() {
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    writeDismissedUntil(until);
    setHidden(true);
  }

  async function install() {
    if (!deferred) return;
    // prompt() 는 1회 소비 — 호출 후 deferred 를 null 로 reset.
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    if (choice.outcome === "dismissed") {
      // 거부한 사용자를 같은 prompt 로 반복 괴롭히지 않는다.
      dismiss();
    }
    // accepted 면 appinstalled 이벤트가 곧 와서 hidden 으로 만든다.
  }

  return (
    <section
      aria-label="홈 화면에 앱 추가 안내"
      className={cn(
        "border-border/60 bg-card/80 flex items-start gap-3 rounded-2xl border px-4 py-3 backdrop-blur",
        className,
      )}
    >
      <div className="flex flex-1 flex-col gap-1">
        <p className="text-foreground text-sm font-semibold">홈 화면에 추가하면 더 편해요</p>
        {deferred ? (
          <p className="text-muted-foreground text-xs">한 번만 설치하면 다음부터 바로 열려요</p>
        ) : (
          <p className="text-muted-foreground text-xs">Safari 하단 공유 버튼 → 홈 화면에 추가</p>
        )}
      </div>
      <div className="flex items-center gap-1">
        {deferred && (
          <Button size="sm" onClick={install}>
            설치
          </Button>
        )}
        <button
          type="button"
          aria-label="닫기"
          onClick={dismiss}
          className="text-muted-foreground hover:text-foreground rounded p-1"
        >
          <X className="size-4" />
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run src/components/pwa/install-banner.spec.tsx
```

Expected: 8 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/pwa/install-banner.tsx src/components/pwa/install-banner.spec.tsx
git commit -m "feat(pwa): InstallBanner — beforeinstallprompt + appinstalled + iOS 가이드 + 7일 dismiss"
```

---

### Task 5: OpenInAppModal 컴포넌트 (TDD)

이미 설치된 사용자가 브라우저로 진입한 경우 강제 선택 모달. shadcn Dialog 기반, 백드롭 dim · non-click. "앱으로 열기" / "웹으로 계속". 세션 dismiss.

**Files:**

- Create: `src/components/pwa/open-in-app-modal.tsx`
- Test: `src/components/pwa/open-in-app-modal.spec.tsx`

- [ ] **Step 1: dialog primitive 의 실제 export 확인**

`src/components/ui/dialog.tsx` 와 `src/components/ui/confirm-dialog.tsx` 를 먼저 읽어 `<DialogContent />` 가 어떤 props 를 받는지, `onPointerDownOutside` · `onEscapeKeyDown` · `showCloseButton` 이 노출돼 있는지 확인. 노출돼 있지 않으면 Step 3 의 구현에서 그에 맞는 props 로 치환한다. **불변량**: 닫기 버튼 / ESC / 백드롭 어느 것으로도 닫히지 않는다.

```bash
cat src/components/ui/dialog.tsx
cat src/components/ui/confirm-dialog.tsx
```

- [ ] **Step 2: Write the failing test**

```tsx
// src/components/pwa/open-in-app-modal.spec.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OpenInAppModal } from "./open-in-app-modal";

describe("OpenInAppModal", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  it("기본적으로 모달이 열려 있고 두 액션 버튼이 보인다", () => {
    render(<OpenInAppModal />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "앱으로 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "웹으로 계속" })).toBeInTheDocument();
  });

  it("세션 dismiss 플래그가 있으면 렌더하지 않는다", () => {
    window.sessionStorage.setItem("pwa.modal.thisSession", "dismissed");
    const { container } = render(<OpenInAppModal />);
    expect(container.firstChild).toBeNull();
  });

  it("'웹으로 계속' 클릭 시 세션 플래그 set 후 모달 닫힘", () => {
    render(<OpenInAppModal />);
    fireEvent.click(screen.getByRole("button", { name: "웹으로 계속" }));
    expect(window.sessionStorage.getItem("pwa.modal.thisSession")).toBe("dismissed");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("'앱으로 열기' 클릭 시 세션 dismiss 를 set 한 뒤 window.location.assign('/home') 호출", () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign, href: "http://localhost/home" } as unknown as Location,
    });
    render(<OpenInAppModal />);
    fireEvent.click(screen.getByRole("button", { name: "앱으로 열기" }));
    // 같은 탭에서 새로고침되어도 모달이 다시 뜨는 무한 루프를 막기 위해 세션 dismiss 도 함께 set.
    expect(window.sessionStorage.getItem("pwa.modal.thisSession")).toBe("dismissed");
    expect(assign).toHaveBeenCalledWith("/home");
  });

  it("'앱으로 열기' → 새로고침 시뮬레이션(재마운트)에서는 다시 렌더되지 않는다", () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign, href: "http://localhost/home" } as unknown as Location,
    });
    const first = render(<OpenInAppModal />);
    fireEvent.click(screen.getByRole("button", { name: "앱으로 열기" }));
    first.unmount();
    const second = render(<OpenInAppModal />);
    expect(second.container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm vitest run src/components/pwa/open-in-app-modal.spec.tsx
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 4: Write minimal implementation**

```tsx
// src/components/pwa/open-in-app-modal.tsx
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const SESSION_KEY = "pwa.modal.thisSession";

function readSessionDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "dismissed";
  } catch {
    return false;
  }
}

function writeSessionDismissed(): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, "dismissed");
  } catch {
    /* sessionStorage 차단 — 무시. */
  }
}

export function OpenInAppModal() {
  const [open, setOpen] = useState<boolean>(() => !readSessionDismissed());

  if (!open) return null;

  function continueOnWeb() {
    writeSessionDismissed();
    setOpen(false);
  }

  function openInApp() {
    // 같은 탭에서 launch_handler 가 캡처에 실패하면 그냥 새로고침되어 같은 모달이 무한히 뜨는
    // 회귀가 발생. 세션 dismiss 를 먼저 set 해 같은 탭에선 한 번만 시도하고 끝낸다.
    // 새 탭에서 매직링크를 다시 받으면 sessionStorage 가 비어 있으므로 다시 시도된다.
    writeSessionDismissed();
    window.location.assign("/home");
  }

  return (
    <Dialog
      open={open}
      // 백드롭/ESC/X 어느 것으로도 닫히지 않도록: onOpenChange 가 false 로 와도 무시한다.
      onOpenChange={(next) => {
        if (next === false) return;
        setOpen(next);
      }}
    >
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>앱으로 계속할까요?</DialogTitle>
          <DialogDescription>
            홈 화면에 추가한 앱이 있어요. 한 번만 앱으로 열면 다음부터 자동으로 앱이 열려요.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={continueOnWeb}>
            웹으로 계속
          </Button>
          <Button onClick={openInApp}>앱으로 열기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

> Step 1 에서 확인한 dialog primitive 의 실제 props 와 다르면 위 세 props (`onPointerDownOutside`, `onEscapeKeyDown`, `showCloseButton`) 를 그에 맞게 치환한다. base-ui 의 경우 `dismissible={false}` 한 props 로 동시 처리될 수 있다. 핵심은 **닫기 버튼 / ESC / 백드롭 클릭 어느 것으로도 모달이 닫히지 않는다**.

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm vitest run src/components/pwa/open-in-app-modal.spec.tsx
```

Expected: 5 tests passed.

- [ ] **Step 6: Commit**

```bash
git add src/components/pwa/open-in-app-modal.tsx src/components/pwa/open-in-app-modal.spec.tsx
git commit -m "feat(pwa): OpenInAppModal — 강제 선택 모달 + openInApp 도 세션 dismiss (루프 방지)"
```

---

### Task 6: PwaGate — 분기 게이트 (TDD)

`useDisplayMode` 의 결과에 따라 셋 중 하나를 렌더하는 라우트 전용 컴포넌트.

| mode                | everInstalled | 렌더                   |
| ------------------- | ------------- | ---------------------- |
| `standalone`        | —             | null                   |
| `browser`           | `true`        | `<OpenInAppModal />`   |
| `browser`           | `false`       | `<InstallBanner />`    |
| `null` (mount 직전) | —             | null (SSR 깜빡임 방지) |

**Files:**

- Create: `src/app/(app)/home/_components/pwa-gate.tsx`
- Test: `src/app/(app)/home/_components/pwa-gate.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/(app)/home/_components/pwa-gate.spec.tsx
// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/pwa/use-display-mode", () => ({
  useDisplayMode: vi.fn(),
}));
vi.mock("@/components/pwa/install-banner", () => ({
  InstallBanner: () => <div data-testid="install-banner" />,
}));
vi.mock("@/components/pwa/open-in-app-modal", () => ({
  OpenInAppModal: () => <div data-testid="open-in-app-modal" />,
}));

import { useDisplayMode } from "@/components/pwa/use-display-mode";
import { PwaGate } from "./pwa-gate";

const mockedHook = vi.mocked(useDisplayMode);

describe("PwaGate", () => {
  afterEach(() => {
    cleanup();
    mockedHook.mockReset();
  });

  it("mode=null (아직 측정 전) 이면 아무것도 렌더하지 않는다", () => {
    mockedHook.mockReturnValue({ mode: null, everInstalled: false });
    const { container } = render(<PwaGate />);
    expect(container.firstChild).toBeNull();
  });

  it("standalone 이면 아무것도 렌더하지 않는다", () => {
    mockedHook.mockReturnValue({ mode: "standalone", everInstalled: true });
    const { container } = render(<PwaGate />);
    expect(container.firstChild).toBeNull();
  });

  it("browser + everInstalled=true 면 OpenInAppModal 만 렌더", () => {
    mockedHook.mockReturnValue({ mode: "browser", everInstalled: true });
    render(<PwaGate />);
    expect(screen.getByTestId("open-in-app-modal")).toBeInTheDocument();
    expect(screen.queryByTestId("install-banner")).toBeNull();
  });

  it("browser + everInstalled=false 면 InstallBanner 만 렌더", () => {
    mockedHook.mockReturnValue({ mode: "browser", everInstalled: false });
    render(<PwaGate />);
    expect(screen.getByTestId("install-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("open-in-app-modal")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run "src/app/(app)/home/_components/pwa-gate.spec.tsx"
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/app/(app)/home/_components/pwa-gate.tsx
"use client";

import { useDisplayMode } from "@/components/pwa/use-display-mode";
import { InstallBanner } from "@/components/pwa/install-banner";
import { OpenInAppModal } from "@/components/pwa/open-in-app-modal";

export function PwaGate() {
  const { mode, everInstalled } = useDisplayMode();
  if (mode === null) return null;
  if (mode === "standalone") return null;
  if (everInstalled) return <OpenInAppModal />;
  return <InstallBanner />;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run "src/app/(app)/home/_components/pwa-gate.spec.tsx"
```

Expected: 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/home/_components/pwa-gate.tsx" "src/app/(app)/home/_components/pwa-gate.spec.tsx"
git commit -m "feat(pwa): PwaGate — /home 라우트 분기 게이트"
```

---

### Task 7: /home 페이지에 PwaGate 마운트 + 전 구간 검증

마지막 결선. 서버 RSC 의 데이터 fetch 흐름은 건드리지 않는다.

**Files:**

- Modify: `src/app/(app)/home/page.tsx`

- [ ] **Step 1: 현재 page.tsx 구조 확인**

```bash
cat "src/app/(app)/home/page.tsx"
```

JSX 반환 직전 import 추가 위치와 최상위 반환 컨테이너를 확인. 기존 import 마지막 줄 (`./_components/running-challenge-list`) 다음에 `PwaGate` import 를 추가하고, 반환 JSX 의 최상위 자식 중 가장 위에 `<PwaGate />` 한 줄을 끼워 넣는다.

- [ ] **Step 2: Import + 마운트 한 줄 추가**

```tsx
// src/app/(app)/home/page.tsx — import 블록 마지막에 추가
import { PwaGate } from "./_components/pwa-gate";
```

반환 JSX 최상위가 fragment (`<>...</>`) 또는 컨테이너 하나라고 가정하고, 그 첫 자식으로 게이트를 끼워 넣는다:

```tsx
return (
  <>
    <PwaGate />
    {/* 기존 페이지 JSX 그대로 */}
  </>
);
```

기존 최상위가 컨테이너 div / section 이면 컨테이너 안의 첫 자식으로 넣는다 (게이트는 클라이언트 hydrate 후에만 자기 자리를 차지하므로 레이아웃 시프트는 자기 영역 한 줄로 한정).

- [ ] **Step 3: 타입체크 + 린트 + 단위 테스트 일괄**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: 모두 PASS.

- [ ] **Step 4: 빌드 검증**

```bash
pnpm build
```

Expected: 성공. PwaGate 가 client component 로 번들에 포함됨을 확인 (출력 로그에 dynamic chunk 가 늘어남).

- [ ] **Step 5: 수동 검증 (DevTools)**

1. `pnpm dev` 실행.
2. Chrome DevTools > Application > Manifest 에서 `launch_handler.client_mode = "navigate-existing"` 인식 확인 (capture_links 는 추가 안 함 — W3C 표준 비포함).
3. localStorage 비운 상태로 `/home` 진입 → InstallBanner 노출 → 닫기 클릭 → `pwa.banner.dismissedUntil` 미래 timestamp 확인 → 새로고침해도 안 뜸.
4. localStorage 에 `pwa.everInstalled=1` 만 수동 set 한 채 `/home` 진입 → OpenInAppModal 노출, ESC · 백드롭 클릭 · X 버튼 어느 것으로도 닫히지 않음 → "웹으로 계속" 클릭 시 모달 닫힘 + `sessionStorage["pwa.modal.thisSession"]="dismissed"` 확인.
5. Application 패널 "Add to Home Screen" 시뮬레이션 후 standalone 시뮬레이션 → PwaGate 가 null 렌더 (배너/모달 모두 없음) + `pwa.everInstalled=1` 자동 기록 확인.

- [ ] **Step 6: 매직링크 인증 회귀 없음 확인**

테스트 계정 `wjaden0107@gmail.com` 으로:

1. /login → 매직링크 발송 → 메일 수신 확인.
2. 매직링크 클릭 → /auth/callback → /home 정상 진입.
3. 위 Step 5 의 3 / 4 / 5 시나리오가 콜백 직후에도 동일하게 동작.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/home/page.tsx"
git commit -m "feat(pwa): /home 에 PwaGate 마운트 — 매직링크 standalone 분기 결선"
```

---

## 최종 검증

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

수동 확인 항목:

- [ ] 모바일 viewport (DevTools iPhone/Pixel 에뮬레이션) 에서 배너 · 모달 레이아웃 깨짐 없음
- [ ] DevTools > Application > Manifest 가 `launch_handler.client_mode = "navigate-existing"` 인식
- [ ] 매직링크 → /auth/callback → /home 인증 회귀 없음 (`wjaden0107@gmail.com`)
- [ ] localStorage 차단(시크릿 모드)에서 콘솔 에러 없음, InstallBanner 만 매번 정상 노출
- [ ] 실기 1대 (iOS Safari 또는 Android Chrome) dogfood: 모달 노출 빈도가 짜증 수준이 아닌지
- [ ] Android Chrome 에서 InstallBanner "설치" → 수락 → `appinstalled` 이벤트로 배너 즉시 사라짐 + `pwa.everInstalled=1` 확인
- [ ] Android Chrome 에서 InstallBanner "설치" → 거부 → 같은 세션에 prompt 가 두 번 안 뜨고 7일 dismiss 가 set 되는지 확인

## 리스크 / 미해결

- **base-ui Dialog props 호환성**: `onPointerDownOutside` · `onEscapeKeyDown` · `showCloseButton` 이 프로젝트의 base-ui 래퍼에서 노출되지 않으면 Task 5 Step 5 가 실패. Task 5 Step 1 에서 미리 dialog primitive 의 실제 export 를 확인하고 그에 맞게 props 치환. 핵심 불변량: **닫기 버튼 / ESC / 백드롭 클릭 어느 것으로도 모달이 닫히지 않는다**.
- **launch_handler same-tab navigation 적용 범위 모호**: `navigate-existing` 이 "외부 trigger 로 들어온 navigation" 만 캡처하는지, OpenInAppModal 의 same-tab `window.location.assign("/home")` 도 캡처하는지가 명세상 불분명. 후자가 트리거되지 않으면 "앱으로 열기" 는 Android 에서도 그냥 새로고침으로 끝남. 다만 이미 `writeSessionDismissed()` 를 먼저 호출하므로 무한 루프 회귀는 없음. 실패 시 후속 spec 으로 버튼 카피를 "홈 화면 아이콘으로 다시 들어와 주세요" 로 변경하고 자동 navigate 자체를 제거하는 대안 검토.
- **iOS storage partition 격리 (spec §Known Platform Limits §1)**: iOS Safari standalone PWA 와 Safari 브라우저의 localStorage 가 격리될 수 있어 `pwa.everInstalled` 가 iOS Safari 측에서 신뢰할 수 없음 → iOS 사용자에게 OpenInAppModal 이 사실상 안 뜸. 이는 design 결함이 아닌 플랫폼 한계. 코드 수정 없이 dogfood 후 카피만 다시 검토.
- **iOS 매직링크 데드락 (spec §Known Platform Limits §2)**: iOS PWA 와 Safari 의 세션 쿠키가 격리되므로 PWA 안에서 매직링크 인증을 완료할 수 없음. 본 plan 범위 밖. 향후 OAuth/SIWA in-app 인증 spec 으로 후속.
- **분석 이벤트는 별도 PR**: spec §Out of scope — `pwa_install_prompt_shown` 류 이벤트는 PRD §9.1 검토 후 본 plan 머지 뒤 별도로 추가.
- **모달 짜증 리스크**: 세션마다 다시 뜨므로 같은 사용자가 여러 탭에서 매직링크를 받으면 매번 노출. dogfood 1주 후 정책 (세션 → 24h) 재논의.

---

## Self-Review

1. **Spec 커버리지**: spec 의 컴포넌트 C1~C4, manifest 변경, 데이터 흐름, 결정 사항, 검증 시나리오 1~8, Rollout Phase 1/2 모두 Task 1~7 안에 매핑됨. Phase 1(manifest + 훅 + 배너) = Task 1·2·3·4 / Phase 2(모달 + 게이트 + 결선) = Task 5·6·7. ✓
2. **Placeholder 스캔**: TBD / "add validation" / "similar to Task N" / 본문 없는 step 없음. 모든 코드 step 은 실제 코드 블록 동반. ✓
3. **타입 일관성**: `DisplayMode = "standalone" | "browser"`, `DisplayModeState { mode, everInstalled }`, storage 키 (`pwa.everInstalled` / `pwa.banner.dismissedUntil` / `pwa.modal.thisSession`) 가 Task 1~6 전반에서 동일 명칭으로 등장. ✓
4. **유저 플로우 회귀 반영**: (a) Android 신규 설치 직후 배너 회귀 → `appinstalled` 처리, (b) "앱으로 열기" 후 모달 무한 루프 → `openInApp` 도 세션 dismiss, (c) `prompt()` 재호출 → `setDeferred(null)` + `userChoice` dismissed 시 7일 dismiss, (d) iOS 가정 카피 제거. Task 4·5 의 테스트와 구현 모두에 반영. ✓
5. **플랫폼 한계 명시**: iOS storage partition 격리, iOS 매직링크 데드락, launch_handler same-tab 모호성 — spec §Known Platform Limits 및 plan §리스크에 각각 한 줄 이상 기록. ✓
