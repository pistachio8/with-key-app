// src/components/pwa/install-banner.tsx
"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "pwa.banner.dismissedUntil";
const DISMISS_DAYS = 7;
const EVER_INSTALLED_KEY = "pwa.everInstalled";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

// beforeinstallprompt 는 page 첫 진입에 1회만 발화한다. InstallBanner 가 라우트 이동으로
// unmount 되었다가 재마운트되면 컴포넌트 내부 state 의 deferred 는 사라지고 이벤트는 다시
// 안 오므로 "설치" 버튼이 영원히 안 보이는 회귀가 생긴다. 모듈 수준에서 한 번 캐치해 두면
// mount/unmount 사이에 보존된다. appinstalled 시점에 명시적으로 null 로 비운다.
let cachedDeferred: BeforeInstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    cachedDeferred = e as BeforeInstallPromptEvent;
  });
  window.addEventListener("appinstalled", () => {
    cachedDeferred = null;
  });
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

function markEverInstalled(): void {
  try {
    window.localStorage.setItem(EVER_INSTALLED_KEY, "1");
  } catch {
    /* localStorage 차단 — useDisplayMode 가 다음 mount 에서 재시도. */
  }
}

export function InstallBanner({ className }: { className?: string }) {
  // ESLint react-hooks/set-state-in-effect 회피 — 초기 hidden 판정은 lazy initializer 로.
  const [hidden, setHidden] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return readDismissedUntil() > Date.now();
  });
  // module-level cache 에서 초기값 — 라우트 이동 후 재마운트에서도 즉시 복원.
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(() => cachedDeferred);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      cachedDeferred = promptEvent;
      setDeferred(promptEvent);
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
    // prompt() 는 1회 소비 — 호출 후 deferred (state + module cache) 를 null 로 reset.
    await deferred.prompt();
    const choice = await deferred.userChoice;
    cachedDeferred = null;
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
        "border-border/60 bg-card/80 flex items-center gap-3 rounded-2xl border px-4 py-3 backdrop-blur",
        className,
      )}
    >
      <div className="flex flex-1 flex-col gap-1">
        <p className="text-foreground text-sm font-semibold">앱을 홈에 추가하면 더 편해요</p>
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
