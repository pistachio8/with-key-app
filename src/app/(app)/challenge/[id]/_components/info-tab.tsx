// 모킹업 §9-B 정보 탭 — 서약서 미리보기 + info-row + 초대 링크 트리거.

import { PledgePreviewCard } from "@/components/pledge/pledge-preview-card";
import { Card } from "@/components/ui/card";
import { goalCountLabel } from "@/lib/challenge/frequency";
import { penaltyLabel, formatKRW } from "@/lib/challenge/penalty";
import type { ChallengeDetailView } from "@/lib/db/reads/challenge-detail";

interface InfoTabProps {
  detail: ChallengeDetailView;
  ownerName: string;
  inviteSlot?: React.ReactNode;
  accountSlot?: React.ReactNode;
  startSlot?: React.ReactNode;
}

export function InfoTab({ detail, ownerName, inviteSlot, accountSlot, startSlot }: InfoTabProps) {
  return (
    <div className="flex flex-col gap-3">
      <PledgePreviewCard
        title={detail.title}
        durationDays={detail.durationDays}
        goalCount={detail.goalCount}
        penaltyAmount={detail.penaltyAmount}
        ownerName={ownerName}
      />
      <Card padding="md" className="flex flex-col gap-2">
        <h3 className="t-h3">정보</h3>
        <InfoRow label="기간" value={`${detail.durationDays}일`} />
        <InfoRow label="인증 빈도" value={goalCountLabel(detail.goalCount).detail} />
        <InfoRow label="벌금" value={penaltyLabel(detail.penaltyAmount)} />
        <InfoRow label="참여 인원" value={`${detail.participantCount}명`} />
        <InfoRow label="모인 예정 벌금" value={formatKRW(detail.potTotal)} />
      </Card>
      {startSlot}
      {inviteSlot}
      {accountSlot}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border/50 flex items-center justify-between border-t pt-2 first:border-t-0 first:pt-0">
      <span className="t-sub">{label}</span>
      <span className="t-body font-semibold tabular-nums">{value}</span>
    </div>
  );
}
