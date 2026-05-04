import { redirect } from "next/navigation";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { createClient } from "@/lib/supabase/server";
import { fetchUnreadKudosCount } from "@/lib/db/reads/unread-kudos";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // DESIGN_BRIEF §1.5 — 홈 탭의 미읽음 Kudos dot. RLS 가 멤버십 필터.
  const unreadCount = await fetchUnreadKudosCount(user.id);

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-screen-sm flex-col">
      <main id="main" className="flex-1">
        {children}
      </main>
      <BottomNav unreadDot={unreadCount > 0} />
    </div>
  );
}
