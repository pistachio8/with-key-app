import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchRecap } from "@/lib/db/reads/recap";

// ADR-0002: recap 은 challenge sub-route. 옛 진입점은 최근 ended challenge 로 redirect.
export default async function RecapRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const recap = await fetchRecap(user.id);
  if (!recap) redirect("/home");
  redirect(`/challenge/${recap.challengeId}/recap`);
}
