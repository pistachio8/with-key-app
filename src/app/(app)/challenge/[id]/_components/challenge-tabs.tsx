"use client";

// 모킹업 §6/§8/§9 상단 `.tabs` — 인증 피드 / 현황판 / 정보.
// URL ?tab= 동기화 (F8 결과 모달 CTA에서 사용). FAB은 info 탭에서만 숨김 (§9-A·B 카메라 FAB 제거 명시).
// active 는 URL searchParams 에서 직접 도출 — 로컬 state 없음 (single source of truth).
// FAB은 RSC→Client 경계 회피 위해 컴포넌트 내부에서 렌더 (Camera forwardRef 직렬화 불가).

import { Camera } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fab } from "@/components/ui/fab";
import { cn } from "@/lib/utils";

export type TabKey = "feed" | "dashboard" | "info";

interface ChallengeTabsProps {
  feed: React.ReactNode;
  dashboard: React.ReactNode;
  info: React.ReactNode;
  defaultTab?: TabKey;
  // 직렬화 가능한 string 만 전달 (Camera 컴포넌트 참조를 server→client 로 못 보냄).
  actionHref?: string;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "feed", label: "인증 피드" },
  { key: "dashboard", label: "현황판" },
  { key: "info", label: "정보" },
];

function parseTab(value: string | null, fallback: TabKey): TabKey {
  if (value === "feed" || value === "dashboard" || value === "info") return value;
  return fallback;
}

export function ChallengeTabs({
  feed,
  dashboard,
  info,
  defaultTab = "feed",
  actionHref,
}: ChallengeTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = parseTab(searchParams.get("tab"), defaultTab);

  function handleSelect(next: TabKey) {
    if (next === active) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === "feed") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const content = active === "feed" ? feed : active === "dashboard" ? dashboard : info;
  const showFab = actionHref != null && active !== "info";

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
              onClick={() => handleSelect(key)}
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
      {showFab && actionHref && (
        <Fab
          href={actionHref}
          label="인증하기"
          icon={Camera}
          className="fixed bottom-6 left-1/2 z-20 -translate-x-1/2"
        />
      )}
    </div>
  );
}
