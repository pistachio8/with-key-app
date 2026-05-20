"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import { startChallengeWithSignedParticipants } from "../_actions";

const userMessage = makeUserMessage({
  forbidden: "챌린지를 시작할 수 없어요. 서명 상태를 확인해 주세요.",
  not_found: "챌린지를 찾지 못했어요.",
});

type Props = {
  challengeId: string;
  signedCount: number;
  unsignedCount: number;
};

export function StartChallengeCard({ challengeId, signedCount, unsignedCount }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const label = signedCount <= 1 ? "혼자 시작하기" : "서명한 멤버로 시작하기";

  function start() {
    startTransition(async () => {
      try {
        const res = await startChallengeWithSignedParticipants({ challengeId });
        if (!res.ok) {
          toast.error(userMessage(res.error));
          return;
        }
        toast.success("챌린지가 시작됐어요.");
        router.replace(`/challenge/${challengeId}?activated=1`);
      } catch (err) {
        console.error("[StartChallengeCard] unexpected throw:", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <Card padding="md" className="border-primary/20 bg-primary/5 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="bg-card text-primary grid size-9 shrink-0 place-items-center rounded-xl"
        >
          <Play className="size-4 fill-current" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="t-h3">시작할 준비가 됐어요</h3>
          <p className="text-muted-foreground mt-1 break-keep text-xs">
            서명한 {signedCount}명으로 지금 시작할 수 있어요.
            {unsignedCount > 0
              ? ` 아직 서명하지 않은 ${unsignedCount}명은 다음 챌린지부터 함께해요.`
              : ""}
          </p>
        </div>
      </div>
      <Button size="lg" className="h-11 w-full" onClick={start} disabled={pending}>
        {pending ? "시작 중..." : label}
      </Button>
    </Card>
  );
}
