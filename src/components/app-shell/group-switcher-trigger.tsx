"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { GroupSwitcherSheet, type GroupSwitcherItem } from "./group-switcher-sheet";

type Variant = "label" | "icon";

interface GroupSwitcherTriggerProps {
  variant?: Variant;
  /** variant="label" 전용. icon 변형에서는 무시되고 aria-label="그룹 선택" 사용. */
  label?: string;
  groups: ReadonlyArray<GroupSwitcherItem>;
  activeId?: string;
}

const ICON_BUTTON_CLASSES = cn(
  "relative inline-flex size-11 items-center justify-center rounded-full text-foreground/85 transition-colors",
  "hover:bg-muted active:bg-muted active:scale-95",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
);

const LABEL_BUTTON_CLASSES = cn(
  "t-h3 focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-1.5 rounded-md hover:opacity-80",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
);

export function GroupSwitcherTrigger({
  variant = "label",
  label,
  groups,
  activeId,
}: GroupSwitcherTriggerProps) {
  const [open, setOpen] = useState(false);
  const isIcon = variant === "icon";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={isIcon ? "그룹 선택" : undefined}
        className={isIcon ? ICON_BUTTON_CLASSES : LABEL_BUTTON_CLASSES}
      >
        {isIcon ? (
          <Users className="size-5" aria-hidden="true" />
        ) : (
          <>
            {label}
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
          </>
        )}
      </button>
      <GroupSwitcherSheet open={open} onOpenChange={setOpen} groups={groups} activeId={activeId} />
    </>
  );
}
