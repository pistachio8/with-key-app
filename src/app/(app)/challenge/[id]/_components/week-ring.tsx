// spec C6 — 이번 주 진척 링(작은 게이지) + 동적 카피.
// 평소: "{shortfall}번 더 채우면 추가 벌금 0원"(긍정). imminent: "이대로면 +N원" 추가.
// unreachable(회복 불가): "이번 주 목표 달성 불가" + "종료 시 +N 확정" — 회복 가능한 척하지 않는다.
// 카피는 동적 — literal "3번" 금지(goalCount 1~7·자투리에 따라 가변).
import { formatKRW } from "@/lib/challenge/penalty";
import type { CurrentWeekStatus } from "@/lib/challenge/weekly";

const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function WeekRing({ status }: { status: CurrentWeekStatus }) {
  const pct = status.goal > 0 ? Math.min(1, status.done / status.goal) : 0;
  const dashOffset = CIRCUMFERENCE * (1 - pct);
  const headline = status.unreachable
    ? "이번 주 목표 달성 불가"
    : status.shortfall > 0
      ? `${status.shortfall}번 더 채우면 추가 벌금 0원`
      : "이번 주 목표를 채웠어요";
  const strokeClass = status.unreachable ? "stroke-brand-warn" : "stroke-primary";

  return (
    <div className="flex items-center gap-4 rounded-[14px] border p-4">
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
        <circle cx="32" cy="32" r={RADIUS} fill="none" strokeWidth="6" className="stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={RADIUS}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 32 32)"
          className={`${strokeClass} transition-[stroke-dashoffset]`}
        />
        <text
          x="32"
          y="36"
          textAnchor="middle"
          className="fill-foreground text-[14px] font-bold tabular-nums"
        >
          {status.done}/{status.goal}
        </text>
      </svg>
      <div className="flex flex-col gap-0.5">
        <p className="t-caption text-muted-foreground">이번 주 진척</p>
        <p className="t-body font-semibold break-keep">{headline}</p>
        {status.atRiskAmount > 0 &&
          (status.unreachable ? (
            <p className="t-caption text-brand-warn font-semibold">
              종료 시 +{formatKRW(status.atRiskAmount)} 확정
            </p>
          ) : status.imminent ? (
            <p className="t-caption text-brand-warn font-semibold">
              이대로면 +{formatKRW(status.atRiskAmount)}
            </p>
          ) : null)}
      </div>
    </div>
  );
}
