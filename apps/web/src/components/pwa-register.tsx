// src/components/pwa-register.tsx
"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // standalone 으로 마운트됐다는 건 이미 설치돼 있다는 결정적 증거 — 영구 플래그를 기록한다.
    // 같은 origin 의 브라우저 컨텍스트와 localStorage 가 공유되므로 (Android 한정),
    // 이후 브라우저로 들어왔을 때 /home 의 PwaGate 가 "이 사용자는 깐 적이 있음" 으로 판정할 수 있다.
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
