import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { fetchActiveChallenge } from "@/lib/db/reads/active-challenge";
import { ActionForm } from "./_components/action-form";

// PRD §4.3 + §5 · Design Brief 화면 5 (인증 — 키워드 칩)
export default async function ActionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS 가 al_insert_active_period 로 active/기간을 최종 강제하므로
  // 여기선 가장 최근 active 챌린지 1건만 집어 ActionForm 에 주입.
  const active = await fetchActiveChallenge(user.id, { statuses: ["active"] });

  if (!active) {
    return (
      <div className="flex flex-col gap-6 p-4">
        <h1 className="text-xl font-semibold">인증</h1>
        <p className="text-muted-foreground break-keep text-sm">
          현재 활성 상태인 챌린지가 없어요. 서명이 모두 끝난 뒤에 인증할 수 있어요.
        </p>
        <Link
          href="/home"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 w-fit")}
        >
          홈으로 가기
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">인증</h1>
        <p className="text-muted-foreground text-sm">{active.title}</p>
      </header>
      <ActionForm challengeId={active.id} />
    </div>
  );
}
