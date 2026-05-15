import Link from "next/link";
import { Bell, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  /** ADR-0003 §"헤더 chevron-down sheet" — PR2에서는 redirect, PR7에서 sheet로 교체. */
  groupLabel?: string;
  groupHref?: string;
  /** DESIGN_BRIEF §1.5 — 미읽음 Kudos 존재 시 알림 아이콘에 dot. presence only. */
  unreadNotifications?: boolean;
}

const ICON_LINK_CLASSES = cn(
  "relative inline-flex size-11 items-center justify-center rounded-full text-foreground/85 transition-colors",
  "hover:bg-muted active:bg-muted active:scale-95",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
);

export function AppHeader({
  groupLabel = "from. with",
  groupHref = "/group",
  unreadNotifications = false,
}: AppHeaderProps) {
  return (
    <header className="bg-background/90 sticky top-0 z-30 flex items-center justify-between px-4 py-3 backdrop-blur">
      <Link
        href={groupHref}
        className="t-h3 focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-1.5 rounded-md hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        {groupLabel}
        <ChevronDownIcon />
      </Link>
      <div className="flex items-center gap-1">
        <Link
          href="/notifications"
          aria-label={unreadNotifications ? "알림 (새 응원 있음)" : "알림"}
          className={ICON_LINK_CLASSES}
        >
          <Bell className="size-5" aria-hidden="true" />
          {unreadNotifications && (
            <span
              data-testid="header-unread-dot"
              aria-hidden="true"
              className="bg-destructive absolute right-2.5 top-2.5 size-2 rounded-full"
            />
          )}
        </Link>
        <Link href="/settings" aria-label="마이페이지" className={ICON_LINK_CLASSES}>
          <User className="size-5" aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
