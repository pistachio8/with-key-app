import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { fetchRecap } from "@/lib/db/reads/recap";

// ADR-0002: recap 은 challenge sub-route. 옛 진입점은 최근 ended challenge 로 redirect.
export default async function RecapRedirect() {
  const user = await requireUser();
  const recap = await fetchRecap(user.id);
  if (!recap) redirect("/home");
  redirect(`/challenge/${recap.challengeId}/recap`);
}
