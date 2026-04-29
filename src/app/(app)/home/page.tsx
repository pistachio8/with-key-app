import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProgressCard } from "./_components/progress-card";

// TODO(Day 2): replace with Supabase query against active challenges table.
async function fetchActiveChallenge() {
  return {
    title: "주 3회 헬스장",
    goalCount: 3,
    doneCount: 2,
    potTotal: 10000,
    daysLeft: 4,
  };
}

// PRD §4 · Design Brief 화면 4
export default async function HomePage() {
  const challenge = await fetchActiveChallenge();

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

      <ProgressCard {...challenge} />

      <Link href="/challenge/new" className={cn(buttonVariants({ size: "lg" }), "h-12 w-full")}>
        <Plus aria-hidden="true" /> 새로운 서약서 만들기
      </Link>
    </div>
  );
}
