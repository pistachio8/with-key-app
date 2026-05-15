// 모킹업 §3-C 라인 639~646 — primary bg 서약서 카드.

import { goalCountLabel } from "@/lib/challenge/frequency";
import { penaltyLabel } from "@/lib/challenge/penalty";

interface PledgePreviewCardProps {
  title: string;
  durationDays: number;
  goalCount: number;
  penaltyAmount: number;
  ownerName?: string;
  bodyText?: string;
}

const DEFAULT_BODY = (days: number) =>
  `나는 함께한 친구들과의 약속을 가볍게 여기지 않을게요.\n매일 운동을 인증하고, 못한 날은 약속한 벌금을 부담할게요.\n서로를 응원하며 ${days}일을 즐겁게 끝내볼게요.`;

export function PledgePreviewCard({
  title,
  durationDays,
  goalCount,
  penaltyAmount,
  ownerName,
  bodyText,
}: PledgePreviewCardProps) {
  const dateRangeText = formatDateRange(durationDays);
  return (
    <div className="bg-primary text-primary-foreground rounded-[14px] p-5">
      <div className="mb-2 inline-flex items-baseline gap-1 font-bold">
        <span className="text-[18px]">from</span>
        <span className="inline-block h-px w-3 self-center bg-current opacity-60" />
        <span className="text-[18px]">with</span>
      </div>
      <div className="text-[11px] font-bold tracking-[0.05em] opacity-90">PLEDGE · 운영자 작성</div>
      <h3 className="t-h3 mt-1">{title}</h3>
      <p className="mt-2 whitespace-pre-line break-keep text-[11px] leading-relaxed opacity-95">
        {bodyText ?? DEFAULT_BODY(durationDays)}
      </p>
      <dl className="mt-4 flex flex-col gap-1.5 text-[12px]">
        <PledgeRow label="기간" value={`${durationDays}일 · ${dateRangeText}`} />
        <PledgeRow label="인증 빈도" value={goalCountLabel(goalCount).detail} />
        <PledgeRow label="벌금" value={penaltyLabel(penaltyAmount)} />
        {ownerName && <PledgeRow label="작성자" value={ownerName} />}
      </dl>
    </div>
  );
}

function PledgeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-t border-white/20 pt-1.5">
      <dt className="opacity-80">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function formatDateRange(durationDays: number): string {
  const start = new Date();
  const end = new Date();
  end.setDate(start.getDate() + durationDays);
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${fmt(start)} ~ ${fmt(end)}`;
}
