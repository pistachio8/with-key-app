import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchRecap } from "@/lib/db/reads/recap";

// PRD §10 화면 8 · §11.1 Day 7 Happy Path.
export default async function RecapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const recap = await fetchRecap(user.id);

  if (!recap) {
    return (
      <div className="flex flex-col gap-6 p-4">
        <h1 className="text-xl font-semibold">주간 정산</h1>
        <p className="text-muted-foreground break-keep text-sm">
          아직 끝난 챌린지가 없어요. 챌린지가 끝나면 결과를 여기서 돌아봐요.
        </p>
        <Link
          href="/home"
          className="text-primary w-fit text-sm font-semibold underline-offset-4 hover:underline"
        >
          홈으로 가기
        </Link>
      </div>
    );
  }

  // Task 10 에서 채움
  return <div className="p-4">TODO: render recap view</div>;
}
