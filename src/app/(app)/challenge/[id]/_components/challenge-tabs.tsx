"use client";

// 모킹업 §6/§8/§9 상단 `.tabs` — 인증 피드 / 현황판 / 정보.

import { useState } from "react";
import { cn } from "@/lib/utils";

export type TabKey = "feed" | "dashboard" | "info";

interface ChallengeTabsProps {
  feed: React.ReactNode;
  dashboard: React.ReactNode;
  info: React.ReactNode;
  defaultTab?: TabKey;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "feed", label: "인증 피드" },
  { key: "dashboard", label: "현황판" },
  { key: "info", label: "정보" },
];

export function ChallengeTabs({ feed, dashboard, info, defaultTab = "feed" }: ChallengeTabsProps) {
  const [active, setActive] = useState<TabKey>(defaultTab);
  const content = active === "feed" ? feed : active === "dashboard" ? dashboard : info;
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="챌린지 보기" className="bg-muted flex gap-1 rounded-full p-1">
        {TABS.map(({ key, label }) => {
          const on = active === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(key)}
              className={cn(
                "flex-1 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
                "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                on
                  ? "bg-card text-foreground shadow-[0_1px_2px_rgba(20,24,36,0.06)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">{content}</div>
    </div>
  );
}
