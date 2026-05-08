import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { fetchCurrentChallenges } from "@/lib/db/reads/current-challenges";
import { StartActionButton } from "@/app/(app)/challenge/[id]/_components/start-action-button";
import { GroupStrip } from "./_components/group-strip";

// PRD §4 · §6.2 · Design Brief 화면 4
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groups = await fetchCurrentChallenges(user.id);
  const hasAnyGroup = groups.length > 0;

  // 진행 중인 active 챌린지가 정확히 1개일 때만 단축 "운동 시작" 노출 — 모호함 방지.
  const activeChallenges = groups
    .map((g) => g.challenge)
    .filter((c): c is NonNullable<typeof c> => c?.status === "active");
  const singleActive = activeChallenges.length === 1 ? activeChallenges[0] : null;

  let pushSubscribed = false;
  if (singleActive) {
    const { count } = await supabase
      .from("push_subscriptions")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", user.id);
    pushSubscribed = (count ?? 0) > 0;
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">오늘도 수고하셨어요</h1>
        <Link
          href="/settings"
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          설정
        </Link>
      </header>

      {singleActive ? (
        <section aria-label="운동 시작">
          <StartActionButton challengeId={singleActive.id} pushSubscribed={pushSubscribed} />
        </section>
      ) : null}

      <GroupStrip groups={groups} />

      {hasAnyGroup && (
        <Link
          href="/group/new"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 w-full gap-2")}
        >
          <Plus aria-hidden="true" /> 새 그룹 만들기
        </Link>
      )}
    </div>
  );
}
