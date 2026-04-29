"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { makeUserMessage } from "@/lib/actions/error-messages";
import { PledgeCard } from "./_components/pledge-card";
import { signPledge } from "./_actions";

// pledge 는 unauthorized 시 redirect 하지 않으므로 기본 copy 의 "이동할게요" 표현을 줄이고,
// invalid_input 도 도메인 특정("서약서 정보") copy 로 덮어씀.
const userMessage = makeUserMessage({
  unauthorized: "로그인이 필요해요.",
  invalid_input: "서약서 정보를 확인해 주세요.",
});

// TODO(Day 2): Server 컴포넌트로 전환 + activeChallenge + participants fetch.
const MOCK_PLEDGE = {
  id: "00000000-0000-4000-8000-000000000000",
  title: "주 3회 헬스장",
  goalCount: 3,
  durationDays: 7,
  penaltyAmount: 3000,
  members: [
    { id: "u1", displayName: "나", signed: false },
    { id: "u2", displayName: "민지", signed: true },
    { id: "u3", displayName: "JJ", signed: false },
  ],
} as const;

// PRD §3.3 · Design Brief 화면 3
export default function PledgePage() {
  const consentId = useId();
  const [agreed, setAgreed] = useState(false);
  const [pending, startTransition] = useTransition();
  const self = MOCK_PLEDGE.members[0];

  function submit() {
    startTransition(async () => {
      try {
        const res = await signPledge({ challengeId: MOCK_PLEDGE.id });
        if (!res.ok) {
          const firstField = res.issues
            ? Object.values(res.issues).flat().filter(Boolean)[0]
            : undefined;
          toast.error(firstField ?? userMessage(res.error));
          return;
        }
        toast.success("서명했어요!");
      } catch (err) {
        console.error("[signPledge] unexpected throw:", err);
        toast.error(userMessage("internal_error"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">서약서</h1>
      <PledgeCard {...MOCK_PLEDGE} />

      <label htmlFor={consentId} className="flex items-start gap-3 text-sm">
        <input
          id={consentId}
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 mt-1 size-5"
        />
        <span className="break-keep">
          나 {self.displayName}은(는) 위 조건에 동의합니다. 어긴 경우 공동 통장에 입금할게요.
        </span>
      </label>

      <Button size="lg" className="h-12" onClick={submit} disabled={!agreed || pending}>
        {pending ? "서명 중..." : "서명하고 참여"}
      </Button>
    </div>
  );
}
