// 모킹업 §2-B `stats4` — 4 stats (진행중·오늘완료·미인증·내 벌금).
// 컬러 시멘틱: primary(active) · success(완료) · warn(미인증) · gray(내 벌금·확정 누적).
// 4번째 셀(예정 벌금)은 금액이 길어질 수 있어(예: "12,000원") 카운트와 달리 작은 글씨(text-lg)
// + whitespace-nowrap 로 렌더 — grid-cols-4 셀 폭(~83px@390px)을 넘겨 이웃 셀과 겹치는 overflow 방지.
// min-w-0 은 긴 값이 트랙을 밀어내는 grid blowout 을 차단.
// 숫자 행은 h-8(폰트 크기가 달라도 32px 고정·중앙 정렬)로 통일 — 셀 간 라벨 세로 정렬 유지.

import { formatKRWParts } from "@withkey/domain";

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
      <StatCell tone="muted" value={penalty.number} unit={penalty.unit} label="내 벌금" />
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
    <div className="flex min-w-0 flex-col items-center gap-1">
      <span
        className={`flex h-8 items-center whitespace-nowrap font-extrabold tabular-nums ${
          unit ? "text-lg" : "text-2xl"
        } ${TONE_CLASSES[tone]}`}
      >
        {value}
        {unit && <span className="text-muted-foreground ml-0.5 text-xs font-medium">{unit}</span>}
      </span>
      <span className="t-caption">{label}</span>
    </div>
  );
}
