"use client";

// challenge/[id] 의 3 탭(feed/dashboard/info) navigation.
// <Link prefetch> 로 즉시 전환 + useLinkStatus 로 100ms 이상 지속될 때만 spinner.

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "feed", label: "인증 피드", suffix: "" },
  { key: "dashboard", label: "현황판", suffix: "/dashboard" },
  { key: "info", label: "정보", suffix: "/info" },
] as const;

// Nielsen perceived-as-instant 임계 — 100ms 안에 끝나는 navigation 은 spinner 표시
// 안 함. 빠른 prefetch hit 에서 spinner 가 잠깐 떴다 사라지며 라벨이 흔들리던 깜빡임 0.
const SPINNER_DELAY_MS = 100;

function useDeferredPending(pending: boolean, delayMs: number): boolean {
  const [deferred, setDeferred] = useState(false);
  // pending 이 false 로 돌아가면 deferred 도 즉시 reset.
  // effect 안 동기 setState 대신 React 권장 "props 변화에 따른 state 조정" 패턴 사용.
  if (!pending && deferred) {
    setDeferred(false);
  }
  useEffect(() => {
    if (!pending) return;
    const handle = setTimeout(() => setDeferred(true), delayMs);
    return () => clearTimeout(handle);
  }, [pending, delayMs]);
  return deferred;
}

interface TabNavProps {
  challengeId: string;
}

export function TabNav({ challengeId }: TabNavProps) {
  const pathname = usePathname();
  const base = `/challenge/${challengeId}`;

  return (
    <div role="tablist" aria-label="챌린지 보기" className="bg-muted flex gap-1 rounded-full p-1">
      {TABS.map((t) => {
        const href = `${base}${t.suffix}`;
        const isActive = t.suffix === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={t.key}
            href={href}
            role="tab"
            aria-selected={isActive}
            prefetch
            className={cn(
              "relative flex-1 rounded-full px-3 py-1.5 text-center text-[12px] font-semibold transition-colors",
              "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
              isActive
                ? "bg-card text-foreground shadow-[0_1px_2px_rgba(20,24,36,0.06)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <TabLabel label={t.label} />
          </Link>
        );
      })}
    </div>
  );
}

// 라벨은 text-center 보존(중심선 유지). spinner 는 우측 안쪽에 absolute 로 배치 →
// 등장/소멸 시 라벨 위치 변동 0. opacity transition 으로 --motion-fast fade-in.
function TabLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  const showSpinner = useDeferredPending(pending, SPINNER_DELAY_MS);
  return (
    <>
      <span>{label}</span>
      <Loader2
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2 animate-spin transition-opacity",
          showSpinner ? "opacity-100" : "opacity-0",
        )}
        style={{ transitionDuration: "var(--motion-fast)" }}
      />
    </>
  );
}
