"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import type { PledgeView } from "@/lib/db/reads/pledge";
import { PledgeCard } from "./pledge-card";
import { signPledge } from "../_actions";

const userMessage = makeUserMessage({
  unauthorized: "로그인이 필요해요.",
  invalid_input: "서약서 정보를 확인해 주세요.",
});

type Props = {
  pledge: PledgeView;
  currentUserId: string;
};

export function PledgeSheet({ pledge, currentUserId }: Props) {
  const consentId = useId();
  const [agreed, setAgreed] = useState(false);
  const [pending, startTransition] = useTransition();

  const myName = pledge.members.find((m) => m.id === currentUserId)?.displayName ?? "익명";

  function submit() {
    startTransition(async () => {
      try {
        const res = await signPledge({ challengeId: pledge.id });
        if (!res.ok) {
          const firstField = res.issues
            ? Object.values(res.issues).flat().filter(Boolean)[0]
            : undefined;
          toast.error(firstField ?? userMessage(res.error));
          return;
        }
        if (res.data.status === "active") {
          toast.success("전원 서명 완료! 챌린지가 시작됐어요.");
        } else {
          toast.success("서명했어요!");
        }
      } catch (err) {
        console.error("[signPledge] unexpected throw:", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">서약서</h1>
      <PledgeCard
        title={pledge.title}
        goalCount={pledge.goalCount}
        durationDays={pledge.durationDays}
        penaltyAmount={pledge.penaltyAmount}
        members={pledge.members}
      />

      {pledge.mySigned ? (
        <p className="text-muted-foreground text-center text-sm">이미 서명했어요.</p>
      ) : (
        <>
          <label htmlFor={consentId} className="flex items-start gap-3 text-sm">
            <input
              id={consentId}
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 mt-1 size-5"
            />
            <span className="break-keep">
              나 {myName}은(는) 위 조건에 동의합니다. 어긴 경우 공동 통장에 입금할게요.
            </span>
          </label>

          <Button size="lg" className="h-12" onClick={submit} disabled={!agreed || pending}>
            {pending ? "서명 중..." : "서명하고 참여"}
          </Button>
        </>
      )}
    </div>
  );
}
