"use client";

// 모킹업 §10-B/C/D — 인증 결과 모달 4 variant (실제 PR6 trigger: completed/first-success 2종).
// §10-D 실패 모달은 #35 인증 실패 감지 결정 후 PR에서 trigger 연결.

import { useState } from "react";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DaySlider } from "./day-slider";
import { ConfettiBurst } from "./confetti-burst";
import type { ActivityType } from "@/lib/keywords/pool";
import { completedTitle, firstSuccessTitle } from "./action-result-copy";

export type ActionResultVariant = "completed" | "first-success" | "goal-reached" | "failed";

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
  // failed variant 전용 — #35 결정 후 채움
  penaltyAdded?: number;
  penaltyTotal?: number;
  failedDateLabel?: string;
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
  penaltyAdded,
  penaltyTotal,
  failedDateLabel,
}: ActionResultDialogProps) {
  const router = useRouter();

  function handleConfirm() {
    onOpenChange(false);
    // F7: 챌린지 상세 피드 탭 (default tab=feed).
    router.replace(`/challenge/${challengeId}`);
  }
  function handleViewDashboard() {
    onOpenChange(false);
    // F8: 현황판 탭 (?tab=dashboard).
    router.replace(`/challenge/${challengeId}/dashboard`);
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
        {variant === "failed" && (
          <FailedBody
            penaltyAdded={penaltyAdded ?? 0}
            penaltyTotal={penaltyTotal ?? 0}
            failedDateLabel={failedDateLabel ?? ""}
          />
        )}
        <footer className="mt-2 flex gap-2">
          {variant === "failed" ? (
            <>
              <Button variant="outline" className="h-11 flex-1" onClick={handleConfirm}>
                닫기
              </Button>
              <Button className="h-11 flex-1" onClick={handleViewDashboard}>
                내 현황 보기
              </Button>
            </>
          ) : (
            <Button className="h-11 w-full" onClick={handleConfirm}>
              확인
            </Button>
          )}
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

function FailedBody({
  penaltyAdded,
  penaltyTotal,
  failedDateLabel,
}: {
  penaltyAdded: number;
  penaltyTotal: number;
  failedDateLabel: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="bg-brand-secondary-soft flex size-[80px] items-center justify-center rounded-full text-[34px]">
        😢
      </div>
      <DialogTitle className="t-h2">오늘 인증 실패</DialogTitle>
      {failedDateLabel && (
        <DialogDescription className="t-sub">
          {failedDateLabel} 인증 마감을 놓쳤어요
        </DialogDescription>
      )}
      <Card tone="muted" padding="md" className="mt-2 grid w-full grid-cols-2 gap-2 text-left">
        <div>
          <div className="text-muted-foreground text-[10px]">벌금 추가</div>
          <div className="text-destructive mt-0.5 text-[14px] font-bold tabular-nums">
            + {penaltyAdded.toLocaleString()}원
          </div>
        </div>
        <div className="text-right">
          <div className="text-muted-foreground text-[10px]">누적 벌금</div>
          <div className="text-foreground mt-0.5 text-[14px] font-bold tabular-nums">
            {penaltyTotal.toLocaleString()}원
          </div>
        </div>
      </Card>
    </div>
  );
}
