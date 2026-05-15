import { cn } from "@/lib/utils";
import * as React from "react";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function IconButton({ label, icon: Icon, className, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-full text-foreground/85 transition-colors",
        "hover:bg-muted active:bg-muted active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}
