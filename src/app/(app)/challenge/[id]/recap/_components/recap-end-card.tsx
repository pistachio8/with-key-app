// 모킹업 §11 - "최종 벌금" 강조 카드. primary tone Card 활용.

import { Card } from "@/components/ui/card";
import { formatKRW } from "@/lib/challenge/penalty";

interface RecapEndCardProps {
  totalPenalty: number;
  viewerPerHeadPenalty: number;
}

export function RecapEndCard({ totalPenalty, viewerPerHeadPenalty }: RecapEndCardProps) {
  return (
    <Card tone="primary" padding="lg" className="flex flex-col gap-2 text-center">
      <p className="text-primary-foreground/85 text-[12px] font-medium">최종 벌금</p>
      <p className="text-3xl font-bold tabular-nums">{formatKRW(totalPenalty)}</p>
      <p className="text-primary-foreground/85 text-[11px]">
        내 몫 {formatKRW(viewerPerHeadPenalty)} · 표시 전용 · 실제 결제 없음
      </p>
    </Card>
  );
}
