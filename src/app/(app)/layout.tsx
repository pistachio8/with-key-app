import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-shell/app-header";
import { createClient } from "@/lib/supabase/server";
import { fetchMyGroups } from "@/lib/db/reads/my-groups";
import { fetchOwnerGroupsForChallengeForm } from "@/lib/db/reads/owner-groups-for-challenge-form";
import { nextDefaultGroupName } from "@/lib/groups/default-name";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // F15 — 그룹 수에 따라 헤더 chevron sheet/직진입/라벨 분기.
  // 알림 dot 은 NotificationBell 이 클라이언트에서 IDB unreadCount 구독 (plan 2026-05-22-header-unread-dot-source).
  const [groups, ownerGroups, profile] = await Promise.all([
    fetchMyGroups(),
    fetchOwnerGroupsForChallengeForm(user.id),
    supabase.from("users").select("display_name").eq("id", user.id).maybeSingle(),
  ]);
  const newGroupNamePreview = nextDefaultGroupName(
    profile.data?.display_name ?? "내",
    ownerGroups.map((group) => group.name),
  );

  return (
    <div className="bg-background mx-auto flex min-h-svh w-full max-w-screen-sm flex-col">
      <AppHeader groups={groups} newGroupNamePreview={newGroupNamePreview} />
      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
