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
  // SSR 과 hydration 1차 렌더는 항상 null/false 로 통일 — `typeof window` 분기를
  // lazy initializer 에 두면 React 19 hydration 에서 sibling 위치 mismatch 발생.
  // 실제 평가는 mount 후 useEffect 에서 한 프레임 지연으로 수행.
  const [mode, setMode] = useState<DisplayMode | null>(null);
  const [everInstalled, setEverInstalled] = useState<boolean>(false);

  useEffect(() => {
    const isStandalone = evaluateStandalone();
    if (isStandalone) writeEverInstalled();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-once SSR-safe display-mode hydration
    setMode(isStandalone ? "standalone" : "browser");

    setEverInstalled(isStandalone || readEverInstalled());

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
