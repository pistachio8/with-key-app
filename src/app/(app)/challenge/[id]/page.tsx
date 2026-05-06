import { notFound, redirect } from "next/navigation";
import { formatKRW } from "@/lib/challenge/penalty";
import { fetchChallengeDetail } from "@/lib/db/reads/challenge-detail";
import { fetchChallengeFeed } from "@/lib/db/reads/challenge-feed";
import { createClient } from "@/lib/supabase/server";
import { InviteTrigger } from "@/app/(app)/group/[id]/_components/invite-trigger";
import { MemberStrip } from "./_components/member-strip";
import { AccountInfoTrigger } from "./_components/account-info-trigger";
import { ChallengeFeed } from "./_components/challenge-feed";

type Params = Promise<{ id: string }>;

// PRD §4 · §11 · BE_SCHEMA §4 상태머신 · Design Brief 화면 4
export default async function ChallengeDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const detail = await fetchChallengeDetail(id);
  if (!detail) notFound();
  const feed = await fetchChallengeFeed(id, user.id);

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
      {user.id === detail.group.ownerId ? (
        <section aria-label="초대">
          <InviteTrigger groupId={detail.group.id} />
        </section>
      ) : null}
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
        <AccountInfoTrigger
          groupId={detail.group.id}
          bankCode={detail.group.bankCode}
          accountHolder={detail.group.accountHolder}
          accountNumberLast4={detail.group.accountNumberLast4}
        />
      </section>
      <section aria-labelledby="feed-heading">
        <h2 id="feed-heading" className="mb-3 text-sm font-semibold">
          인증 피드
        </h2>
        <ChallengeFeed items={feed} viewerId={user.id} />
      </section>
    </div>
  );
}
