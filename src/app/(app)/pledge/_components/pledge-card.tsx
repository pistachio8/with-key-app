import { formatKRW } from "@/lib/challenge/penalty";

type Props = {
  title: string;
  goalCount: number;
  durationDays: number;
  penaltyAmount: number;
  members: ReadonlyArray<{ id: string; displayName: string; signed: boolean }>;
};

// PRD §3.3 AC-3 · Design Brief 화면 3
export function PledgeCard({ title, goalCount, durationDays, penaltyAmount, members }: Props) {
  return (
    <article className="bg-card rounded-2xl border p-5 shadow-sm">
      <h2 className="text-base font-bold tracking-tight">우리의 서약서</h2>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">목표</dt>
        <dd className="font-medium">{title}</dd>
        <dt className="text-muted-foreground">기간</dt>
        <dd className="font-medium">{durationDays}일</dd>
        <dt className="text-muted-foreground">주 목표</dt>
        <dd className="font-medium">{goalCount}회</dd>
        <dt className="text-muted-foreground">예정 벌금</dt>
        <dd className="font-medium tabular-nums">{formatKRW(penaltyAmount)}</dd>
      </dl>
      <section className="mt-4">
        <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          멤버
        </h3>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between">
              <span>{m.displayName}</span>
              <span className={m.signed ? "text-primary" : "text-muted-foreground"}>
                {m.signed ? "서명 완료" : "대기 중"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
