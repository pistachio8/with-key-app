"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const register = async () => {
      try {
        await navigator.serviceWorker.register("/service-worker.js", {
          scope: "/",
        });
      } catch (error) {
        // SW 등록 실패는 앱 동작에 치명적이지 않다 — dev 에서만 관찰.
        if (process.env.NODE_ENV !== "production") {
          console.warn("[pwa] SW register failed", error);
        }
      }
    };
    void register();
  }, []);
  return null;
}
