"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DurationPicker } from "./_components/duration-picker";
import { PenaltyPicker } from "./_components/penalty-picker";
import { createChallenge } from "./_actions";

const GOAL_OPTIONS = [1, 2, 3, 4, 5] as const;

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "로그인이 필요해요. 로그인 화면으로 이동할게요.",
  invalid_input: "입력값을 다시 확인해 주세요.",
};

function userMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

// PRD §3.3 AC-1 · Design Brief 화면 2
export default function NewChallengePage() {
  const router = useRouter();
  const titleId = useId();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("이번 주 운동 서약서");
  const [goalCount, setGoalCount] = useState(3);
  const [durationDays, setDurationDays] = useState(7);
  const [penaltyAmount, setPenaltyAmount] = useState(3000);

  function submit() {
    startTransition(async () => {
      try {
        const res = await createChallenge({
          title,
          type: "fitness",
          goalCount,
          durationDays,
          penaltyAmount,
        });
        if (!res.ok) {
          const firstField = res.issues
            ? Object.values(res.issues).flat().filter(Boolean)[0]
            : undefined;
          toast.error(firstField ?? userMessage(res.error));
          if (res.error === "unauthorized") router.push("/login");
          return;
        }
        if (!res.data?.id) {
          toast.error(userMessage("internal_error"));
          return;
        }
        router.push(`/challenge/${res.data.id}`);
      } catch (err) {
        console.error("[createChallenge] unexpected throw:", err);
        toast.error(userMessage("internal_error"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">새로운 서약서 만들기</h1>

      <div className="flex flex-col gap-2">
        <label htmlFor={titleId} className="text-sm font-semibold">
          서약서 제목
        </label>
        <Input
          id={titleId}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={30}
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">주 목표 횟수</legend>
        <div role="radiogroup" aria-label="주 목표 횟수" className="flex gap-2">
          {GOAL_OPTIONS.map((n) => {
            const checked = goalCount === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => setGoalCount(n)}
                className={cn(
                  "min-h-12 flex-1 rounded-xl border py-3 text-sm font-semibold transition-colors",
                  "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  checked
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                {n}회
              </button>
            );
          })}
        </div>
      </fieldset>

      <DurationPicker value={durationDays} onChange={setDurationDays} />
      <PenaltyPicker value={penaltyAmount} onChange={setPenaltyAmount} />

      <Button size="lg" className="h-12" onClick={submit} disabled={pending}>
        {pending ? "생성 중..." : "다음: 서약서 쓰기"}
      </Button>
    </div>
  );
}
