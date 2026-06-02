"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import { deleteGroup, renameGroup } from "../_actions";

interface GroupHeaderProps {
  groupId: string;
  name: string | null;
  isOwner: boolean;
  memberCount: number;
  challengeCount: number;
  hasOpenChallenge: boolean;
}

const userMessage = makeUserMessage({
  forbidden: "운영자만 그룹을 수정할 수 있어요.",
  invalid_input: "그룹 상태를 다시 확인해 주세요.",
});

function displayName(name: string | null): string {
  return name ?? "이름 없는 그룹";
}

function deleteDisabledReason(memberCount: number, challengeCount: number): string | null {
  if (memberCount >= 2) return "친구와 함께한 그룹은 삭제할 수 없어요";
  if (challengeCount >= 1) return "한 번이라도 챌린지를 시작한 그룹은 삭제할 수 없어요";
  return null;
}

export function GroupHeader({
  groupId,
  name,
  isOwner,
  memberCount,
  challengeCount,
  hasOpenChallenge,
}: GroupHeaderProps) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [draftName, setDraftName] = useState(displayName(name));
  const [pendingRename, startRename] = useTransition();
  const [pendingDelete, startDelete] = useTransition();
  const deleteReason = deleteDisabledReason(memberCount, challengeCount);

  function submitRename() {
    startRename(async () => {
      try {
        const res = await renameGroup({ groupId, name: draftName });
        if (!res.ok) {
          toast.error(userMessage(res.error));
          return;
        }
        toast.success("그룹 이름을 바꿨어요");
        setRenameOpen(false);
        router.refresh();
      } catch (err) {
        console.error("[GroupHeader] renameGroup threw", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  function submitDelete() {
    startDelete(async () => {
      try {
        const res = await deleteGroup(groupId);
        if (!res.ok) {
          const firstField = res.issues
            ? Object.values(res.issues).flat().filter(Boolean)[0]
            : undefined;
          toast.error(firstField ?? userMessage(res.error));
          return;
        }
        toast.success("그룹을 삭제했어요");
        setDeleteOpen(false);
        router.push("/home");
        router.refresh();
      } catch (err) {
        console.error("[GroupHeader] deleteGroup threw", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="t-h1 break-keep">{displayName(name)}</h1>
          <div className="mt-2 flex items-center gap-1.5">
            <Chip tone={isOwner ? "primary" : "neutral"}>{isOwner ? "운영자" : "멤버"}</Chip>
            <Chip tone="neutral">멤버 {memberCount}명</Chip>
          </div>
        </div>
        {isOwner && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label="그룹 이름 바꾸기"
              onClick={() => {
                setDraftName(displayName(name));
                setRenameOpen(true);
              }}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label="그룹 삭제"
              title={deleteReason ?? "그룹 삭제"}
              disabled={deleteReason !== null}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      {isOwner &&
        (hasOpenChallenge ? (
          <Button size="lg" className="h-11 w-full gap-2" disabled>
            <Plus className="size-4" aria-hidden="true" />
            현재 진행 중인 챌린지가 있어요
          </Button>
        ) : (
          <Link
            href={`/challenge/new?groupId=${groupId}`}
            className={cn(buttonVariants({ size: "lg" }), "h-11 w-full gap-2")}
          >
            <Plus className="size-4" aria-hidden="true" />이 그룹에서 새 챌린지
          </Link>
        ))}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>그룹 이름 바꾸기</DialogTitle>
            <DialogDescription>멤버에게 보이는 그룹 이름이에요.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="group-name" className="t-caption">
              그룹 이름
            </label>
            <Input
              id="group-name"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              maxLength={30}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-11 text-sm"
              onClick={() => setRenameOpen(false)}
              disabled={pendingRename}
            >
              취소
            </Button>
            <Button
              type="button"
              size="lg"
              className="h-11 text-sm"
              onClick={submitRename}
              disabled={pendingRename || !draftName.trim()}
            >
              {pendingRename ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>그룹 삭제</DialogTitle>
            <DialogDescription>
              멤버가 없고 챌린지를 시작한 적 없는 그룹만 삭제할 수 있어요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-11 text-sm"
              onClick={() => setDeleteOpen(false)}
              disabled={pendingDelete}
            >
              취소
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="lg"
              className="h-11 text-sm"
              onClick={submitDelete}
              disabled={pendingDelete}
            >
              {pendingDelete ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
