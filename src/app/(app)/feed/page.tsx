import { redirect } from "next/navigation";
import { fetchActiveChallenge } from "@/lib/db/reads/active-challenge";
import { createClient } from "@/lib/supabase/server";

// ADR-0002 — `/feed` 라우트 폐기. 피드는 challenge 안 탭으로 이동.
// 옛 진입점(bookmark·푸시 링크 등) 보존을 위해 가장 최근 active challenge 의 피드 탭으로 redirect.
export default async function FeedRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const active = await fetchActiveChallenge(user.id, { statuses: ["active"] });
  if (!active) redirect("/home");
  redirect(`/challenge/${active.id}`);
}
