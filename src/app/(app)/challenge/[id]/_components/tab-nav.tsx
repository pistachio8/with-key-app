"use client";

// challenge/[id] 의 3 탭(feed/dashboard/info) navigation.
// <Link prefetch> 로 즉시 전환 + useLinkStatus 로 클릭 즉시 spinner.

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "feed", label: "인증 피드", suffix: "" },
  { key: "dashboard", label: "현황판", suffix: "/dashboard" },
  { key: "info", label: "정보", suffix: "/info" },
] as const;

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
              "flex-1 rounded-full px-3 py-1.5 text-center text-[12px] font-semibold transition-colors",
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

function TabLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return (
    <span className="inline-flex items-center justify-center gap-1">
      {label}
      {pending && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
    </span>
  );
}
