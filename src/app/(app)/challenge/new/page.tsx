"use client";

import { useId, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import { FrequencyStepper } from "./_components/frequency-stepper";
import { EndDatePicker } from "./_components/end-date-picker";
import { PenaltyPicker } from "./_components/penalty-picker";
import { PledgePreviewCard } from "./_components/pledge-preview-card";
import { PledgeSigningCanvas } from "./_components/pledge-signing-canvas";
import { CreationCompleteSheet } from "./_components/creation-complete-sheet";
import { createChallenge } from "./_actions";

type Step = 1 | 2 | 3;

const userMessage = makeUserMessage();

// 모킹업 §3 — 2-step wizard + 완료 시트.
export default function NewChallengePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // 옛 ?groupId= 진입은 그 그룹에 챌린지. 그 외엔 ADR-0003 자동 그룹.
  const groupId = searchParams.get("groupId") ?? null;
  const titleId = useId();

  const [step, setStep] = useState<Step>(1);
  const [title, setTitle] = useState("이번 주 운동 서약서");
  const [goalCount, setGoalCount] = useState(7);
  const [durationDays, setDurationDays] = useState(7);
  const [penaltyAmount, setPenaltyAmount] = useState(3000);
  const [signature, setSignature] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function gotoStep2() {
    if (!title.trim()) {
      toast.error("챌린지 이름을 입력해 주세요");
      return;
    }
    setStep(2);
  }

  function back() {
    if (step === 1) router.back();
    else setStep((step - 1) as Step);
  }

  function submit() {
    if (!signature) {
      toast.error("서명을 그려주세요");
      return;
    }
    startTransition(async () => {
      try {
        const res = await createChallenge({
          groupId: groupId ?? undefined,
          title,
          type: "fitness",
          goalCount,
          durationDays,
          penaltyAmount,
          ownerSignatureDataUrl: signature,
        });
        if (!res.ok) {
          const firstField = res.issues
            ? Object.values(res.issues).flat().filter(Boolean)[0]
            : undefined;
          toast.error(firstField ?? userMessage(res.error));
          if (res.error === "unauthorized") router.push("/login");
          return;
        }
        setCreatedId(res.data.id);
        setInviteUrl(res.data.inviteUrl);
        setStep(3);
      } catch (err) {
        console.error("[createChallenge] unexpected throw:", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  return (
    <div className="flex min-h-svh flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <button
          type="button"
          onClick={back}
          aria-label="뒤로"
          className="hover:bg-muted focus-visible:ring-ring -ml-2 inline-flex size-9 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <span className="t-body font-semibold">새 챌린지</span>
        <span className="t-sub tabular-nums">{step === 3 ? "완료" : `${step}/2`}</span>
      </header>

      {step === 1 && (
        <>
          <h1 className="t-h1 mt-2 break-keep">
            어떤 약속을
            <br />
            만들어 볼까요?
          </h1>
          <p className="t-sub -mt-2">운동이 아닌 다른 습관도 OK</p>

          <div className="mt-2 flex flex-col gap-1.5">
            <label htmlFor={titleId} className="t-caption">
              챌린지 이름
            </label>
            <Input
              id={titleId}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={30}
              placeholder="예: 30일 헬스장 출석"
            />
          </div>

          <FrequencyStepper value={goalCount} onChange={setGoalCount} />
          <EndDatePicker value={durationDays} onChange={setDurationDays} />
          <PenaltyPicker value={penaltyAmount} onChange={setPenaltyAmount} />

          <Card tone="muted" padding="sm" className="text-[11px]">
            벌금은 챌린지 종료 시 미달성자가 균등 분담해요 (POC: 표시만)
          </Card>

          <div className="mt-auto pt-4">
            <Button size="lg" className="h-12 w-full" onClick={gotoStep2} disabled={!title.trim()}>
              다음: 서약서 쓰기
            </Button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="t-h2 mt-2">서약서를 확인해주세요</h1>
          <p className="t-sub -mt-1">친구들에게 보여줄 약속이에요</p>
          <PledgePreviewCard
            title={title}
            durationDays={durationDays}
            goalCount={goalCount}
            penaltyAmount={penaltyAmount}
          />
          <PledgeSigningCanvas onChange={setSignature} />
          <div className="mt-auto pt-4">
            <Button
              size="lg"
              className="h-12 w-full"
              onClick={submit}
              disabled={!signature || pending}
            >
              {pending ? "생성 중..." : "서명하고 챌린지 만들기"}
            </Button>
          </div>
        </>
      )}

      {step === 3 && createdId && inviteUrl && (
        <CreationCompleteSheet challengeId={createdId} inviteUrl={inviteUrl} />
      )}
    </div>
  );
}
