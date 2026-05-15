import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchPendingPledge } from "@/lib/db/reads/pledge";

// ADR-0002: pledge 는 challenge sub-route. 옛 진입점은 본인의 첫 pending pledge 로 redirect.
export default async function PledgeRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const pledge = await fetchPendingPledge(user.id);
  if (!pledge) redirect("/home");
  redirect(`/challenge/${pledge.id}/pledge`);
}
