// src/app/(app)/challenge/[id]/recap/_components/member-roster.tsx
import { Crown } from "lucide-react";

type Props = {
  members: ReadonlyArray<{ id: string; displayName: string; isMvp: boolean }>;
};

export function MemberRoster({ members }: Props) {
  if (members.length === 0) return null;
  return (
    <section
      aria-label="정산 멤버"
      className="bg-[var(--invite-bg,#FAF6EF)] -mx-4 px-6 py-4 text-center text-[13px] leading-[1.85] text-[var(--invite-ink,#2A221C)]"
    >
      <div className="mb-2 flex items-center justify-center gap-2 text-[9px] uppercase tracking-[0.3em] text-[var(--invite-accent,#B07A4D)]">
        <span className="h-px flex-1 bg-[var(--invite-line,#E5D8C2)]" />
        SETTLEMENT
        <span className="h-px flex-1 bg-[var(--invite-line,#E5D8C2)]" />
      </div>
      <ul className="grid grid-cols-2 gap-x-4">
        {members.map((m) => (
          <li key={m.id} className="font-semibold">
            {m.displayName}
            {m.isMvp && (
              <Crown
                aria-label="MVP"
                className="ml-1 inline-block h-3 w-3 align-[-1px] text-[var(--invite-gold,#C9A878)]"
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
