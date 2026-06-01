// 모킹업 §3-C 라인 639~646 — primary bg 서약서 카드.

import { Stamp } from "@/components/ui/stamp";
import { goalCountLabel } from "@/lib/challenge/frequency";
import { penaltyLabel } from "@/lib/challenge/penalty";
import { formatPledgeDateRange } from "@/lib/challenge/pledge-date-range";

interface PledgePreviewCardProps {
  title: string;
  durationDays: number;
  goalCount: number;
  penaltyAmount: number;
  startAt?: string | null;
  endAt?: string | null;
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
  startAt,
  endAt,
  ownerName,
  bodyText,
}: PledgePreviewCardProps) {
  const { text: dateRangeText, isEstimate } = formatPledgeDateRange({
    durationDays,
    startAt: startAt ?? null,
    endAt: endAt ?? null,
  });
  const dateLabel = isEstimate ? `예정 ${dateRangeText}` : dateRangeText;
  return (
    <div className="bg-primary text-primary-foreground relative rounded-[14px] p-5">
      <Stamp variant="wordmark" tone="onPrimary" className="absolute right-3 top-3 size-14" />
      <div className="text-[11px] font-bold tracking-[0.05em] opacity-90">PLEDGE · 운영자 작성</div>
      <h3 className="t-h3 mt-1">{title}</h3>
      <p className="mt-2 whitespace-pre-line break-keep text-[11px] leading-relaxed opacity-95">
        {bodyText ?? DEFAULT_BODY(durationDays)}
      </p>
      <dl className="mt-4 flex flex-col gap-1.5 text-[12px]">
        <PledgeRow label="기간" value={`${durationDays}일 · ${dateLabel}`} />
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
