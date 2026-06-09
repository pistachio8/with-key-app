// src/components/app-shell/fab-photo-verify-sheet.tsx
"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { VerifyTargetChallenge } from "@withkey/domain";

interface FabPhotoVerifySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  challenges: ReadonlyArray<VerifyTargetChallenge>;
}

export function FabPhotoVerifySheet({ open, onOpenChange, challenges }: FabPhotoVerifySheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>어느 챌린지를 인증할까요?</DialogTitle>
          <DialogDescription>사진 인증할 챌린지를 선택해 주세요.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1">
          {challenges.map((c) => (
            <li key={c.id}>
              <Link
                href={`/challenge/${c.id}/action`}
                onClick={() => onOpenChange(false)}
                className="hover:bg-muted focus-visible:bg-muted flex items-center gap-3 rounded-md px-3 py-3 focus-visible:outline-none"
              >
                <span className="t-body flex-1 truncate font-semibold">{c.title}</span>
                {c.groupName ? (
                  <span className="text-muted-foreground t-caption truncate">{c.groupName}</span>
                ) : null}
                <ChevronRight
                  className="text-muted-foreground size-4 shrink-0"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
