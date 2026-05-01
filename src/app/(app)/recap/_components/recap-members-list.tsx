// src/app/(app)/recap/_components/recap-members-list.tsx
// PRD §10 화면 8 — 멤버 리스트 + MVP 뱃지.

import type { RecapMemberView } from "@/lib/db/reads/recap";

interface RecapMembersListProps {
  goalCount: number;
  members: ReadonlyArray<RecapMemberView>;
}

export function RecapMembersList({ goalCount, members }: RecapMembersListProps) {
  return (
    <section aria-label="멤버별 결과" className="flex flex-col gap-2">
      <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">멤버</h2>
      <ul className="flex flex-col divide-y rounded-lg border">
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 p-3">
            <div className="flex flex-col">
              <span className="text-sm font-medium">{m.displayName}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {m.doneCount} / {goalCount}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {m.isMvp && (
                <span
                  aria-label="MVP"
                  className="bg-primary/10 text-primary rounded-full px-2 py-1 text-xs font-semibold"
                >
                  ⭐ MVP
                </span>
              )}
              {!m.isMvp && m.achieved && (
                <span className="text-muted-foreground text-xs">달성</span>
              )}
              {!m.achieved && <span className="text-muted-foreground text-xs">아쉬워요</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
