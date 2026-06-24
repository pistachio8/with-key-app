"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import { FrequencyStepper } from "./frequency-stepper";
import { EndDatePicker } from "./end-date-picker";
import { PenaltyPicker } from "./penalty-picker";
import { PledgePreviewCard } from "@/components/pledge/pledge-preview-card";
import { PledgeSigningCanvas } from "@/components/pledge/pledge-signing-canvas";
import { createChallenge } from "../_actions";

type Step = 1 | 2;

export type ChallengeFormGroupOption = {
  id: string;
  name: string | null;
  // PRD AC-1 — 그룹당 open 챌린지는 1개. 값이 있으면 그 그룹은 select 에서 disabled.
  openChallengeId: string | null;
};

interface NewChallengeFormProps {
  ownerGroups: ReadonlyArray<ChallengeFormGroupOption>;
  initialGroupId: string | null;
}

const userMessage = makeUserMessage({
  forbidden: "그룹장만 챌린지를 만들 수 있어요",
  conflict: "이미 진행 중인 챌린지가 있어요",
  invalid_input: "그룹과 챌린지 정보를 다시 확인해 주세요",
});

function groupName(name: string | null): string {
  return name ?? "이름 없는 그룹";
}

// 모킹업 §3 — 2-step wizard. 생성 완료 시트는 별도 segment `done/[id]` 에서 렌더.
export function NewChallengeForm({ ownerGroups, initialGroupId }: NewChallengeFormProps) {
  const router = useRouter();
  const titleId = useId();
  const groupSelectId = useId();

  const [step, setStep] = useState<Step>(1);
  const [title, setTitle] = useState("이번 주 운동 서약서");
  const [selectedGroupId, setSelectedGroupId] = useState(initialGroupId ?? "");
  const [goalCount, setGoalCount] = useState(7);
  const [durationDays, setDurationDays] = useState(7);
  const [penaltyAmount, setPenaltyAmount] = useState(3000);
  // 인증 medium·결과물(spec §C1 / EVAL-0043). image=사진+기존 recap, video=3초 클립+스토리.
  const [feedType, setFeedType] = useState<"image" | "video">("image");
  const [signature, setSignature] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const singleGroup = ownerGroups.length === 1 ? ownerGroups[0] : null;
  const needsGroupSelection = ownerGroups.length >= 2;
  // open 챌린지 있는 그룹은 라벨에 "(진행 중)" 보강 — trigger label 에 mirror 되지만
  // disabled 라 선택 불가이므로 trigger 에는 실제로 표시되지 않는다.
  const groupItems = useMemo<Record<string, string>>(
    () =>
      Object.fromEntries(
        ownerGroups.map((g) => [
          g.id,
          g.openChallengeId ? `${groupName(g.name)} (진행 중)` : groupName(g.name),
        ]),
      ),
    [ownerGroups],
  );

  function gotoStep2() {
    if (!title.trim()) {
      toast.error("챌린지 이름을 입력해 주세요");
      return;
    }
    if (needsGroupSelection && !selectedGroupId) {
      toast.error("그룹을 선택해 주세요");
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
    if (needsGroupSelection && !selectedGroupId) {
      toast.error("그룹을 선택해 주세요");
      setStep(1);
      return;
    }
    startTransition(async () => {
      try {
        // 성공 시 server action 이 redirect(replace) 로 done segment 로 navigate —
        // 본 함수의 후속 코드는 도달하지 않는다. 실패만 ActionResult 로 돌아온다.
        const res = await createChallenge({
          groupId: selectedGroupId || undefined,
          title,
          type: "fitness",
          goalCount,
          durationDays,
          penaltyAmount,
          feedType,
          ownerSignatureDataUrl: signature,
        });
        if (!res.ok) {
          const firstField = res.issues
            ? Object.values(res.issues).flat().filter(Boolean)[0]
            : undefined;
          toast.error(firstField ?? userMessage(res.error));
          if (res.error === "unauthorized") router.push("/login");
        }
      } catch (err) {
        // Next.js redirect throw 는 digest 가 "NEXT_REDIRECT" — framework 가
        // 처리하도록 그대로 re-throw. 그 외 예기치 못한 throw 만 toast.
        if (
          err &&
          typeof err === "object" &&
          "digest" in err &&
          typeof (err as { digest?: unknown }).digest === "string" &&
          (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
        ) {
          throw err;
        }
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
        <span className="t-sub tabular-nums">{`${step}/2`}</span>
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

          {/* native radio — 화살표 키 이동·checked 토글을 브라우저가 처리(WAI-ARIA radiogroup 내장). */}
          <fieldset className="flex flex-col gap-1.5">
            <legend className="t-caption">인증 방식</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: "image", label: "사진", desc: "기존 사진 인증" },
                  { value: "video", label: "3초 영상", desc: "실시간 클립 · 스토리" },
                ] as const
              ).map((opt) => {
                const selected = feedType === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={cn(
                      "focus-within:ring-ring flex cursor-pointer flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 transition focus-within:ring-2",
                      selected
                        ? "border-primary bg-primary/5 ring-primary ring-1"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    <input
                      type="radio"
                      name="feedType"
                      value={opt.value}
                      checked={selected}
                      onChange={() => setFeedType(opt.value)}
                      className="sr-only"
                    />
                    <span className="t-body font-semibold">{opt.label}</span>
                    <span className="text-muted-foreground text-xs">{opt.desc}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {singleGroup && (
            <p className="t-sub rounded-lg border border-dashed px-3 py-2">
              {groupName(singleGroup.name)} 그룹에서 시작
            </p>
          )}

          {needsGroupSelection && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={groupSelectId} className="t-caption">
                그룹
              </label>
              <Select
                value={selectedGroupId}
                onValueChange={(value) => setSelectedGroupId(value ?? "")}
                items={groupItems}
              >
                <SelectTrigger id={groupSelectId}>
                  <SelectValue placeholder="그룹 선택" />
                </SelectTrigger>
                <SelectContent>
                  {ownerGroups.map((group) => (
                    <SelectItem
                      key={group.id}
                      value={group.id}
                      disabled={group.openChallengeId !== null}
                    >
                      {group.openChallengeId
                        ? `${groupName(group.name)} (진행 중)`
                        : groupName(group.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
    </div>
  );
}
