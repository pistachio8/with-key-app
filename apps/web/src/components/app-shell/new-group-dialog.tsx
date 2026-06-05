"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import { createGroup } from "@/app/(app)/group/new/_actions";

interface NewGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultNamePreview: string;
}

const userMessage = makeUserMessage({
  invalid_input: "그룹 이름을 다시 확인해 주세요.",
});

export function NewGroupDialog({ open, onOpenChange, defaultNamePreview }: NewGroupDialogProps) {
  const router = useRouter();
  const nameId = useId();
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      try {
        const trimmedName = name.trim();
        const res = await createGroup({ name: trimmedName || undefined });
        if (!res.ok) {
          toast.error(userMessage(res.error));
          return;
        }
        toast.success("새 그룹을 만들었어요");
        setName("");
        onOpenChange(false);
        // ?welcome= 은 invite 자동가입 callback 전용 (ADR-0008). 직접 만든 그룹은
        // toast 로 충분 — "OO에 합류했어요" 배너는 사용자가 그룹을 *만든* 맥락과 맞지 않다.
        router.push(`/group/${res.data.id}`);
        router.refresh();
      } catch (err) {
        console.error("[NewGroupDialog] createGroup threw", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 그룹 만들기</DialogTitle>
          <DialogDescription>비워두면 기본 이름으로 만들어요.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={nameId} className="t-caption">
            그룹 이름
          </label>
          <Input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={30}
            placeholder={defaultNamePreview}
          />
        </div>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="h-11 text-sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            취소
          </Button>
          <Button
            type="button"
            size="lg"
            className="h-11 text-sm"
            onClick={submit}
            disabled={pending}
          >
            {pending ? "만드는 중..." : "만들기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
