// src/app/(app)/challenge/[id]/recap/_components/invitation-header.tsx
type Props = {
  groupName: string;
  title: string;
  startAt: string;
  endAt: string;
  durationDays: number;
};

function fmtPart(iso: string, withYear: boolean): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return withYear ? `${y} · ${m} · ${day}` : `${m} · ${day}`;
}

export function InvitationHeader({ groupName, title, startAt, endAt, durationDays }: Props) {
  const period = `${fmtPart(startAt, true)} — ${fmtPart(endAt, false)}`;
  return (
    <section className="bg-[var(--invite-bg,#FAF6EF)] text-[var(--invite-ink,#2A221C)] -mx-4 px-6 pt-6 pb-4 text-center">
      <p className="text-[10px] tracking-[0.35em] uppercase text-[var(--invite-accent,#B07A4D)]">
        A MEMOIR
      </p>
      <h2 className="mt-2 font-serif text-[17px] font-semibold leading-snug">
        {groupName}의 {title},<br />그 {durationDays}일의 기록
      </h2>
      <p className="mt-2 text-[10px] tracking-wider text-[var(--invite-muted,#5E4838)]">{period}</p>
    </section>
  );
}
