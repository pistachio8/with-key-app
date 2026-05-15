import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-shell/app-header";
import { createClient } from "@/lib/supabase/server";
import { fetchUnreadKudosCount } from "@/lib/db/reads/unread-kudos";
import { fetchMyGroups } from "@/lib/db/reads/my-groups";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // DESIGN_BRIEF §1.5 — 미읽음 Kudos 존재 시 AppHeader 알림 dot. RLS 가 멤버십 필터.
  // F15 — 그룹 수에 따라 헤더 chevron sheet/직진입/라벨 분기.
  const [unreadCount, groups] = await Promise.all([
    fetchUnreadKudosCount(user.id),
    fetchMyGroups(),
  ]);

  return (
    <div className="bg-background mx-auto flex min-h-svh w-full max-w-screen-sm flex-col">
      <AppHeader groups={groups} unreadNotifications={unreadCount > 0} />
      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
