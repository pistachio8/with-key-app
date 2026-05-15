import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchPendingPledge } from "@/lib/db/reads/pledge";
import { PledgeSheet } from "./_components/pledge-sheet";

type Params = Promise<{ id: string }>;

// 모킹업 §6-B — 멤버 서명. ADR-0002: challenge sub-route 로 이동.
export default async function PledgePage({ params }: { params: Params }) {
  const { id: challengeId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const pledge = await fetchPendingPledge(user.id, challengeId);
  if (!pledge || pledge.mySigned) {
    redirect(`/challenge/${challengeId}`);
  }

  return <PledgeSheet pledge={pledge} currentUserId={user.id} />;
}
