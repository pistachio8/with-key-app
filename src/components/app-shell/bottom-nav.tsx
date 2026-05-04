"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Camera, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/home", label: "홈", icon: Home },
  { href: "/action", label: "인증", icon: Camera },
  { href: "/pledge", label: "서약서", icon: Users },
] as const;

interface BottomNavProps {
  /** DESIGN_BRIEF §1.5 — 미읽음 Kudos 존재 시 홈 탭에 dot. presence only (count 없음). */
  unreadDot?: boolean;
}

export function BottomNav({ unreadDot = false }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="주요 메뉴" className="bg-background sticky bottom-0 border-t">
      <ul className="mx-auto flex max-w-screen-sm items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          const showDot = unreadDot && href === "/home";
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 flex-col items-center gap-1 rounded-md px-2 py-3 text-xs font-medium transition-colors",
                  "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="relative">
                  <Icon className="size-6" aria-hidden="true" />
                  {showDot && (
                    <span
                      data-testid="home-unread-dot"
                      aria-label="새 응원 있음"
                      className="bg-primary ring-background absolute -top-1 -right-1 block size-2 rounded-full ring-2"
                    />
                  )}
                </span>
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
