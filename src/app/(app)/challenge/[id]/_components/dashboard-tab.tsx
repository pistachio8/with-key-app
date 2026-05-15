// 모킹업 §8-B 현황판 탭 — primary bg status-card (누적 벌금 + KPI pills) + 멤버 strip.

import { Card } from "@/components/ui/card";
import { MemberStrip } from "./member-strip";
import type { ChallengeMemberView } from "@/lib/db/reads/challenge-detail";

interface DashboardTabProps {
  totalPenalty: number;
  totalActions: number;
  totalFailures: number;
  daysRemaining: number | null;
  members: ReadonlyArray<ChallengeMemberView>;
  goalCount: number;
}

export function DashboardTab({
  totalPenalty,
  totalActions,
  totalFailures,
  daysRemaining,
  members,
  goalCount,
}: DashboardTabProps) {
  return (
    <div className="flex flex-col gap-3">
      <Card tone="primary" padding="lg" className="text-center">
        <div className="text-[12px] opacity-85">누적 벌금</div>
        <div className="mt-1 text-[32px] font-extrabold tracking-tight tabular-nums">
          {totalPenalty.toLocaleString()}
          <sub className="ml-1 align-baseline text-[14px] font-semibold opacity-90">원</sub>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <KpiPill label={`총 인증 ${totalActions}회`} />
          <KpiPill label={`실패 ${totalFailures}회`} />
          <KpiPill label={daysRemaining != null ? `남은 ${daysRemaining}일` : "종료"} />
        </div>
      </Card>
      <MemberStrip goalCount={goalCount} members={members} />
    </div>
  );
}

function KpiPill({ label }: { label: string }) {
  return (
    <div className="rounded-[10px] bg-white/15 py-2 text-center text-[11px] font-semibold text-white tabular-nums">
      {label}
    </div>
  );
}
