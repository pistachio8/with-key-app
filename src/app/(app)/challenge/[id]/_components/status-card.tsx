// 모킹업 §6 상단 — primary bg 상태 카드.
// socialProof 는 status × isSolo × isOwner 3축으로 분기 (spec C4).

import { goalCountLabel } from "@/lib/challenge/frequency";
import { penaltyLabel } from "@/lib/challenge/penalty";

interface StatusCardProps {
  title: string;
  status: "pending" | "accepted" | "active" | "closed";
  goalCount: number;
  durationDays: number;
  penaltyAmount: number;
  participantCount: number;
  signedCount: number;
  isOwner: boolean;
  ownerName: string;
  daysLeft: number | null;
}

function socialProofFor(
  status: StatusCardProps["status"],
  participantCount: number,
  signedCount: number,
  isOwner: boolean,
): string {
  const isSolo = participantCount === 1;
  if (status === "pending") {
    if (isSolo) return isOwner ? "서명 대기 · 지금 초대하면 함께 시작해요" : "서명 대기 중";
    return `${signedCount}/${participantCount}명 서명`;
  }
  if (status === "accepted") {
    return `${participantCount}명 모두 서명 완료 · 곧 시작`;
  }
  if (status === "active") {
    if (isSolo) return isOwner ? "혼자 시작했어요 · 다음 챌린지엔 함께해요" : "혼자 진행 중";
    return `${participantCount}명이 함께해요`;
  }
  // closed
  return isSolo ? "혼자 마쳤어요" : `${participantCount}명이 함께했어요`;
}

export function StatusCard({
  title,
  status,
  goalCount,
  durationDays,
  penaltyAmount,
  participantCount,
  signedCount,
  isOwner,
  ownerName,
  daysLeft,
}: StatusCardProps) {
  const socialProof = socialProofFor(status, participantCount, signedCount, isOwner);
  const meta = `${goalCountLabel(goalCount).detail} · ${durationDays}일 · ${penaltyLabel(penaltyAmount)}`;
  const dayLabel =
    status === "active" && daysLeft !== null
      ? `D-${daysLeft}`
      : status === "pending"
        ? "서명 대기"
        : status === "accepted"
          ? "곧 시작"
          : "종료";

  return (
    <section className="bg-primary text-primary-foreground rounded-[14px] p-5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold tracking-[0.05em] opacity-90">
          FROM · WITH · 운영자 {ownerName}
        </div>
        <span className="t-caption text-primary-foreground/85 tabular-nums">{dayLabel}</span>
      </div>
      <h1 className="t-h2 mt-1">{title}</h1>
      <p className="t-sub text-primary-foreground/85 mt-2">{meta}</p>
      <p className="t-caption text-primary-foreground/85 mt-3">{socialProof}</p>
    </section>
  );
}
