// PRD §10 화면 8 · §1.2 "예정 벌금 · POC 는 표시만".

import { formatKRW } from "@/lib/challenge/penalty";

interface RecapStatsRowProps {
  viewerDoneCount: number;
  goalCount: number;
  viewerPerHeadPenalty: number;
}

export function RecapStatsRow({
  viewerDoneCount,
  goalCount,
  viewerPerHeadPenalty,
}: RecapStatsRowProps) {
  return (
    <section aria-label="내 주간 통계" className="grid grid-cols-2 gap-3">
      <div className="bg-muted/40 rounded-lg p-4">
        <p className="text-muted-foreground text-xs font-medium">내 인증</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {viewerDoneCount} / {goalCount}
        </p>
      </div>
      <div className="bg-muted/40 rounded-lg p-4">
        <p className="text-muted-foreground text-xs font-medium">예상 벌금</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {formatKRW(viewerPerHeadPenalty)}
        </p>
        <p className="text-muted-foreground mt-1 text-[11px]">표시 전용 · 실제 결제 없음</p>
      </div>
    </section>
  );
}
