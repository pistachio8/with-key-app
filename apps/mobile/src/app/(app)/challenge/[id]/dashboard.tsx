// /challenge/[id]/dashboard — 현황판 탭 (EVAL-0017, POC read-only).
// 모인 벌금(potTotal·확정 누적) + 멤버별 doneCount/goalCount 진행률.
// viewer 주차 칩·링(web dashboard-tab)은 doneByWeek(서버 전용 Map)가 RN 계약에서
// 제외돼(ADR-0037 §2) 미포팅 — 후속 task 에서 계약 확장과 함께 결정.
import { formatKRW } from "@withkey/domain";
import { useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { ChallengeScaffold, fetchChallengeDetail, MemberProgressList } from "@/features/challenge";
import { PlaceholderScreen } from "@/shared/components/placeholder-screen";
import { LoadingScreen, ReadErrorScreen } from "@/shared/components/screen-states";
import { useAsyncRead } from "@/shared/hooks/use-async-read";
import { colors } from "@/shared/theme/colors";

export default function ChallengeDashboardScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0]! : params.id;

  const read = useCallback(() => fetchChallengeDetail(id), [id]);
  const { state, refreshing, reload, refresh } = useAsyncRead(read);

  if (state.status === "loading") return <LoadingScreen />;
  if (state.status === "error") return <ReadErrorScreen onRetry={reload} />;
  if (state.data === null) {
    return (
      <PlaceholderScreen
        title="챌린지를 찾을 수 없어요"
        lines={["참여 중인 챌린지가 아니거나 삭제된 챌린지예요."]}
      />
    );
  }

  const detail = state.data;

  return (
    <ChallengeScaffold active="dashboard" challengeId={id} detail={detail}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} />}
      >
        <View style={styles.potCard}>
          <Text style={styles.potLabel}>모인 벌금</Text>
          <Text style={styles.potValue}>{formatKRW(detail.potTotal)}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>멤버 진행률</Text>
          <MemberProgressList goalCount={detail.goalCount} members={detail.members} />
        </View>
      </ScrollView>
    </ChallengeScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingBottom: 32,
    paddingHorizontal: 16,
  },
  potCard: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 24,
  },
  potLabel: {
    color: colors.primarySoft,
    fontSize: 12,
  },
  potValue: {
    color: colors.card,
    fontSize: 30,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
    marginTop: 4,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: colors.textStrong,
    fontSize: 15,
    fontWeight: "700",
  },
});
