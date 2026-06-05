"use client";

// 모킹업 §13 - 알림 센터. IDB 캐시 기반 (Q7 결정 C). 진입 시 자동 markAllRead.

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  listNotifications,
  markAllRead,
  markRead,
  type NotificationCategory,
  type StoredNotification,
} from "@/lib/notifications/store";

type Tab = NotificationCategory | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "reminder", label: "리마인더" },
  { key: "friend_action", label: "친구 인증" },
  { key: "penalty", label: "벌금" },
];

function formatRelative(iso: string, now = Date.now()): string {
  const diffSec = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return "방금";
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export default function NotificationsPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [items, setItems] = useState<StoredNotification[]>([]);

  const refresh = useCallback(async () => {
    const list = await listNotifications(tab === "all" ? undefined : tab);
    setItems(list);
  }, [tab]);

  useEffect(() => {
    // SSR 종료 후 IDB 가 가용해야 하므로 effect 에서 fetch 후 setState — 외부 비동기 시스템 동기화.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  // 진입 1회: 모두 읽음 표시 (헤더 dot 즉시 갱신은 후속).
  useEffect(() => {
    void markAllRead().then(refresh);
  }, [refresh]);

  return (
    <div className="flex flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <h1 className="t-h1">알림</h1>
        <button
          type="button"
          onClick={() => void markAllRead().then(refresh)}
          className="t-sub hover:underline"
        >
          모두 읽음
        </button>
      </header>
      <div role="tablist" className="bg-muted flex gap-1 rounded-full p-1">
        {TABS.map(({ key, label }) => {
          const on = tab === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={on}
              onClick={() => setTab(key)}
              className={cn(
                "flex-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                on
                  ? "bg-card text-foreground shadow-[0_1px_2px_rgba(20,24,36,0.06)]"
                  : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="아직 알림이 없어요"
          description="친구 인증·마감 알림이 여기 모여요"
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                href={n.targetUrl}
                onClick={() => void markRead(n.id)}
                className="focus-visible:ring-ring block rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <Card
                  padding="md"
                  className="flex items-start gap-3 transition-transform active:scale-[0.99]"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="t-body truncate font-semibold">{n.title}</div>
                    <div className="t-sub line-clamp-2">{n.body}</div>
                    <div className="text-muted-foreground mt-1 text-[10px]">
                      {formatRelative(n.receivedAt)}
                    </div>
                  </div>
                  {!n.readAt && (
                    <div
                      aria-hidden="true"
                      className="bg-destructive mt-1 size-2 shrink-0 rounded-full"
                    />
                  )}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
