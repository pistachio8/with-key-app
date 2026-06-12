// /home — 진행/미서명(초대)/종료 대기(정산) 요약을 실 Supabase 데이터로 렌더 (EVAL-0017).
// home 은 feature 가 아니라 조합 화면 — challenge/profile feature 의 공개 API 만 합친다 (04 §5.1).
// read 는 EVAL-0016 계약(RN-safe RLS direct) 소비, write 없음. 로그아웃 UI 는 /me 로 이전.
import { StatusBar } from "expo-status-bar";
import { useCallback } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "@/features/auth";
import {
  fetchCurrentChallenges,
  fetchMyUnsignedChallengeIds,
  HomeOverview,
} from "@/features/challenge";
import { fetchMyDisplayName } from "@/features/profile/api/profile-reads";
import { LoadingScreen, ReadErrorScreen } from "@/shared/components/screen-states";
import { useAsyncRead } from "@/shared/hooks/use-async-read";
import { colors } from "@/shared/theme/colors";

type HomeData = {
  displayName: string | null;
  groups: Awaited<ReturnType<typeof fetchCurrentChallenges>>;
  unsignedPendingIds: ReadonlySet<string>;
};

export default function HomeScreen() {
  const { session } = useSession();
  const userId = session?.user.id ?? null;

  const read = useCallback(async (): Promise<HomeData | null> => {
    if (!userId) return null;
    const [groups, displayName] = await Promise.all([
      fetchCurrentChallenges(userId),
      fetchMyDisplayName(userId),
    ]);
    // 초대 배너 — 내가 참여자이면서 아직 서명하지 않은 pending 만 (web home/page.tsx 동일).
    const pendingIds = groups
      .map((g) => g.challenge)
      .filter((c): c is NonNullable<typeof c> => c?.phase === "pending")
      .map((c) => c.id);
    const unsignedPendingIds =
      pendingIds.length > 0
        ? await fetchMyUnsignedChallengeIds(userId, pendingIds)
        : new Set<string>();
    return { displayName, groups, unsignedPendingIds };
  }, [userId]);

  const { state, refreshing, reload, refresh } = useAsyncRead(read);

  // auth gate((app)/_layout)가 세션을 보장하지만, signOut 직후 transition 프레임 방어.
  if (!userId || state.status === "loading") return <LoadingScreen />;
  if (state.status === "error") return <ReadErrorScreen onRetry={reload} />;
  if (state.data === null) return <LoadingScreen />;

  const { displayName, groups, unsignedPendingIds } = state.data;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} />
          }
        >
          <View style={styles.greeting}>
            <Text style={styles.greetingTitle}>안녕, {displayName ?? "친구"} 👋</Text>
          </View>
          <HomeOverview groups={groups} unsignedPendingIds={unsignedPendingIds} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    gap: 12,
    padding: 16,
    paddingBottom: 32,
  },
  greeting: {
    paddingBottom: 4,
    paddingTop: 8,
  },
  greetingTitle: {
    color: colors.textStrong,
    fontSize: 24,
    fontWeight: "800",
  },
});
