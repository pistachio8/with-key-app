// /group/[id] — 그룹 상세 (EVAL-0077, read-only · web group/[id]/page.tsx 패리티).
// 위계: 그룹명 헤더 → 정산 계좌(마스킹) → 멤버 리스트 → 챌린지 목록 (PWA 순서 1:1).
// mutation(계좌 추가/변경·그룹명 변경·삭제·초대 재발급)은 Non-goal — write 경로 후속 task.
// 계좌 평문 reveal 은 BFF 단일 경로(D-016) — read-only 범위에서 노출하지 않는다.
import {
  BANK_NAMES,
  challengePhase,
  maskAccountNumber,
  remainingDays,
  toKstDayKey,
  type BankCode,
  type ChallengePhase,
  type GroupChallengeRow,
  type GroupMemberView,
} from "@withkey/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "@/features/auth";
import { fetchGroupDetail } from "@/features/group";
import { PlaceholderScreen } from "@/shared/components/placeholder-screen";
import { LoadingScreen, ReadErrorScreen } from "@/shared/components/screen-states";
import { useAsyncRead } from "@/shared/hooks/use-async-read";
import { colors } from "@/shared/theme/colors";
import { spacing } from "@/shared/theme/spacing";
import { typography } from "@/shared/theme/typography";
import { Card, Chip, type ChipTone } from "@/shared/ui";

export default function GroupDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0]! : params.id;

  const { session } = useSession();
  const viewerId = session?.user.id ?? null;

  const read = useCallback(() => fetchGroupDetail(id), [id]);
  const { state, refreshing, reload, refresh } = useAsyncRead(read);

  if (state.status === "loading") return <LoadingScreen />;
  if (state.status === "error") return <ReadErrorScreen onRetry={reload} />;
  // RLS 가 비멤버·해체 그룹을 null 로 필터링 (web notFound() 대응).
  if (state.data === null) {
    return (
      <PlaceholderScreen
        title="그룹을 찾을 수 없어요"
        lines={["참여 중인 그룹이 아니거나 해체된 그룹이에요."]}
      />
    );
  }

  const detail = state.data;
  const isOwner = detail.ownerId === viewerId;

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
          <GroupHeader name={detail.name} isOwner={isOwner} memberCount={detail.members.length} />
          <AccountCard
            bankCode={detail.bankCode}
            accountHolder={detail.accountHolder}
            accountNumberLast4={detail.accountNumberLast4}
          />
          <MembersSection members={detail.members} />
          <ChallengesSection challenges={detail.challenges} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function groupName(name: string | null): string {
  return name ?? "이름 없는 그룹";
}

// 헤더 — 그룹명(t-h1) + 내 역할·멤버 수 칩 (web group-header.tsx read-only 부분).
function GroupHeader({
  name,
  isOwner,
  memberCount,
}: {
  name: string | null;
  isOwner: boolean;
  memberCount: number;
}) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{groupName(name)}</Text>
      <View style={styles.chipRow}>
        <Chip tone={isOwner ? "primary" : "neutral"}>{isOwner ? "운영자" : "멤버"}</Chip>
        <Chip tone="neutral">멤버 {memberCount}명</Chip>
      </View>
    </View>
  );
}

// 정산 계좌 — 마스킹 표시 전용. 계좌 미등록(bankCode/last4 null)은 카드 숨김(info.tsx AccountCard 패턴).
function AccountCard({
  bankCode,
  accountHolder,
  accountNumberLast4,
}: {
  bankCode: string | null;
  accountHolder: string | null;
  accountNumberLast4: string | null;
}) {
  if (bankCode == null || accountNumberLast4 == null) return null;
  const bankName = BANK_NAMES[bankCode as BankCode] ?? bankCode;
  return (
    <Card padding="lg" style={styles.accountCard}>
      <Text style={styles.sectionCaption}>정산 계좌</Text>
      <Text style={styles.accountPrimary} numberOfLines={1}>
        {accountHolder != null ? `${accountHolder} · ${bankName}` : bankName}
      </Text>
      <Text style={styles.accountNumber}>{maskAccountNumber(accountNumberLast4)}</Text>
    </Card>
  );
}

// 멤버 리스트 — 아바타 이니셜 + 이름 + 가입일 + 운영자 칩 (web group-members.tsx).
function MembersSection({ members }: { members: GroupMemberView[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionCaption}>멤버 ({members.length}명)</Text>
      <Card padding="none">
        {members.map((m, i) => (
          <View key={m.id} style={[styles.memberRow, i > 0 && styles.memberRowDivider]}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{m.displayName.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.memberInfo}>
              <Text style={styles.memberName} numberOfLines={1}>
                {m.displayName}
              </Text>
              <Text style={styles.memberJoined}>{joinedLabel(m.joinedAt)}부터</Text>
            </View>
            {m.role === "owner" && <Chip tone="primary">운영자</Chip>}
          </View>
        ))}
      </Card>
    </View>
  );
}

// ADR-0027 — 배지·D-N 은 status 가 아니라 phase 기준. over(만기 active)는 "정산 대기".
const PHASE_LABEL: Record<ChallengePhase, { label: string; tone: ChipTone }> = {
  pending: { label: "서명 대기", tone: "neutral" },
  accepted: { label: "곧 시작", tone: "neutral" },
  running: { label: "진행 중", tone: "primary" },
  over: { label: "정산 대기", tone: "neutral" },
  closed: { label: "종료", tone: "success" },
};

// 소속 챌린지 목록 — 상세 진입 링크. 빈 목록은 섹션 숨김(web group-challenges-list.tsx 동일).
function ChallengesSection({ challenges }: { challenges: GroupChallengeRow[] }) {
  const router = useRouter();
  if (challenges.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionCaption}>챌린지 ({challenges.length}개)</Text>
      <View style={styles.challengeList}>
        {challenges.map((c) => {
          const phase = challengePhase(c.status, c.endAt);
          const meta = PHASE_LABEL[phase];
          const dDay = phase === "running" ? `D-${remainingDays(c.endAt)}` : null;
          return (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/challenge/[id]", params: { id: c.id } })}
              style={({ pressed }) => (pressed ? styles.pressed : undefined)}
            >
              <Card padding="md" style={styles.challengeRow}>
                <View style={styles.challengeInfo}>
                  <Text style={styles.challengeTitle} numberOfLines={1}>
                    {c.title}
                  </Text>
                  <View style={styles.chipRow}>
                    <Chip tone={meta.tone}>{meta.label}</Chip>
                    {dDay != null && <Chip tone="neutral">{dDay}</Chip>}
                  </View>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Card>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// KST 캘린더 일자 표기 — Intl(ICU) 의존을 피해 도메인 helper 로 YYYY.MM.DD (info.tsx 선례).
function joinedLabel(iso: string): string {
  return toKstDayKey(iso).replaceAll("-", ".");
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
    gap: spacing.lg,
    paddingBottom: spacing["2xl"],
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  header: {
    gap: spacing.sm,
  },
  title: {
    ...typography.h1,
    color: colors.foreground,
  },
  chipRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  accountCard: {
    gap: spacing.xs,
  },
  sectionCaption: {
    ...typography.caption,
  },
  accountPrimary: {
    ...typography.h3,
    color: colors.foreground,
  },
  accountNumber: {
    ...typography.sub,
    fontVariant: ["tabular-nums"],
  },
  section: {
    gap: spacing.sm,
  },
  memberRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  memberRowDivider: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.brandPrimarySoft,
    borderRadius: 9999, // 원형 (web rounded-full)
    height: 36, // web size-9
    justifyContent: "center",
    width: 36,
  },
  avatarText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: "700",
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    ...typography.body,
    color: colors.foreground,
    fontWeight: "600",
  },
  memberJoined: {
    ...typography.sub,
  },
  challengeList: {
    gap: spacing.sm,
  },
  challengeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  challengeInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  challengeTitle: {
    ...typography.body,
    color: colors.foreground,
    fontWeight: "600",
  },
  chevron: {
    color: colors.mutedForeground,
    fontSize: 20, // web ChevronRight size-5
  },
  pressed: {
    opacity: 0.85,
  },
});
