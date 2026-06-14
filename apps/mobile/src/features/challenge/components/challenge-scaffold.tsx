// 챌린지 상세 3탭(피드/현황판/정보) 공용 셸 (EVAL-0017) —
// web (tabs)/layout.tsx 의 StatusCard + TabNav 패리티를 mobile-native 로 단순화.
// 종료 판정·D-N 은 status 가 아니라 phase(challengePhase) 로 일원화한다 (ADR-0027).
import {
  challengePhase,
  goalCountLabel,
  penaltyLabel,
  remainingDays,
  type ChallengeDetailView,
  type ChallengePhase,
} from "@withkey/domain";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@/shared/theme/colors";

export type ChallengeTab = "feed" | "dashboard" | "info";

const TAB_LABELS: Record<ChallengeTab, string> = {
  feed: "피드",
  dashboard: "현황판",
  info: "정보",
};

type Props = {
  challengeId: string;
  active: ChallengeTab;
  detail: ChallengeDetailView;
  children: ReactNode;
};

export function ChallengeScaffold({ challengeId, active, detail, children }: Props) {
  const router = useRouter();
  const phase = challengePhase(detail.status, detail.endAt);
  const daysLeft = detail.endAt ? remainingDays(detail.endAt) : null;

  const navigateTo = (tab: ChallengeTab) => {
    if (tab === active) return;
    const params = { id: challengeId };
    // 탭 전환은 스택을 쌓지 않는다 — back 은 항상 홈/이전 화면으로.
    if (tab === "feed") router.replace({ pathname: "/challenge/[id]", params });
    else if (tab === "dashboard") router.replace({ pathname: "/challenge/[id]/dashboard", params });
    else router.replace({ pathname: "/challenge/[id]/info", params });
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text numberOfLines={1} style={styles.title}>
              {detail.title}
            </Text>
            <Text style={styles.phaseChip}>{phaseLabel(phase, daysLeft)}</Text>
          </View>
          <Text style={styles.meta}>
            {goalCountLabel(detail.goalCount).detail} · {detail.durationDays}일 · 벌금{" "}
            {penaltyLabel(detail.penaltyAmount)} · {detail.participantCount}명
          </Text>
        </View>
        <View accessibilityRole="tablist" style={styles.tabBar}>
          {(Object.keys(TAB_LABELS) as ChallengeTab[]).map((tab) => {
            const selected = tab === active;
            return (
              <Pressable
                key={tab}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => navigateTo(tab)}
                style={({ pressed }) => [
                  styles.tab,
                  selected && styles.tabActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>
                  {TAB_LABELS[tab]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.content}>{children}</View>
      </SafeAreaView>
    </View>
  );
}

function phaseLabel(phase: ChallengePhase, daysLeft: number | null): string {
  switch (phase) {
    case "pending":
      return "서명 대기";
    case "accepted":
      return "시작 전";
    case "running":
      return daysLeft != null ? `D-${Math.max(daysLeft, 0)}` : "진행 중";
    case "over":
      return "종료 · 정산 대기";
    case "closed":
      return "종료";
  }
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  title: {
    color: colors.textStrong,
    flexShrink: 1,
    fontSize: 22,
    fontWeight: "800",
  },
  phaseChip: {
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  tabBar: {
    backgroundColor: colors.muted,
    borderRadius: 12,
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    padding: 4,
  },
  tab: {
    alignItems: "center",
    borderRadius: 9,
    flex: 1,
    paddingVertical: 8,
  },
  tabActive: {
    backgroundColor: colors.card,
  },
  pressed: {
    opacity: 0.85,
  },
  tabLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  tabLabelActive: {
    color: colors.textStrong,
  },
  content: {
    flex: 1,
    marginTop: 12,
  },
});
