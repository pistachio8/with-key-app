import { redirect } from "next/navigation";
import { getAuthedUser } from "@/lib/supabase/auth";
import { fetchOwnerOpenChallenge } from "@/lib/db/reads/owner-open-challenge";

// spec C8 — owner 가 이미 open challenge 를 갖고 있으면 폼 진입을 막고
// 그 챌린지로 즉시 redirect. ADR-0003 auto-group 흐름(첫 챌린지 사용자)은
// open challenge 가 없을 때 자연스럽게 폼이 렌더되어 그대로 동작.
export default async function NewChallengeLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getAuthedUser();
  if (!user) redirect("/login");

  const open = await fetchOwnerOpenChallenge(user.id);
  if (open) redirect(`/challenge/${open.id}`);

  return <>{children}</>;
}
