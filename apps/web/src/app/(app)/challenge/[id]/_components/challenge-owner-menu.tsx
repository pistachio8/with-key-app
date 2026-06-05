"use client";

// 모킹업 §6/§8/§9 상단 ⋯ — 운영자에게만 노출. 진행 중 챌린지 종료 / 미종료 챌린지 삭제.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import { endChallenge, deleteChallenge } from "../_actions";

interface ChallengeOwnerMenuProps {
  challengeId: string;
  isOwner: boolean;
  status: "pending" | "accepted" | "active" | "closed";
}

const userMessage = makeUserMessage({
  forbidden: "운영자만 변경할 수 있어요.",
  not_found: "이미 처리된 챌린지예요.",
});

export function ChallengeOwnerMenu({ challengeId, isOwner, status }: ChallengeOwnerMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  if (!isOwner) return null;
  const canEnd = status === "active";
  const canDelete = status !== "closed";
  if (!canEnd && !canDelete) return null;

  function handleEnd() {
    start(async () => {
      try {
        const res = await endChallenge({ challengeId });
        if (!res.ok) {
          toast.error(userMessage(res.error));
          return;
        }
        setConfirmEnd(false);
        setOpen(false);
        toast.success("챌린지를 종료했어요");
        router.replace(`/challenge/${challengeId}/recap`);
      } catch (err) {
        console.error("[ChallengeOwnerMenu] endChallenge threw", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  function handleDelete() {
    start(async () => {
      try {
        const res = await deleteChallenge({ challengeId });
        if (!res.ok) {
          toast.error(userMessage(res.error));
          return;
        }
        setConfirmDelete(false);
        setOpen(false);
        toast.success("챌린지를 삭제했어요");
        router.replace("/me/challenges");
      } catch (err) {
        console.error("[ChallengeOwnerMenu] deleteChallenge threw", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        aria-label="챌린지 메뉴"
        onClick={() => setOpen(true)}
        className="hover:bg-muted active:bg-muted inline-flex size-9 items-center justify-center rounded-full transition-transform active:scale-95"
      >
        <MoreHorizontal className="size-5" aria-hidden="true" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>챌린지 관리</DialogTitle>
          </DialogHeader>
          <ul className="flex flex-col gap-1">
            {canEnd && (
              <li>
                <button
                  type="button"
                  onClick={() => setConfirmEnd(true)}
                  className="hover:bg-muted w-full rounded-md px-3 py-3 text-left"
                >
                  챌린지 종료
                </button>
              </li>
            )}
            {canDelete && (
              <li>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="text-destructive hover:bg-destructive/10 w-full rounded-md px-3 py-3 text-left"
                >
                  챌린지 삭제
                </button>
              </li>
            )}
          </ul>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title="챌린지를 종료하시겠어요?"
        description="진행 중인 챌린지가 즉시 종료되고 정산 화면으로 이동합니다."
        confirmLabel="종료"
        confirmTone="primary"
        onConfirm={handleEnd}
        pending={pending}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="챌린지를 삭제하시겠어요?"
        description="삭제된 챌린지는 복구할 수 없어요. 멤버 인증 기록·피드도 함께 삭제됩니다."
        confirmLabel="삭제"
        confirmTone="destructive"
        onConfirm={handleDelete}
        pending={pending}
      />
    </>
  );
}
