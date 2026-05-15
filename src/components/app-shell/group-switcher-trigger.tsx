"use client";

import { useState } from "react";
import { GroupSwitcherSheet, type GroupSwitcherItem } from "./group-switcher-sheet";

interface GroupSwitcherTriggerProps {
  label: string;
  groups: ReadonlyArray<GroupSwitcherItem>;
  activeId?: string;
}

// AppHeader 의 chevron-down 트리거. 클라이언트 boundary 만 가져가고 시각 분기는 부모가 처리.
export function GroupSwitcherTrigger({ label, groups, activeId }: GroupSwitcherTriggerProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="t-h3 focus-visible:ring-ring focus-visible:ring-offset-background inline-flex items-center gap-1.5 rounded-md hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
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
      </button>
      <GroupSwitcherSheet open={open} onOpenChange={setOpen} groups={groups} activeId={activeId} />
    </>
  );
}
