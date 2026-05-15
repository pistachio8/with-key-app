import Link from "next/link";
import { Bell, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { GroupSwitcherTrigger } from "./group-switcher-trigger";
import type { GroupSwitcherItem } from "./group-switcher-sheet";

interface AppHeaderProps {
  /** ADR-0003 — 그룹 2개+는 sheet, 1개는 직진입, 0개는 라벨만. */
  groupLabel?: string;
  /** F15 — 사용자 소속 그룹 목록. */
  groups?: ReadonlyArray<GroupSwitcherItem>;
  /** DESIGN_BRIEF §1.5 — 미읽음 Kudos/알림 dot. presence only. */
  unreadNotifications?: boolean;
}

const ICON_LINK_CLASSES = cn(
  "relative inline-flex size-11 items-center justify-center rounded-full text-foreground/85 transition-colors",
  "hover:bg-muted active:bg-muted active:scale-95",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
);

export function AppHeader({
  groupLabel = "from. with",
  groups = [],
  unreadNotifications = false,
}: AppHeaderProps) {
  const groupCount = groups.length;
  const multipleGroups = groupCount >= 2;
  const singleGroup = groupCount === 1 ? groups[0] : null;

  return (
    <header className="bg-background/90 sticky top-0 z-30 flex items-center justify-between px-4 py-3 backdrop-blur">
      {multipleGroups ? (
        <GroupSwitcherTrigger label={groupLabel} groups={groups} />
      ) : singleGroup ? (
        <Link
          href={`/group/${singleGroup.id}`}
          className="t-h3 focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-1.5 rounded-md hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          {singleGroup.name ?? groupLabel}
        </Link>
      ) : (
        <span className="t-h3 inline-flex items-center gap-1.5">{groupLabel}</span>
      )}
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
        <Link href="/me" aria-label="마이페이지" className={ICON_LINK_CLASSES}>
          <User className="size-5" aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
