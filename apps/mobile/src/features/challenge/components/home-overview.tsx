// 홈 요약 (EVAL-0017 · web home/page.tsx + _components 패리티) —
// 초대받은(미서명 pending) 배너 · stats 4칸 · 진행 중 리스트 · 정산 대기(over) 리스트.
// 데이터는 EVAL-0016 계약(GroupChallengeView)만 소비, 조립 분기는 web 과 동일 기준:
// stats 는 phase==='running' && userIsParticipant 만(ADR-0027), over 는 정산 대기로 분리.
import { formatKRW, formatKRWParts, type GroupChallengeView } from "@withkey/domain";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/shared/theme/colors";

type ChallengeView = NonNullable<GroupChallengeView["challenge"]>;
type ChallengeRow = GroupChallengeView & { challenge: ChallengeView };

type Props = {
  groups: readonly GroupChallengeView[];
  /** 내가 참여자이면서 아직 서명하지 않은 pending 챌린지 id (fetchMyUnsignedChallengeIds). */
  unsignedPendingIds: ReadonlySet<string>;
};

export function HomeOverview({ groups, unsignedPendingIds }: Props) {
  const router = useRouter();

  const hasAnyChallenge = groups.some((g) => g.challenge !== null);
  if (!hasAnyChallenge) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>아직 진행 중인 챌린지가 없어요</Text>
        <Text style={styles.emptyDescription}>친구들과 함께 챌린지를 만들어보세요</Text>
      </View>
    );
  }

  const rows = groups.filter((g): g is ChallengeRow => g.challenge !== null);
  const invites = rows.filter(
    (g) => g.challenge.phase === "pending" && unsignedPendingIds.has(g.challenge.id),
  );
  // 진행 중 섹션은 pending/accepted/running 만. over(만기)는 정산 대기로 분리 (ADR-0027).
  const runningRows = rows.filter((g) => g.challenge.phase !== "over");
  const settlementRows = rows.filter((g) => g.challenge.phase === "over");

  // stats — web home/page.tsx 와 동일: running + 본인 참가 코호트만.
  const activeChallenges = rows
    .map((g) => g.challenge)
    .filter((c) => c.phase === "running" && c.userIsParticipant);
  const stats = {
    activeCount: activeChallenges.length,
    completedToday: activeChallenges.filter((c) => c.verifiedToday).length,
    pendingToday: activeChallenges.filter((c) => !c.verifiedToday).length,
    totalPenalty: activeChallenges.reduce((sum, c) => sum + c.myConfirmedPenalty, 0),
  };
  const penalty = formatKRWParts(stats.totalPenalty);

  return (
    <View style={styles.stack}>
      {invites.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`초대받은 챌린지 ${invites.length}건`}
          onPress={() =>
            router.push({
              pathname: "/challenge/[id]/pledge",
              params: { id: invites[0]!.challenge.id },
            })
          }
          style={({ pressed }) => [styles.inviteBanner, pressed && styles.pressed]}
        >
          <Text style={styles.inviteTitle}>초대받은 챌린지 {invites.length}</Text>
          <Text style={styles.inviteSubtitle} numberOfLines={1}>
            {invites[0]!.groupName
              ? `${invites[0]!.groupName} · ${invites[0]!.challenge.title}`
              : invites[0]!.challenge.title}
          </Text>
        </Pressable>
      )}

      <View accessibilityLabel="오늘 챌린지 현황" style={styles.statsCard}>
        <StatCell tone={colors.primary} value={String(stats.activeCount)} label="진행 중" />
        <StatCell tone={colors.success} value={String(stats.completedToday)} label="오늘 완료" />
        <StatCell tone={colors.warn} value={String(stats.pendingToday)} label="미인증" />
        <StatCell
          tone={colors.textMuted}
          value={penalty.number}
          unit={penalty.unit}
          label="내 벌금"
        />
      </View>

      {runningRows.length > 0 && (
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>진행 중 챌린지</Text>
            <Text style={styles.sectionCount}>{runningRows.length}개</Text>
          </View>
          {runningRows.map((g) => (
            <ChallengeRowItem
              key={g.challenge.id}
              row={g}
              onPress={() =>
                router.push({ pathname: "/challenge/[id]", params: { id: g.challenge.id } })
              }
            />
          ))}
        </View>
      )}

      {settlementRows.length > 0 && (
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>정산 대기</Text>
            <Text style={styles.sectionCount}>{settlementRows.length}개</Text>
          </View>
          {settlementRows.map((g) => (
            <Pressable
              key={g.challenge.id}
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: "/challenge/[id]/recap", params: { id: g.challenge.id } })
              }
              style={({ pressed }) => [styles.rowItem, pressed && styles.pressed]}
            >
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {g.challenge.title}
                </Text>
                <Text style={styles.rowMeta}>
                  종료 · 정산하기 · 모인 벌금 {formatKRW(g.challenge.potTotal)}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function ChallengeRowItem({ row, onPress }: { row: ChallengeRow; onPress: () => void }) {
  const c = row.challenge;
  const joinedLate = c.phase === "running" && !c.userIsParticipant;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.rowItem, pressed && styles.pressed]}
    >
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {c.title}
        </Text>
        <Text style={styles.rowMeta}>{challengeMetaLabel(c, joinedLate)}</Text>
      </View>
      <Text style={styles.rowTrailing}>{trailingLabel(c, joinedLate)}</Text>
    </Pressable>
  );
}

// web RunningChallengeList ChallengeMeta 와 동일 분기.
function challengeMetaLabel(c: ChallengeView, joinedLate: boolean): string {
  if (joinedLate) return "이미 시작됨 · 다음 챌린지부터 함께해요";
  if (c.phase === "pending" || c.phase === "accepted") {
    return `${c.participantCount}명 · 서명 대기 · 모인 벌금 ${formatKRW(c.potTotal)}`;
  }
  const today = c.verifiedToday ? "오늘 완료" : "오늘 미인증";
  return `${c.participantCount}명 · ${today} · 모인 벌금 ${formatKRW(c.potTotal)}`;
}

function trailingLabel(c: ChallengeView, joinedLate: boolean): string {
  if (joinedLate) return "";
  if (c.phase === "running") return `D-${Math.max(c.daysLeft, 0)}`;
  return "";
}

function StatCell({
  tone,
  value,
  unit,
  label,
}: {
  tone: string;
  value: string;
  unit?: string;
  label: string;
}) {
  return (
    <View style={styles.statCell}>
      <Text
        numberOfLines={1}
        style={[styles.statValue, unit != null && styles.statValueSmall, { color: tone }]}
      >
        {value}
        {unit != null && <Text style={styles.statUnit}>{unit}</Text>}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12,
  },
  pressed: {
    opacity: 0.85,
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 36,
  },
  emptyTitle: {
    color: colors.textStrong,
    fontSize: 17,
    fontWeight: "700",
  },
  emptyDescription: {
    color: colors.textSubtle,
    fontSize: 14,
    marginTop: 6,
  },
  inviteBanner: {
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    padding: 14,
  },
  inviteTitle: {
    color: colors.textStrong,
    fontSize: 15,
    fontWeight: "700",
  },
  inviteSubtitle: {
    color: colors.textSubtle,
    fontSize: 13,
    marginTop: 2,
  },
  statsCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 14,
  },
  statCell: {
    alignItems: "center",
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
  },
  statValueSmall: {
    fontSize: 16,
  },
  statUnit: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "500",
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 11,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 6,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    color: colors.textStrong,
    fontSize: 15,
    fontWeight: "700",
  },
  sectionCount: {
    color: colors.textMuted,
    fontSize: 12,
  },
  rowItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  rowBody: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.textStrong,
    fontSize: 15,
    fontWeight: "600",
  },
  rowMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  rowTrailing: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "700",
  },
});
