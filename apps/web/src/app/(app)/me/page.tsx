// 모킹업 미상 — 디자인 시스템 기반 자체 구성 (계획 §Task 7.4 PO 컨펌 대상).
// 카드 4종 + 약관 + 로그아웃.

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  fetchActiveSubscriptionEndpoint,
  fetchNotificationPrefs,
} from "@/lib/db/reads/notification-prefs";
import { fetchMyChallenges, deriveCounts } from "@/lib/db/reads/my-challenges";
import { fetchMyDisplayName } from "@/lib/db/reads/me";
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
  // ADR-0023 적용 제외: `created_at` 은 JWT claims 에 없어 `getAuthedUser` (claims 기반)
  // 로 못 얻는다. /me 는 단일 render scope · 진입 빈도가 낮아 직접 호출 1회 허용.
  const supabase = await createClient();
  const { data: rawUser } = await supabase.auth.getUser();
  const createdAt = rawUser.user?.created_at ?? new Date().toISOString();

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
