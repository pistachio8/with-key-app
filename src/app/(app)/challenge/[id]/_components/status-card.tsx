// 모킹업 §6 상단 — primary bg 상태 카드.
// "FROM·WITH · 운영자 {name}" 라벨 + 챌린지 이름 + 사회증명 (#33).

import { goalCountLabel } from "@/lib/challenge/frequency";
import { penaltyLabel } from "@/lib/challenge/penalty";

interface StatusCardProps {
  title: string;
  status: "pending" | "accepted" | "active" | "closed";
  goalCount: number;
  durationDays: number;
  penaltyAmount: number;
  participantCount: number;
  ownerName: string;
  daysLeft: number | null;
}

export function StatusCard({
  title,
  status,
  goalCount,
  durationDays,
  penaltyAmount,
  participantCount,
  ownerName,
  daysLeft,
}: StatusCardProps) {
  const isSolo = participantCount === 1;
  const socialProof = isSolo
    ? "혼자 시작했어요 · 친구를 초대해보세요"
    : `${participantCount}명이 함께해요`;
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
