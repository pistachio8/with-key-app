// 모킹업 §2-B `ch-item` — 진행 중 챌린지 카드 리스트.
// 각 row: 컬러 썸네일 + 제목 + meta(인원·오늘상태·누적 벌금) + D-N. 챌린지 상세로 link.

import Link from "next/link";
import { Activity, Check, Circle, Clock, Users } from "lucide-react";
import { formatKRW } from "@/lib/challenge/penalty";
import { cn } from "@/lib/utils";
import type { GroupChallengeView } from "@/lib/db/reads/current-challenges";
import { RowPendingIndicator } from "./row-pending-indicator";

type ChallengeView = NonNullable<GroupChallengeView["challenge"]>;
type ChallengeStatus = ChallengeView["status"];

type Props = {
  groups: ReadonlyArray<GroupChallengeView>;
};

const THUMB_TONES = [
  "bg-brand-primary-soft text-primary",
  "bg-brand-secondary-soft text-foreground",
] as const;

function pickThumbTone(challengeId: string): string {
  let h = 0;
  for (let i = 0; i < challengeId.length; i++) h = (h * 31 + challengeId.charCodeAt(i)) | 0;
  return THUMB_TONES[Math.abs(h) % THUMB_TONES.length]!;
}

export function RunningChallengeList({ groups }: Props) {
  const rows = groups.filter((g): g is GroupChallengeView & { challenge: ChallengeView } =>
    Boolean(g.challenge),
  );
  if (rows.length === 0) return null;

  return (
    <section
      aria-labelledby="home-running-heading"
      className="bg-card flex flex-col gap-2 rounded-2xl border p-3"
    >
      <header className="flex items-center justify-between px-1 pb-1">
        <h2 id="home-running-heading" className="t-h3">
          진행 중 챌린지
        </h2>
        <span className="t-caption">{rows.length}개</span>
      </header>
      <ul className="flex flex-col">
        {rows.map(({ challenge: c }) => {
          const joinedLate = c.status === "active" && !c.userIsParticipant;
          return (
            <li key={c.id}>
              <Link
                href={joinedLate ? `/challenge/${c.id}?joined_late=1` : `/challenge/${c.id}`}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-2 py-3 transition-colors",
                  "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  joinedLate && "bg-muted/30",
                )}
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl",
                    joinedLate ? "bg-muted text-muted-foreground" : pickThumbTone(c.id),
                  )}
                  aria-hidden="true"
                >
                  {joinedLate ? <Clock className="size-5" /> : <Activity className="size-5" />}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="t-body truncate font-semibold">{c.title}</p>
                  <ChallengeMeta
                    participantCount={c.participantCount}
                    status={c.status}
                    userIsParticipant={c.userIsParticipant}
                    verifiedToday={c.verifiedToday}
                    potTotal={c.potTotal}
                  />
                </div>
                <RowPendingIndicator
                  daysLeft={c.daysLeft}
                  joinedLate={joinedLate}
                  status={c.status}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ChallengeMeta({
  participantCount,
  status,
  userIsParticipant,
  verifiedToday,
  potTotal,
}: {
  participantCount: number;
  status: ChallengeStatus;
  userIsParticipant: boolean;
  verifiedToday: boolean;
  potTotal: number;
}) {
  if (status === "active" && !userIsParticipant) {
    return (
      <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
        <span>이미 시작됨</span>
        <Dot />
        <span className="font-semibold">다음 챌린지부터 함께해요</span>
      </p>
    );
  }

  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
      <span className="inline-flex items-center gap-1">
        <Users className="size-3" aria-hidden="true" />
        {participantCount}
      </span>
      <Dot />
      {status === "active" ? (
        verifiedToday ? (
          <span className="text-brand-success inline-flex items-center gap-1 font-semibold">
            <Check className="size-3" aria-hidden="true" />
            오늘 완료
          </span>
        ) : (
          <span className="text-brand-warn inline-flex items-center gap-1 font-semibold">
            <Circle className="size-2 fill-current" aria-hidden="true" />
            오늘 미인증
          </span>
        )
      ) : (
        <span>서명 대기</span>
      )}
      <Dot />
      <span className="tabular-nums">누적 벌금 {formatKRW(potTotal)}</span>
    </p>
  );
}

function Dot() {
  return (
    <span aria-hidden="true" className="text-muted-foreground/60">
      ·
    </span>
  );
}
