import { notFound } from "next/navigation";
import { formatKRW } from "@/lib/challenge/penalty";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { MemberStrip } from "./_components/member-strip";
import { SettlementTrigger } from "./_components/settlement-trigger";

type Params = Promise<{ id: string }>;

// PRD §4 · §11 · BE_SCHEMA §4 상태머신 · Design Brief 화면 4
export default async function ChallengeDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const detail = await fetchChallengeDetail(id);
  if (!detail) notFound();

  return (
    <div className="flex flex-col gap-6 p-4">
      <header>
        <p className="text-muted-foreground font-mono text-xs">{id.slice(0, 8)}</p>
        <h1 className="text-xl font-semibold">{detail.title}</h1>
      </header>
      <section aria-labelledby="member-progress-heading">
        <h2 id="member-progress-heading" className="mb-3 text-sm font-semibold">
          멤버 진행률
        </h2>
        <MemberStrip goalCount={detail.goalCount} members={detail.members} />
      </section>
      <section
        aria-labelledby="settlement-heading"
        className="bg-card flex items-center justify-between rounded-2xl border p-4"
      >
        <div>
          <p id="settlement-heading" className="text-muted-foreground text-xs">
            모인 예정 벌금
          </p>
          <p className="text-xl font-bold tabular-nums">{formatKRW(detail.potTotal)}</p>
        </div>
        <SettlementTrigger amount={detail.potTotal} memo={`${detail.title} 벌금`} />
      </section>
    </div>
  );
}
