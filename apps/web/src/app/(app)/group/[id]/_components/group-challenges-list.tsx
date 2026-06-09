// 모킹업 §12 - 그룹의 챌린지 목록. 진행 중/종료 배지 + 챌린지 상세 진입 링크.

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { challengePhase, remainingDays, type ChallengePhase } from "@withkey/domain";
import type { GroupChallengeRow } from "@/lib/db/reads/group-detail";

interface GroupChallengesListProps {
  challenges: ReadonlyArray<GroupChallengeRow>;
}

// ADR-0027 — 배지·D-N 은 status 가 아니라 phase 기준. over(만기 active)는 "정산 대기".
const PHASE_LABEL: Record<
  ChallengePhase,
  { label: string; tone: "primary" | "neutral" | "success" }
> = {
  pending: { label: "서명 대기", tone: "neutral" },
  accepted: { label: "곧 시작", tone: "neutral" },
  running: { label: "진행 중", tone: "primary" },
  over: { label: "정산 대기", tone: "neutral" },
  closed: { label: "종료", tone: "success" },
};

export function GroupChallengesList({ challenges }: GroupChallengesListProps) {
  if (challenges.length === 0) return null;
  return (
    <section aria-label="그룹 챌린지" className="flex flex-col gap-2">
      <h2 className="t-caption">챌린지 ({challenges.length}개)</h2>
      <ul className="flex flex-col gap-2">
        {challenges.map((c) => {
          const phase = challengePhase(c.status, c.endAt);
          const label = PHASE_LABEL[phase];
          const dDay = phase === "running" ? `D-${remainingDays(c.endAt)}` : null;
          return (
            <li key={c.id}>
              <Link
                href={`/challenge/${c.id}`}
                className="focus-visible:ring-ring block rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <Card
                  padding="md"
                  className="flex items-center gap-3 transition-transform active:scale-[0.99]"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="t-body truncate font-semibold">{c.title}</span>
                    <div className="flex items-center gap-1.5">
                      <Chip tone={label.tone}>{label.label}</Chip>
                      {dDay && <Chip tone="neutral">{dDay}</Chip>}
                    </div>
                  </div>
                  <ChevronRight className="text-muted-foreground size-5" aria-hidden="true" />
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
