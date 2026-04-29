import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchPendingPledge } from "@/lib/db/reads/pledge";
import { PledgeSheet } from "./_components/pledge-sheet";

// PRD §3.3 · Design Brief 화면 3
export default async function PledgePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const pledge = await fetchPendingPledge(user.id);

  if (!pledge) {
    return (
      <div className="flex flex-col gap-6 p-4">
        <h1 className="text-xl font-semibold">서약서</h1>
        <p className="text-muted-foreground break-keep text-sm">
          아직 서명할 서약서가 없어요. 홈에서 새 챌린지를 만들어 친구를 초대해 보세요.
        </p>
      </div>
    );
  }

  return <PledgeSheet pledge={pledge} currentUserId={user.id} />;
}
