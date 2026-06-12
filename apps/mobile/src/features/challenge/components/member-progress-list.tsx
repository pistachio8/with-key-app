// 현황판 멤버 진행률 (EVAL-0017 · web member-strip.tsx 패리티) —
// 멤버별 doneCount/goalCount + 진행 바. doneCount 는 read 계약(ChallengeMemberView)값.
import type { ChallengeMemberView } from "@withkey/domain";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/shared/theme/colors";

type Props = {
  goalCount: number;
  members: readonly ChallengeMemberView[];
};

function progressPercent(doneCount: number, goalCount: number): number {
  if (goalCount <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((doneCount / goalCount) * 100)));
}

export function MemberProgressList({ goalCount, members }: Props) {
  if (members.length === 0) {
    return <Text style={styles.empty}>아직 참여한 멤버가 없어요.</Text>;
  }
  return (
    <View style={styles.list}>
      {members.map((m) => {
        const progress = progressPercent(m.doneCount, goalCount);
        return (
          <View key={m.id} style={styles.card}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{m.displayName}</Text>
              {!m.signed && <Text style={styles.unsigned}>서명 대기</Text>}
            </View>
            <Text style={styles.count}>
              {m.doneCount}/{goalCount}회
            </Text>
            <View
              accessibilityLabel={`${m.displayName} 진행률`}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: progress }}
              style={styles.track}
            >
              <View style={[styles.fill, { width: `${progress}%` }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    borderColor: colors.border,
    borderRadius: 12,
    borderStyle: "dashed",
    borderWidth: 1,
    color: colors.textMuted,
    fontSize: 14,
    padding: 16,
  },
  list: {
    gap: 10,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  nameRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  name: {
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: "600",
  },
  unsigned: {
    color: colors.warn,
    fontSize: 11,
    fontWeight: "600",
  },
  count: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  track: {
    backgroundColor: colors.muted,
    borderRadius: 999,
    height: 6,
    marginTop: 8,
    overflow: "hidden",
  },
  fill: {
    backgroundColor: colors.primary,
    height: "100%",
  },
});
