// /challenge/[id]/pledge — 서약서 서명 (EVAL-0018 · web pledge/page.tsx + pledge-sheet 패리티).
// id uuid 검증은 상위 _layout 에서 완료. 서명은 sign_and_maybe_activate RPC(0040) —
// 자동 시작 없음(0028 freeze), 시작은 owner 가 챌린지 화면의 시작 카드에서 명시 수행.
// web 의 서명 캔버스는 RN 에서 동의 토글로 대체 — RPC 계약(서명 기록)은 동일하다.
import { goalCountLabel, penaltyLabel, type PledgeView } from "@withkey/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "@/features/auth";
import { fetchPendingPledge, signPledge } from "@/features/challenge";
import { LoadingScreen, ReadErrorScreen } from "@/shared/components/screen-states";
import { useAsyncRead } from "@/shared/hooks/use-async-read";
import { colors } from "@/shared/theme/colors";

export default function ChallengePledgeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0]! : params.id;
  const { session } = useSession();
  const userId = session?.user.id ?? null;

  const read = useCallback(async (): Promise<PledgeView | null> => {
    if (!userId) return null;
    return fetchPendingPledge(userId, id);
  }, [userId, id]);
  const { state, reload } = useAsyncRead(read);

  if (!userId || state.status === "loading") return <LoadingScreen />;
  if (state.status === "error") return <ReadErrorScreen onRetry={reload} />;

  const pledge = state.data;
  // 서명 대기 건 없음(이미 active/closed 거나 비참가) — web 은 챌린지로 redirect.
  // RN 은 자동 이동 대신 안내 + 버튼 (deep link 직후 라우팅 race 방지).
  if (pledge === null || pledge.mySigned) {
    return (
      <View style={styles.centerScreen}>
        <Text style={styles.doneTitle}>
          {pledge?.mySigned ? "이미 서명했어요" : "서명할 서약서가 없어요"}
        </Text>
        <Text style={styles.doneDescription}>
          {pledge?.mySigned
            ? "운영자가 시작하면 챌린지가 진행돼요."
            : "이미 시작됐거나 참여 중인 서약서가 아니에요."}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace({ pathname: "/challenge/[id]", params: { id } })}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.primaryButtonLabel}>챌린지 보기</Text>
        </Pressable>
      </View>
    );
  }

  return <PledgeSheet pledge={pledge} currentUserId={userId} />;
}

// web pledge-sheet.tsx 패리티 — 조건 카드 + 멤버 서명 현황 + 동의 토글 + 서명 버튼.
function PledgeSheet({ pledge, currentUserId }: { pledge: PledgeView; currentUserId: string }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myName = pledge.members.find((m) => m.id === currentUserId)?.displayName ?? "익명";
  const isSolo = pledge.members.length === 1;

  // async handler 를 onPress 에 그대로 넘기지 않는다 — void 처리 + 에러 표면화.
  function handleSign() {
    if (pending || !agreed) return;
    setPending(true);
    setError(null);
    void signPledge(pledge.id)
      .then((res) => {
        if (!res.ok) {
          setError(
            res.error === "forbidden"
              ? "서명할 수 없어요. 이미 시작된 챌린지일 수 있어요."
              : "서명에 실패했어요. 다시 시도해 주세요.",
          );
          return;
        }
        router.replace({ pathname: "/challenge/[id]", params: { id: pledge.id } });
      })
      .catch((err) => {
        console.error("[signPledge] unexpected throw:", err);
        setError("서명에 실패했어요. 다시 시도해 주세요.");
      })
      .finally(() => setPending(false));
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading}>서약서</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{pledge.title}</Text>
            <InfoRow label="기간" value={`${pledge.durationDays}일`} />
            <InfoRow label="인증 빈도" value={goalCountLabel(pledge.goalCount).detail} />
            <InfoRow label="벌금" value={penaltyLabel(pledge.penaltyAmount)} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>멤버 서명 현황</Text>
            {pledge.members.map((m) => (
              <View key={m.id} style={styles.memberRow}>
                <Text style={styles.memberName}>{m.displayName}</Text>
                <Text style={[styles.memberSigned, !m.signed && styles.memberUnsigned]}>
                  {m.signed ? "서명 완료" : "서명 대기"}
                </Text>
              </View>
            ))}
          </View>

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            onPress={() => setAgreed((v) => !v)}
            style={({ pressed }) => [styles.consentRow, pressed && styles.pressed]}
          >
            <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
              {agreed && <Text style={styles.checkboxMark}>✓</Text>}
            </View>
            <Text style={styles.consentLabel}>
              나 {myName}은(는) 위 조건에 동의합니다. 어긴 경우{" "}
              {isSolo ? "본인과의 약속대로 지정 계좌에" : "공동 통장에"} 입금할게요.
            </Text>
          </Pressable>

          {error != null && <Text style={styles.error}>{error}</Text>}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !agreed || pending }}
            disabled={!agreed || pending}
            onPress={handleSign}
            style={({ pressed }) => [
              styles.primaryButton,
              (!agreed || pending) && styles.buttonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonLabel}>
              {pending ? "서명 중..." : "서명하고 참여"}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
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
  centerScreen: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  heading: {
    color: colors.textStrong,
    fontSize: 22,
    fontWeight: "800",
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
  consentRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 4,
  },
  checkbox: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1.5,
    height: 22,
    justifyContent: "center",
    marginTop: 1,
    width: 22,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxMark: {
    color: colors.inverse,
    fontSize: 13,
    fontWeight: "700",
  },
  consentLabel: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    paddingHorizontal: 4,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 24,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
  primaryButtonLabel: {
    color: colors.inverse,
    fontSize: 15,
    fontWeight: "700",
  },
  doneTitle: {
    color: colors.textStrong,
    fontSize: 18,
    fontWeight: "700",
  },
  doneDescription: {
    color: colors.textSubtle,
    fontSize: 14,
    marginBottom: 12,
    textAlign: "center",
  },
});
