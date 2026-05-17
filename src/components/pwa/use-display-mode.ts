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
  const [mode, setMode] = useState<DisplayMode | null>(() => {
    if (typeof window === "undefined") return null;
    const isStandalone = evaluateStandalone();
    if (isStandalone) writeEverInstalled();
    return isStandalone ? "standalone" : "browser";
  });

  const [everInstalled, setEverInstalled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return evaluateStandalone() || readEverInstalled();
  });

  useEffect(() => {
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
