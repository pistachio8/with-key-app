"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { unreadCount } from "@/lib/notifications/store";

// plan 2026-05-22-header-unread-dot-source — dot 의미를 /notifications IDB 미읽음으로 정렬.
// 트리거 (γ): 마운트 + pathname 변경 + visibilitychange.

const ICON_LINK_CLASSES = cn(
  "relative inline-flex size-11 items-center justify-center rounded-full text-foreground/85 transition-colors",
  "hover:bg-muted active:bg-muted active:scale-95",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
);

export function NotificationBell() {
  const pathname = usePathname();
  const [hasUnread, setHasUnread] = useState(false);

  const refresh = useCallback(async () => {
    const n = await unreadCount();
    setHasUnread(n > 0);
  }, []);

  useEffect(() => {
    // SSR 종료 후 IDB 가용. 외부 비동기 시스템(IndexedDB) 동기화라 effect 진입 시 setState 필요.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh, pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  return (
    <Link
      href="/notifications"
      aria-label={hasUnread ? "알림 (새 알림 있음)" : "알림"}
      className={ICON_LINK_CLASSES}
    >
      <Bell className="size-5" aria-hidden="true" />
      <span
        data-testid="header-unread-dot"
        aria-hidden="true"
        className={cn(
          "bg-destructive absolute right-2.5 top-2.5 size-2 rounded-full transition-opacity duration-200",
          hasUnread ? "opacity-100" : "opacity-0",
        )}
      />
    </Link>
  );
}
