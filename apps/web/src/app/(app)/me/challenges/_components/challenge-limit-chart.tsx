// 모킹업 §12-B - 최대 5개 운영 슬롯 차트. POC 정책(백로그 #5)으로 안내만, 서버 enforce 없음.

import { cn } from "@/lib/utils";

interface ChallengeLimitChartProps {
  current: number;
  max: number;
}

export function ChallengeLimitChart({ current, max }: ChallengeLimitChartProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="t-sub">운영 가능 슬롯</span>
        <span className="t-body font-semibold tabular-nums">
          {current} / {max}
        </span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: max }, (_, i) => (
          <div
            key={i}
            className={cn(
              "h-2 flex-1 rounded-full transition-colors",
              i < current ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>
      {current >= max && (
        <p className="text-destructive text-[11px]">
          최대 {max}개까지 운영할 수 있어요. 진행 중 챌린지를 종료해 주세요.
        </p>
      )}
    </div>
  );
}
