// src/app/(app)/group/[id]/_components/invite-trigger.tsx
"use client";

import { useState, useTransition } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildInviteUrl } from "@/lib/invite/share-url";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import { createInvite } from "../_actions";

const userMessage = makeUserMessage({
  forbidden: "그룹장만 초대 링크를 만들 수 있어요.",
  conflict: "잠시 후 다시 시도해 주세요.",
});

type Props = {
  groupId: string;
};

// PRD §3.3 AC-2 · 화면 인벤토리 #2. Web Share API 가능 시 네이티브 시트,
// 아니면 clipboard 복사 후 토스트로 피드백.
export function InviteTrigger({ groupId }: Props) {
  const [pending, startTransition] = useTransition();
  const [, setLastUrl] = useState<string | null>(null);

  function onClick() {
    startTransition(async () => {
      try {
        const res = await createInvite(groupId);
        if (!res.ok) {
          toast.error(userMessage(res.error));
          return;
        }
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const url = buildInviteUrl(origin, res.data.token);
        setLastUrl(url);

        const shared = await tryWebShare(url);
        if (shared) return;

        await navigator.clipboard.writeText(url);
        toast.success("초대 링크를 복사했어요. 친구에게 보내주세요.");
      } catch (err) {
        console.error("[InviteTrigger] unexpected throw:", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <Button
      size="lg"
      variant="outline"
      className="h-11 w-full gap-2"
      onClick={onClick}
      disabled={pending}
    >
      <Share2 aria-hidden="true" />
      {pending ? "링크 만드는 중..." : "친구 초대 링크 공유"}
    </Button>
  );
}

async function tryWebShare(url: string): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }
  try {
    await navigator.share({
      title: "윗키 초대",
      text: "함께 운동 서약서를 써볼래?",
      url,
    });
    return true;
  } catch {
    // 사용자 취소 등은 복사 fallback 으로 넘어가지 않는다.
    return true;
  }
}
