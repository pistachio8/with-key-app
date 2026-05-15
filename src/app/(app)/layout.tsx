import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-shell/app-header";
import { createClient } from "@/lib/supabase/server";
import { fetchUnreadKudosCount } from "@/lib/db/reads/unread-kudos";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // DESIGN_BRIEF §1.5 — 미읽음 Kudos 존재 시 AppHeader 알림 dot. RLS 가 멤버십 필터.
  const unreadCount = await fetchUnreadKudosCount(user.id);

  return (
    <div className="bg-background mx-auto flex min-h-svh w-full max-w-screen-sm flex-col">
      <AppHeader unreadNotifications={unreadCount > 0} />
      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
