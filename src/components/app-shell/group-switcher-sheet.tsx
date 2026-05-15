"use client";

// ADR-0003 — 그룹 ≥2 일 때 헤더 chevron 누르면 노출되는 그룹 전환 sheet.
// 현재 라우트 컨텍스트(active group)는 호출자가 미지정 — POC 는 단순 목록 + 직진입.

import Link from "next/link";
import { Check, ChevronRight, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type GroupSwitcherItem = {
  id: string;
  name: string | null;
};

interface GroupSwitcherSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: ReadonlyArray<GroupSwitcherItem>;
  activeId?: string;
}

export function GroupSwitcherSheet({
  open,
  onOpenChange,
  groups,
  activeId,
}: GroupSwitcherSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>그룹 선택</DialogTitle>
          <DialogDescription>이동할 그룹을 선택해 주세요.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1">
          {groups.map((g) => {
            const isActive = g.id === activeId;
            return (
              <li key={g.id}>
                <Link
                  href={`/group/${g.id}`}
                  onClick={() => onOpenChange(false)}
                  className="hover:bg-muted focus-visible:bg-muted flex items-center gap-3 rounded-md px-3 py-3 focus-visible:outline-none"
                >
                  <span className="t-body flex-1 truncate font-semibold">
                    {g.name ?? "이름 없는 그룹"}
                  </span>
                  {isActive ? (
                    <Check className="text-primary size-4" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="text-muted-foreground size-4" aria-hidden="true" />
                  )}
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              href="/group/new"
              onClick={() => onOpenChange(false)}
              className="hover:bg-muted focus-visible:bg-muted flex items-center gap-3 rounded-md px-3 py-3 focus-visible:outline-none"
            >
              <Plus className="text-muted-foreground size-4" aria-hidden="true" />
              <span className="t-body flex-1">새 그룹 만들기</span>
            </Link>
          </li>
        </ul>
      </DialogContent>
    </Dialog>
  );
}
