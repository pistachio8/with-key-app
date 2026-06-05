import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { fetchActiveChallenge } from "@/lib/db/reads/active-challenge";

// ADR-0002 — `/action` 라우트 폐기. action 은 challenge sub-route 로 이동.
// 옛 진입점(bookmark·푸시 링크 등) 보존을 위해 가장 최근 active challenge 의 action 으로 redirect.
export default async function ActionRedirect() {
  const user = await requireUser();
  const active = await fetchActiveChallenge(user.id, { statuses: ["active"] });
  if (!active) redirect("/home");
  redirect(`/challenge/${active.id}/action`);
}
