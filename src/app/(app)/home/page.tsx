import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { fetchActiveChallenge } from "@/lib/db/reads/active-challenge";
import { ProgressCard } from "./_components/progress-card";

// PRD §4 · Design Brief 화면 4
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const active = await fetchActiveChallenge(user.id);

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

      {active ? (
        <>
          <ProgressCard
            title={active.title}
            goalCount={active.goalCount}
            doneCount={active.doneCount}
            potTotal={active.potTotal}
            daysLeft={active.daysLeft}
          />
          <Link
            href={`/challenge/${active.id}`}
            className={cn(buttonVariants({ size: "lg" }), "h-12 w-full")}
          >
            현황 보기
          </Link>
        </>
      ) : (
        <section className="bg-card flex flex-col items-center gap-3 rounded-2xl border p-6 text-center">
          <p className="text-muted-foreground break-keep text-sm">
            진행 중인 서약서가 없어요. 친구들과 새 챌린지를 시작해 보세요.
          </p>
          <Link
            href="/challenge/new"
            className={cn(buttonVariants({ size: "lg" }), "h-12 w-full")}
          >
            <Plus aria-hidden="true" /> 새로운 서약서 만들기
          </Link>
        </section>
      )}
    </div>
  );
}
