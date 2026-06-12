// /challenge/[id]/info — 정보 탭 (EVAL-0017, POC read-only · web info-tab.tsx 패리티).
// 서약 조건 info-row + 멤버 서명 현황 + 정산 계좌(마스킹 표시 전용).
// 계좌 평문 reveal 은 BFF 단일 경로(D-016) — read-only 범위에서는 노출하지 않는다.
import {
  BANK_NAMES,
  formatKRW,
  goalCountLabel,
  maskAccountNumber,
  penaltyLabel,
  toKstDayKey,
  type BankCode,
  type ChallengeDetailView,
} from "@withkey/domain";
import { useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { ChallengeScaffold, fetchChallengeDetail } from "@/features/challenge";
import { PlaceholderScreen } from "@/shared/components/placeholder-screen";
import { LoadingScreen, ReadErrorScreen } from "@/shared/components/screen-states";
import { useAsyncRead } from "@/shared/hooks/use-async-read";
import { colors } from "@/shared/theme/colors";

export default function ChallengeInfoScreen() {
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
  const ownerName =
    detail.members.find((m) => m.id === detail.group.ownerId)?.displayName ?? "운영자";

  return (
    <ChallengeScaffold active="info" challengeId={id} detail={detail}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} />}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>정보</Text>
          <InfoRow label="기간" value={`${detail.durationDays}일`} />
          {detail.startAt != null && detail.endAt != null && (
            <InfoRow
              label="일정"
              value={`${dateLabel(detail.startAt)} ~ ${dateLabel(detail.endAt)}`}
            />
          )}
          <InfoRow label="인증 빈도" value={goalCountLabel(detail.goalCount).detail} />
          <InfoRow label="벌금" value={penaltyLabel(detail.penaltyAmount)} />
          <InfoRow label="참여 인원" value={`${detail.participantCount}명`} />
          <InfoRow label="모인 벌금" value={formatKRW(detail.potTotal)} />
          <InfoRow label="운영자" value={ownerName} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>멤버</Text>
          {detail.members.map((m) => (
            <View key={m.id} style={styles.memberRow}>
              <Text style={styles.memberName}>{m.displayName}</Text>
              <Text style={[styles.memberSigned, !m.signed && styles.memberUnsigned]}>
                {m.signed ? "서명 완료" : "서명 대기"}
              </Text>
            </View>
          ))}
        </View>

        <AccountCard detail={detail} />
      </ScrollView>
    </ChallengeScaffold>
  );
}

// 정산 계좌 — 마스킹 표시 전용 (D-016: 평문 복호화는 BFF revealAccountNumber 한 경로만).
function AccountCard({ detail }: { detail: ChallengeDetailView }) {
  const { bankCode, accountHolder, accountNumberLast4 } = detail.group;
  if (bankCode == null || accountNumberLast4 == null) return null;
  const bankName = BANK_NAMES[bankCode as BankCode] ?? bankCode;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>정산 계좌</Text>
      <InfoRow label="은행" value={bankName} />
      <InfoRow label="계좌" value={maskAccountNumber(accountNumberLast4)} />
      {accountHolder != null && <InfoRow label="예금주" value={accountHolder} />}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

// KST 캘린더 일자 — toKstDayKey(YYYY-MM-DD)를 표시용 점 표기로.
function dateLabel(iso: string): string {
  return toKstDayKey(iso).replaceAll("-", ".");
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingBottom: 32,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  cardTitle: {
    color: colors.textStrong,
    fontSize: 15,
    fontWeight: "700",
  },
  infoRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  infoLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  infoValue: {
    color: colors.textStrong,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  memberRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  memberName: {
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: "600",
  },
  memberSigned: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "600",
  },
  memberUnsigned: {
    color: colors.warn,
  },
});
