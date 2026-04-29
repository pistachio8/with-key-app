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

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="주요 메뉴" className="bg-background sticky bottom-0 border-t">
      <ul className="mx-auto flex max-w-screen-sm items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
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
                <Icon className="size-6" aria-hidden="true" />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
