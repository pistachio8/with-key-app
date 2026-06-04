"use client";

// 모킹업 §10-B/C — 인증 결과 모달 3 variant (completed/first-success/goal-reached).
// §10-D "실패" 모달(#35)은 제거됨: 회복 불가(unreachable)는 인증을 멈춘 give-up 케이스라
// 제출 시점 모달로는 잡히지 않는다 — 감지는 대시보드 on-read + 일 경계 푸시가 담당한다.

import { useState } from "react";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DaySlider } from "./day-slider";
import { ConfettiBurst } from "./confetti-burst";
import type { ActivityType } from "@/lib/keywords/pool";
import { completedTitle, firstSuccessTitle } from "./action-result-copy";

export type ActionResultVariant = "completed" | "first-success" | "goal-reached";

interface ActionResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: ActionResultVariant;
  challengeId: string;
  // completed / first-success 활동별 문구용
  activityType?: ActivityType;
  // completed / goal-reached variant 전용
  currentDay?: number;
  totalDays?: number;
  verifiedDays?: number[];
  goalCount?: number;
}

export function ActionResultDialog({
  open,
  onOpenChange,
  variant,
  challengeId,
  activityType = "other",
  currentDay,
  totalDays,
  verifiedDays,
  goalCount,
}: ActionResultDialogProps) {
  const router = useRouter();

  function handleConfirm() {
    onOpenChange(false);
    // F7: 챌린지 상세 피드 탭 (default tab=feed).
    router.replace(`/challenge/${challengeId}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-sm">
        {variant === "completed" && (
          <CompletedBody
            activityType={activityType}
            currentDay={currentDay ?? 1}
            totalDays={totalDays ?? 1}
            verifiedDays={verifiedDays ?? []}
          />
        )}
        {variant === "first-success" && <FirstSuccessBody activityType={activityType} />}
        {variant === "goal-reached" && (
          <GoalReachedBody
            currentDay={currentDay ?? 1}
            totalDays={totalDays ?? 1}
            verifiedDays={verifiedDays ?? []}
            goalCount={goalCount ?? 1}
          />
        )}
        <footer className="mt-2 flex gap-2">
          <Button className="h-11 w-full" onClick={handleConfirm}>
            확인
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function CompletedBody({
  activityType,
  currentDay,
  totalDays,
  verifiedDays,
}: {
  activityType: ActivityType;
  currentDay: number;
  totalDays: number;
  verifiedDays: number[];
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="bg-brand-primary-soft text-primary flex size-[70px] items-center justify-center rounded-full">
        <Check className="size-9" aria-hidden="true" />
      </div>
      <DialogTitle className="t-h2">{completedTitle(activityType)}</DialogTitle>
      <DialogDescription className="t-sub leading-relaxed">
        매일 한 걸음씩 쌓이고 있어요 💪
      </DialogDescription>
      <div className="mt-3 w-full">
        <DaySlider totalDays={totalDays} currentDay={currentDay} verifiedDays={verifiedDays} />
      </div>
    </div>
  );
}

function FirstSuccessBody({ activityType }: { activityType: ActivityType }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="bg-brand-secondary-soft flex size-[80px] items-center justify-center rounded-full text-[34px]">
        🎉
      </div>
      <DialogTitle className="t-h2">{firstSuccessTitle(activityType)}</DialogTitle>
      <DialogDescription className="t-sub leading-relaxed">
        이제부터 매일 인증을 이어가보세요 💪
      </DialogDescription>
    </div>
  );
}

function GoalReachedBody({
  currentDay,
  totalDays,
  verifiedDays,
  goalCount,
}: {
  currentDay: number;
  totalDays: number;
  verifiedDays: number[];
  goalCount: number;
}) {
  const [fire, setFire] = useState(false);
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="bg-brand-secondary-soft flex size-[80px] items-center justify-center rounded-full text-[34px]">
        🎉
      </div>
      <DialogTitle className="t-h2">챌린지 성공!</DialogTitle>
      <DialogDescription className="t-sub leading-relaxed">
        목표 {goalCount}회를 모두 채웠어요 💪
      </DialogDescription>
      <div className="mt-3 w-full">
        <DaySlider
          totalDays={totalDays}
          currentDay={currentDay}
          verifiedDays={verifiedDays}
          onArrive={() => setFire(true)}
        />
      </div>
      <ConfettiBurst fire={fire} />
    </div>
  );
}
