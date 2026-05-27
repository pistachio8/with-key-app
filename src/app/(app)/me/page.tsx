// 모킹업 미상 — 디자인 시스템 기반 자체 구성 (계획 §Task 7.4 PO 컨펌 대상).
// 카드 4종 + 약관 + 로그아웃.

import { requireUser } from "@/lib/auth/require-user";
import {
  fetchActiveSubscriptionEndpoint,
  fetchNotificationPrefs,
} from "@/lib/db/reads/notification-prefs";
import { fetchMyChallenges, deriveCounts } from "@/lib/db/reads/my-challenges";
import { fetchMyDisplayName } from "@/lib/db/reads/me";
import { getAuthedUser } from "@/lib/supabase/auth";
import { ProfileCard } from "./_components/profile-card";
import { NotificationCard } from "./_components/notification-card";
import { MyChallengesCard } from "./_components/my-challenges-card";
import { LegalLinks } from "./_components/legal-links";
import { LogoutButton } from "./_components/logout-button";

function formatJoinedMonth(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
  }).format(new Date(iso));
}

export default async function MePage() {
  const user = await requireUser();
  // requireUser 가 cache 된 getAuthedUser 위에 구현되어 같은 request 안에서 1회만 호출됨.
  // 여기서 created_at 만 추가로 필요해 동일 cached fetch 재사용.
  const { user: authUser } = await getAuthedUser();
  const createdAt = authUser?.created_at ?? new Date().toISOString();

  const [prefs, endpoint, my, displayNameRaw] = await Promise.all([
    fetchNotificationPrefs(user.id),
    fetchActiveSubscriptionEndpoint(user.id),
    fetchMyChallenges(user.id),
    fetchMyDisplayName(user.id),
  ]);
  const counts = deriveCounts(my);
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const displayName = displayNameRaw?.trim() || user.email?.split("@")[0] || "사용자";

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="t-h1">마이페이지</h1>
      <ProfileCard
        displayName={displayName}
        email={user.email ?? ""}
        joinedAt={formatJoinedMonth(createdAt)}
        challengeCount={counts.totalParticipated}
      />
      <MyChallengesCard ownerCount={counts.owner} memberCount={counts.member} />
      <NotificationCard
        initialPrefs={prefs}
        initialSubscribedEndpoint={endpoint}
        vapidPublicKey={vapidPublicKey}
      />
      <LegalLinks />
      <LogoutButton />
    </div>
  );
}
