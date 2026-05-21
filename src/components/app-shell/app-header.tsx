import Image from "next/image";
import Link from "next/link";
import { Bell, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { GroupSwitcherTrigger } from "./group-switcher-trigger";
import type { GroupSwitcherItem } from "./group-switcher-sheet";

interface AppHeaderProps {
  /** F15/ADR-0012 — 사용자 소속 그룹 목록. 0개: /group/new, 1개+: sheet. */
  groups?: ReadonlyArray<GroupSwitcherItem>;
  newGroupNamePreview?: string;
  /** DESIGN_BRIEF §1.5 — 미읽음 Kudos/알림 dot. presence only. */
  unreadNotifications?: boolean;
}

const ICON_LINK_CLASSES = cn(
  "relative inline-flex size-11 items-center justify-center rounded-full text-foreground/85 transition-colors",
  "hover:bg-muted active:bg-muted active:scale-95",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
);

export function AppHeader({
  groups = [],
  newGroupNamePreview = "내님과 친구들",
  unreadNotifications = false,
}: AppHeaderProps) {
  const groupCount = groups.length;
  const hasGroups = groupCount >= 1;

  return (
    <header className="bg-background/90 sticky top-0 z-30 flex items-center justify-between px-4 py-3 backdrop-blur">
      <Link
        href="/home"
        aria-label="홈"
        className="focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center rounded-md py-2 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <Image
          src="/logo-from-with.svg"
          alt=""
          width={144}
          height={28}
          priority
          unoptimized
          className="h-7 w-auto"
        />
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
        {hasGroups ? (
          <GroupSwitcherTrigger
            variant="icon"
            groups={groups}
            newGroupNamePreview={newGroupNamePreview}
          />
        ) : (
          <Link href="/group/new" aria-label="새 그룹 만들기" className={ICON_LINK_CLASSES}>
            <Users className="size-5" aria-hidden="true" />
          </Link>
        )}
        <Link href="/me" aria-label="마이페이지" className={ICON_LINK_CLASSES}>
          <User className="size-5" aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
