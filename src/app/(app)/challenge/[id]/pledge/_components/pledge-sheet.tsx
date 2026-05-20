"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import { PledgePreviewCard } from "@/app/(app)/challenge/new/_components/pledge-preview-card";
import { PledgeSigningCanvas } from "@/app/(app)/challenge/new/_components/pledge-signing-canvas";
import type { PledgeView } from "@/lib/db/reads/pledge";
import { signPledge } from "../_actions";

const userMessage = makeUserMessage({
  unauthorized: "로그인이 필요해요.",
  invalid_input: "서약서 정보를 확인해 주세요.",
});

type Props = {
  pledge: PledgeView;
  currentUserId: string;
};

// 모킹업 §6-B — 멤버 서명. 서명 후 challenge 상세로 redirect (?just_joined=1).
export function PledgeSheet({ pledge, currentUserId }: Props) {
  const router = useRouter();
  const consentId = useId();
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const myName = pledge.members.find((m) => m.id === currentUserId)?.displayName ?? "익명";
  const isSolo = pledge.members.length === 1;
  const owner = pledge.members.find((m) => m.id !== currentUserId)?.displayName;

  function submit() {
    if (!signature) {
      toast.error("서명을 그려주세요");
      return;
    }
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
        router.replace(`/challenge/${pledge.id}?just_joined=1`);
      } catch (err) {
        console.error("[signPledge] unexpected throw:", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="t-h2">서약서</h1>
      <PledgePreviewCard
        title={pledge.title}
        durationDays={pledge.durationDays}
        goalCount={pledge.goalCount}
        penaltyAmount={pledge.penaltyAmount}
        ownerName={owner}
      />
      <PledgeSigningCanvas onChange={setSignature} />
      <label htmlFor={consentId} className="flex items-start gap-3 text-sm">
        <input
          id={consentId}
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="focus-visible:ring-ring mt-1 size-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        />
        <span className="break-keep">
          나 {myName}은(는) 위 조건에 동의합니다. 어긴 경우{" "}
          {isSolo ? "본인과의 약속대로 지정 계좌에" : "공동 통장에"} 입금할게요.
        </span>
      </label>
      <Button
        size="lg"
        className="h-12"
        onClick={submit}
        disabled={!agreed || !signature || pending}
      >
        {pending ? "서명 중..." : "서명하고 참여"}
      </Button>
    </div>
  );
}
