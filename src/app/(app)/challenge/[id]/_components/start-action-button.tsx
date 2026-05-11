"use client";

import { Loader2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import { markActionStarted } from "../_actions";

const userMessage = makeUserMessage({
  not_found: "현재 참여 중인 챌린지를 찾을 수 없어요.",
  forbidden: "지금은 운동을 시작할 수 있는 기간이 아니에요.",
});

type Props = {
  challengeId: string;
  pushSubscribed: boolean;
};

// PRD §6.2/6.3 — 운동 시작 트리거. AC-2 1일 1회는 서버에서 events 기반으로 보장.
// AC-7: 미구독 상태면 즉시 발사하지 않고 설정 진입점만 안내한다 (브라우저 권한 요청은 settings 가 담당).
export function StartActionButton({ challengeId, pushSubscribed }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!pushSubscribed) {
      toast("푸시 알림을 켜주세요", {
        description: "그룹원에게 시작 알림을 보내려면 알림 설정이 필요해요.",
        action: {
          label: "설정 열기",
          onClick: () => router.push("/settings"),
        },
      });
      return;
    }

    startTransition(async () => {
      try {
        const res = await markActionStarted({ challengeId });
        if (!res.ok) {
          toast.error(userMessage(res.error));
          return;
        }
        const { skipped, quietHours, recipientCount } = res.data;
        if (skipped) {
          toast("오늘 시작 알림은 이미 보냈어요. 화이팅!");
          return;
        }
        // 거짓말 방지 분기 — 요약을 그대로 사용자에게 노출.
        if (quietHours) {
          toast("조용한 시간(02-07시)이라 알림은 보류했어요", {
            description: "운동은 그대로 시작하셔도 됩니다 💪",
          });
          return;
        }
        if (recipientCount === 0) {
          // 솔로(1인 그룹) 또는 본인만 참여 중인 그룹. PRD §3.4 dual-mode reframing.
          toast("솔로 챌린지엔 시작 알림이 없어요", {
            description: "운동만 잘 마치면 됩니다 💪",
          });
          return;
        }
        toast.success(`그룹원 ${recipientCount}명에게 시작 알림을 보냈어요!`);
      } catch (err) {
        console.error("[StartActionButton] markActionStarted failed", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <Button
      type="button"
      size="lg"
      className="h-12 w-full gap-2"
      disabled={pending}
      onClick={handleClick}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Play className="size-4" aria-hidden="true" />
      )}
      운동 시작
    </Button>
  );
}
