// src/app/(app)/challenge/[id]/recap/_components/my-penalty-card.tsx
import { formatKRW } from "@/lib/challenge/penalty";

type Props = {
  doneCount: number;
  goalCount: number;
  viewerAchieved: boolean;
  viewerPerHeadPenalty: number;
  totalPenalty: number;
};

export function MyPenaltyCard({
  doneCount,
  goalCount,
  viewerAchieved,
  viewerPerHeadPenalty,
}: Props) {
  const ratio = Math.min(100, Math.round((doneCount / Math.max(1, goalCount)) * 100));
  return (
    <section className="bg-card rounded-2xl border border-border/60 p-3">
      <p className="text-[10px] tracking-wider text-muted-foreground uppercase">나의 정산</p>
      <div className="mt-1 flex items-baseline justify-between">
        {viewerAchieved ? (
          <p className="text-[15px] font-semibold text-foreground">축하해요! 정산할 금액 없음</p>
        ) : (
          <p className="text-[22px] font-bold text-foreground">{formatKRW(viewerPerHeadPenalty)}</p>
        )}
        <p className="text-[11px] text-muted-foreground">
          {doneCount} / {goalCount}회
        </p>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${ratio}%` }} />
      </div>
    </section>
  );
}
