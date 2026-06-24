// 홈 "만회 찬스 대기" 섹션 (spec §C3 진입점 / EVAL-0044). SettlementPendingList 미러.
// closed + penalty_mission + 창2 open 인 챌린지를 /challenge/[id]/penalty 로 유도한다.

import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";
import { formatKRW } from "@withkey/domain";
import type { PenaltyWaitingView } from "@/lib/db/reads/penalty-waiting";

type Props = {
  items: ReadonlyArray<PenaltyWaitingView>;
};

export function PenaltyWaitingList({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="home-penalty-heading"
      className="bg-card flex flex-col gap-2 rounded-2xl border p-3"
    >
      <header className="flex items-center justify-between px-1 pb-1">
        <h2 id="home-penalty-heading" className="t-h3">
          만회 찬스 대기
        </h2>
        <span className="t-caption">{items.length}개</span>
      </header>
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.challengeId}>
            <Link
              href={`/challenge/${item.challengeId}/penalty`}
              className="hover:bg-muted/60 focus-visible:ring-ring flex items-center gap-3 rounded-xl px-2 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2"
            >
              <span
                className="bg-brand-secondary-soft text-foreground flex size-10 shrink-0 items-center justify-center rounded-xl"
                aria-hidden="true"
              >
                <Sparkles className="size-5" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="t-body truncate font-semibold">{item.title}</p>
                <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
                  <span className="font-semibold">만회 찬스 · 증명·판정하기</span>
                  <span aria-hidden="true" className="text-muted-foreground/60">
                    ·
                  </span>
                  <span className="tabular-nums">벌금 {formatKRW(item.penaltyAmount)}</span>
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
