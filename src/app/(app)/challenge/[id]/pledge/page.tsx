import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchPendingPledge } from "@/lib/db/reads/pledge";
import { PledgeSheet } from "./_components/pledge-sheet";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ welcome?: string }>;

// 모킹업 §6-B — 멤버 서명. ADR-0002: challenge sub-route 로 이동.
// ADR-0008 — invite 자동가입 후 callback 이 ?welcome={groupName} 부착해 redirect.
// 1회성 query 라 새로고침/이동 시 자연 소실 — dismiss 컨트롤 불필요.
export default async function PledgePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id: challengeId } = await params;
  const sp = await searchParams;
  const welcome = typeof sp.welcome === "string" && sp.welcome.length > 0 ? sp.welcome : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const pledge = await fetchPendingPledge(user.id, challengeId);
  if (!pledge || pledge.mySigned) {
    redirect(`/challenge/${challengeId}`);
  }

  return (
    <>
      {welcome && (
        <div
          role="status"
          aria-live="polite"
          className="bg-primary/5 border-primary/20 mx-4 mt-4 rounded-2xl border px-4 py-4 text-center"
        >
          <p className="text-foreground font-semibold">🎉 {welcome}에 합류했어요</p>
          <p className="text-muted-foreground mt-1 text-xs">첫 챌린지에 서명해 보세요</p>
        </div>
      )}
      <PledgeSheet pledge={pledge} currentUserId={user.id} />
    </>
  );
}
