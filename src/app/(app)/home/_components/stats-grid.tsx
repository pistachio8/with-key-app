// 모킹업 §2-B `stats4` — 4 stats (진행중·오늘완료·미인증·총벌금).
// 컬러 시멘틱: primary(active) · success(완료) · warn(미인증) · gray(누적 벌금).
// 4번째 셀은 number/"원" 분리 렌더로 iPhone 13 Pro (390px) 에서 줄바꿈 회피.

import { formatKRWParts } from "@/lib/challenge/penalty";

type Props = {
  activeCount: number;
  completedToday: number;
  pendingToday: number;
  totalPenalty: number;
};

type Tone = "primary" | "success" | "warn" | "muted";

const TONE_CLASSES: Record<Tone, string> = {
  primary: "text-primary",
  success: "text-brand-success",
  warn: "text-brand-warn",
  muted: "text-muted-foreground",
};

export function StatsGrid({ activeCount, completedToday, pendingToday, totalPenalty }: Props) {
  const penalty = formatKRWParts(totalPenalty);
  return (
    <section
      aria-label="오늘 챌린지 현황"
      className="bg-card grid grid-cols-4 rounded-2xl border p-3"
    >
      <StatCell tone="primary" value={String(activeCount)} label="진행 중" />
      <StatCell tone="success" value={String(completedToday)} label="오늘 완료" />
      <StatCell tone="warn" value={String(pendingToday)} label="미인증" />
      <StatCell tone="muted" value={penalty.number} unit={penalty.unit} label="총 벌금" />
    </section>
  );
}

function StatCell({
  tone,
  value,
  unit,
  label,
}: {
  tone: Tone;
  value: string;
  unit?: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`text-2xl font-extrabold tabular-nums ${TONE_CLASSES[tone]}`}>
        {value}
        {unit && <span className="text-muted-foreground ml-0.5 text-xs font-medium">{unit}</span>}
      </span>
      <span className="t-caption">{label}</span>
    </div>
  );
}
