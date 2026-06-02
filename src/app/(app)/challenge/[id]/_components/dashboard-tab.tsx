// spec C6 현황판 H3 — 누적 금액(확정·단조) + viewer 주차 칩 + 이번 주 링 + 멤버 strip(유지).
// D-day·기간은 헤더(StatusCard)에 통합돼 있어 여기서는 중복 표시하지 않는다.

import { Card } from "@/components/ui/card";
import { MemberStrip } from "./member-strip";
import { WeekChips } from "./week-chips";
import { WeekRing } from "./week-ring";
import type { ChallengePhase } from "@/lib/challenge/lifecycle";
import type { ChallengeMemberView } from "@/lib/db/reads/challenge-detail";
import type { WeekChip, CurrentWeekStatus } from "@/lib/challenge/weekly";

interface DashboardTabProps {
  potTotal: number; // 그룹 확정 누적(단조)
  weeks: ReadonlyArray<WeekChip>; // viewer 주차 칩
  currentWeek: CurrentWeekStatus | null; // viewer 이번 주(running 일 때만)
  daysRemaining: number | null;
  phase: ChallengePhase;
  goalCount: number;
  members: ReadonlyArray<ChallengeMemberView>;
}

export function DashboardTab({
  potTotal,
  weeks,
  currentWeek,
  goalCount,
  members,
}: DashboardTabProps) {
  return (
    <div className="flex flex-col gap-3">
      <Card tone="primary" padding="lg" className="text-center">
        <div className="text-[12px] opacity-85">모인 벌금</div>
        <div className="mt-1 text-[32px] font-extrabold tracking-tight tabular-nums">
          {potTotal.toLocaleString()}
          <sub className="ml-1 align-baseline text-[14px] font-semibold opacity-90">원</sub>
        </div>
      </Card>

      {weeks.length > 0 && (
        <Card padding="md" className="flex flex-col gap-3">
          <h3 className="t-h3">주차 기록</h3>
          <WeekChips weeks={weeks} />
        </Card>
      )}

      {currentWeek && <WeekRing status={currentWeek} />}

      <MemberStrip goalCount={goalCount} members={members} />
    </div>
  );
}
