// 모킹업 §8-A 라인 856~859 — "오늘 N/N명 인증" 배너. secondary-soft 톤.

import { Chip } from "@/components/ui/chip";

interface TodayBannerProps {
  todayDoneCount: number;
  participantCount: number;
  todayMissingNames: ReadonlyArray<string>;
}

export function TodayBanner({
  todayDoneCount,
  participantCount,
  todayMissingNames,
}: TodayBannerProps) {
  return (
    <div className="bg-brand-secondary-soft flex items-center gap-2 rounded-[12px] px-3 py-2.5">
      <div className="flex flex-col gap-0.5">
        <div className="text-foreground text-[11px] font-semibold tabular-nums">
          오늘 {todayDoneCount} / {participantCount}명 인증
        </div>
        {todayMissingNames.length > 0 && (
          <div className="text-muted-foreground text-[10px]">
            {todayMissingNames.join(" · ")} 남음
          </div>
        )}
      </div>
      <Chip tone="secondary" className="ml-auto text-[10px]">
        오늘
      </Chip>
    </div>
  );
}
