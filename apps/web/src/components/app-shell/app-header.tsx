import Image from "next/image";
import Link from "next/link";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "./notification-bell";

const ICON_LINK_CLASSES = cn(
  "relative inline-flex size-11 items-center justify-center rounded-full text-foreground/85 transition-colors",
  "hover:bg-muted active:bg-muted active:scale-95",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
);

export function AppHeader() {
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
        <NotificationBell />
        <Link href="/me" aria-label="마이페이지" className={ICON_LINK_CLASSES}>
          <User className="size-5" aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
