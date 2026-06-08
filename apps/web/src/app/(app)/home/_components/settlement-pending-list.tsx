// ADR-0027 — 만기 도달(phase='over') 챌린지의 "정산 대기" 섹션.
// 진행 중 리스트(RunningChallengeList)에서 분리해, 종료된 챌린지를 정산(recap)으로 유도한다.
// auto-close cron 이 status='closed' 로 바꾸면 current-challenges 필터에서 빠져 이 섹션에서도
// 사라진다(transient) — 이후 정산은 /me/challenges · 상세 ChallengeEndedBanner 로.

import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";
import { formatKRW } from "@withkey/domain";
import type { GroupChallengeView } from "@/lib/db/reads/current-challenges";

type ChallengeView = NonNullable<GroupChallengeView["challenge"]>;

type Props = {
  groups: ReadonlyArray<GroupChallengeView>;
};

export function SettlementPendingList({ groups }: Props) {
  const rows = groups.filter(
    (g): g is GroupChallengeView & { challenge: ChallengeView } =>
      g.challenge != null && g.challenge.phase === "over",
  );
  if (rows.length === 0) return null;

  return (
    <section
      aria-labelledby="home-settlement-heading"
      className="bg-card flex flex-col gap-2 rounded-2xl border p-3"
    >
      <header className="flex items-center justify-between px-1 pb-1">
        <h2 id="home-settlement-heading" className="t-h3">
          정산 대기
        </h2>
        <span className="t-caption">{rows.length}개</span>
      </header>
      <ul className="flex flex-col">
        {rows.map(({ challenge: c }) => (
          <li key={c.id}>
            <Link
              href={`/challenge/${c.id}/recap`}
              className="hover:bg-muted/60 focus-visible:ring-ring flex items-center gap-3 rounded-xl px-2 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2"
            >
              <span
                className="bg-brand-secondary-soft text-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
                aria-hidden="true"
              >
                <Trophy className="size-5" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="t-body truncate font-semibold">{c.title}</p>
                <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
                  <span className="font-semibold">종료 · 정산하기</span>
                  <span aria-hidden="true" className="text-muted-foreground/60">
                    ·
                  </span>
                  <span className="tabular-nums">모인 벌금 {formatKRW(c.potTotal)}</span>
                </p>
              </div>
              <ChevronRight className="text-muted-foreground size-5 shrink-0" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
