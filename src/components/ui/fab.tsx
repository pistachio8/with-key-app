"use client";
import { Plus } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface FabProps {
  href?: string;
  onClick?: () => void;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}

export function Fab({ href, onClick, label, icon: Icon = Plus, className }: FabProps) {
  const base = cn(
    "inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground",
    "shadow-[0_8px_20px_rgba(111,141,245,0.35)] transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out-soft)]",
    "active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    className,
  );
  if (href) {
    return (
      <Link href={href} aria-label={label} className={base}>
        <Icon className="size-6" aria-hidden="true" />
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} onClick={onClick} className={base}>
      <Icon className="size-6" aria-hidden="true" />
    </button>
  );
}
