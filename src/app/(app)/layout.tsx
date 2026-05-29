import { Suspense } from "react";
import { ActionVisitKeyProvider } from "@/components/app-shell/action-visit-key";
import { AppHeader } from "@/components/app-shell/app-header";
import { FabMenu } from "@/components/app-shell/fab-menu";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { fetchMyGroups } from "@/lib/db/reads/my-groups";
import { fetchCurrentChallenges } from "@/lib/db/reads/current-challenges";
import { fetchOwnerGroupsForChallengeForm } from "@/lib/db/reads/owner-groups-for-challenge-form";
import { nextDefaultGroupName } from "@/lib/groups/default-name";

// Next.js 16 cacheComponents: 셸은 sync — children 를 Suspense 안에서 인증 후 렌더.
// dynamic API (createClient · auth · fetchMyGroups 등) 는 AppShellSection 자식에서 평가.
// children 도 같은 Suspense 안에 두어 미인증 사용자가 (app)/* page 의 자체 fetch 를
// mount 전에 redirect 로 차단하도록 한다 (RLS 외 추가 가드).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background mx-auto flex min-h-svh w-full max-w-screen-sm flex-col">
      <Suspense fallback={<AppShellFallback />}>
        <AppShellSection>{children}</AppShellSection>
      </Suspense>
    </div>
  );
}

function AppShellFallback() {
  return (
    <>
      <div
        className="bg-card h-14 w-full animate-pulse"
        aria-busy="true"
        aria-label="앱 셸 로딩 중"
      />
      <main id="main" className="flex-1" />
    </>
  );
}

async function AppShellSection({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const supabase = await createClient();

  // groups 는 FabMenu 그룹 버튼(그룹 전환 sheet / 0개 시 /group/new)에 주입.
  // 알림 dot 은 NotificationBell 이 클라이언트에서 IDB unreadCount 구독 (plan 2026-05-22-header-unread-dot-source).
  const [groups, ownerGroups, profile, current] = await Promise.all([
    fetchMyGroups(),
    fetchOwnerGroupsForChallengeForm(user.id),
    supabase.from("users").select("display_name").eq("id", user.id).maybeSingle(),
    fetchCurrentChallenges(user.id),
  ]);

  const activeChallenges = current
    .filter((g) => g.challenge?.status === "active" && g.challenge.userIsParticipant)
    .map((g) => ({
      id: g.challenge!.id,
      title: g.challenge!.title,
      groupName: g.groupName,
    }));
  const newGroupNamePreview = nextDefaultGroupName(
    profile.data?.display_name ?? "내",
    ownerGroups.map((group) => group.name),
  );

  return (
    <>
      <AppHeader />
      <main id="main" className="flex-1 pb-24">
        <ActionVisitKeyProvider>{children}</ActionVisitKeyProvider>
      </main>
      <FabMenu
        activeChallenges={activeChallenges}
        groups={groups}
        newGroupNamePreview={newGroupNamePreview}
      />
    </>
  );
}
