// /challenge/new — 챌린지 생성 flow (EVAL-0018 · web (flow)/challenge/new 패리티).
// create_challenge RPC 코어(00 §13.2 #4) + 운영자 자가 서명 + invite 토큰(#18 RN direct).
// 그룹 0개면 RPC 가 신규 생성(ADR-0012), open 챌린지 있는 그룹은 선택 불가(PRD AC-1 · 0029).
// push/analytics 는 server/BFF 전용(D-2·D-3) — 이 화면에서는 발사하지 않는다.
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "@/features/auth";
import {
  createChallenge,
  fetchOwnerGroupsForChallengeForm,
  type LifecycleErrorCode,
  type OwnerGroupOption,
} from "@/features/challenge";
import { createInvite } from "@/features/invite";
import { LoadingScreen, ReadErrorScreen } from "@/shared/components/screen-states";
import { useAsyncRead } from "@/shared/hooks/use-async-read";
import { colors } from "@/shared/theme/colors";

// web new-challenge-form userMessage 패리티.
const ERROR_MESSAGES: Record<LifecycleErrorCode, string> = {
  invalid_input: "그룹과 챌린지 정보를 다시 확인해 주세요",
  group_selection_required: "그룹을 선택해 주세요",
  forbidden: "그룹장만 챌린지를 만들 수 있어요",
  not_found: "그룹을 찾지 못했어요",
  conflict: "이미 진행 중인 챌린지가 있어요",
  mutation_failed: "챌린지를 만들지 못했어요. 다시 시도해 주세요.",
};

type DoneState = { challengeId: string; inviteUrl: string | null };

export default function ChallengeNewScreen() {
  const { session } = useSession();
  const userId = session?.user.id ?? null;

  const read = useCallback(async (): Promise<OwnerGroupOption[] | null> => {
    if (!userId) return null;
    return fetchOwnerGroupsForChallengeForm(userId);
  }, [userId]);
  const { state, reload } = useAsyncRead(read);

  if (!userId || state.status === "loading") return <LoadingScreen />;
  if (state.status === "error") return <ReadErrorScreen onRetry={reload} />;
  if (state.data === null) return <LoadingScreen />;

  return <NewChallengeForm ownerGroups={state.data} userId={userId} />;
}

function NewChallengeForm({
  ownerGroups,
  userId,
}: {
  ownerGroups: OwnerGroupOption[];
  userId: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("이번 주 운동 서약서");
  const [goalCount, setGoalCount] = useState(7);
  const [durationDays, setDurationDays] = useState(7);
  const [penaltyAmount, setPenaltyAmount] = useState(3000);
  const [agreed, setAgreed] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    ownerGroups.length === 1 ? ownerGroups[0]!.id : null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<DoneState | null>(null);

  const needsGroupSelection = ownerGroups.length >= 2;
  const selectedGroup = ownerGroups.find((g) => g.id === selectedGroupId) ?? null;
  // PRD AC-1 — 선택(또는 단일) 그룹에 open 챌린지가 있으면 생성 불가.
  const openConflict = selectedGroup?.openChallengeId != null;

  // async handler 를 onPress 에 그대로 넘기지 않는다 — void 처리 + 에러 표면화.
  function handleSubmit() {
    if (pending) return;
    if (!title.trim()) {
      setError("챌린지 이름을 입력해 주세요");
      return;
    }
    if (needsGroupSelection && selectedGroupId === null) {
      setError(ERROR_MESSAGES.group_selection_required);
      return;
    }
    if (!agreed) {
      setError("서약서 동의(서명)가 필요해요");
      return;
    }
    setPending(true);
    setError(null);
    void createChallenge(userId, {
      groupId: selectedGroupId ?? undefined,
      title: title.trim(),
      type: "fitness",
      goalCount,
      durationDays,
      penaltyAmount,
      ownerSigned: agreed,
    })
      .then(async (res) => {
        if (!res.ok) {
          setError(ERROR_MESSAGES[res.error]);
          return;
        }
        // invite 발급 실패는 비치명 — 챌린지는 생성됐으므로 done 으로 진행하고
        // 공유 링크 없이 안내한다 (web 은 같은 action 안에서 실패 처리하지만
        // RN 은 생성 성공을 되돌릴 수 없어 부분 성공으로 표면화).
        const invite = await createInvite(res.groupId, userId);
        setDone({ challengeId: res.challengeId, inviteUrl: invite.ok ? invite.url : null });
      })
      .catch((err) => {
        console.error("[createChallenge] unexpected throw:", err);
        setError(ERROR_MESSAGES.mutation_failed);
      })
      .finally(() => setPending(false));
  }

  if (done !== null) {
    return <CreationDone done={done} />;
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.headerRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="닫기"
              onPress={() => router.back()}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Text style={styles.closeLabel}>✕</Text>
            </Pressable>
            <Text style={styles.heading}>챌린지 만들기</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>챌린지 이름</Text>
            <TextInput
              accessibilityLabel="챌린지 이름"
              maxLength={30}
              onChangeText={setTitle}
              placeholder="이번 주 운동 서약서"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              value={title}
            />
          </View>

          {needsGroupSelection && (
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>그룹 선택</Text>
              {ownerGroups.map((g) => {
                const selected = g.id === selectedGroupId;
                const disabled = g.openChallengeId != null;
                return (
                  <Pressable
                    key={g.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled }}
                    disabled={disabled}
                    onPress={() => setSelectedGroupId(g.id)}
                    style={({ pressed }) => [
                      styles.groupRow,
                      selected && styles.groupRowSelected,
                      disabled && styles.groupRowDisabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.groupName, selected && styles.groupNameSelected]}>
                      {g.name ?? "이름 없는 그룹"}
                      {disabled ? " (진행 중)" : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={styles.card}>
            <Stepper
              label="주 인증 횟수"
              max={7}
              min={1}
              onChange={setGoalCount}
              step={1}
              unit="회"
              value={goalCount}
            />
            <Stepper
              label="기간"
              max={90}
              min={7}
              onChange={setDurationDays}
              step={7}
              unit="일"
              value={durationDays}
            />
            <Stepper
              label="회당 벌금"
              max={10000}
              min={0}
              onChange={setPenaltyAmount}
              step={1000}
              unit="원"
              value={penaltyAmount}
            />
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
              운영자로서 위 조건의 서약서에 서명합니다. 어긴 경우 약속대로 입금할게요.
            </Text>
          </Pressable>

          {openConflict && <Text style={styles.error}>{ERROR_MESSAGES.conflict}</Text>}
          {error != null && <Text style={styles.error}>{error}</Text>}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: pending || openConflict }}
            disabled={pending || openConflict}
            onPress={handleSubmit}
            style={({ pressed }) => [
              styles.primaryButton,
              (pending || openConflict) && styles.buttonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonLabel}>
              {pending ? "만드는 중..." : "서약서 만들기"}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// 생성 완료 — web done/[id] 시트 패리티 (초대 링크 공유 + 챌린지 이동).
function CreationDone({ done }: { done: DoneState }) {
  const router = useRouter();

  function handleShare() {
    if (done.inviteUrl === null) return;
    void Share.share({ message: done.inviteUrl }).catch((err) => {
      console.error("[ChallengeNew] share failed:", err);
    });
  }

  return (
    <View style={styles.doneScreen}>
      <Text style={styles.doneTitle}>서약서가 만들어졌어요 🎉</Text>
      {done.inviteUrl !== null ? (
        <>
          <Text style={styles.doneDescription}>
            친구들에게 초대 링크를 공유하면 서명 후 함께 시작할 수 있어요. (72시간 유효)
          </Text>
          <Text selectable style={styles.inviteUrl}>
            {done.inviteUrl}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={handleShare}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryButtonLabel}>초대 링크 공유</Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.doneDescription}>
          초대 링크 발급에 실패했어요. 챌린지 화면에서 다시 시도할 수 있어요.
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.replace({ pathname: "/challenge/[id]", params: { id: done.challengeId } })
        }
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
      >
        <Text style={styles.secondaryButtonLabel}>챌린지로 이동</Text>
      </Pressable>
    </View>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (next: number) => void;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} 줄이기`}
          disabled={value - step < min}
          onPress={() => onChange(Math.max(min, value - step))}
          style={({ pressed }) => [
            styles.stepperButton,
            value - step < min && styles.buttonDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.stepperButtonLabel}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>
          {value.toLocaleString("ko-KR")}
          {unit}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} 늘리기`}
          disabled={value + step > max}
          onPress={() => onChange(Math.min(max, value + step))}
          style={({ pressed }) => [
            styles.stepperButton,
            value + step > max && styles.buttonDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.stepperButtonLabel}>＋</Text>
        </Pressable>
      </View>
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
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingBottom: 4,
  },
  closeButton: {
    alignItems: "center",
    borderRadius: 999,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  closeLabel: {
    color: colors.textSubtle,
    fontSize: 18,
  },
  heading: {
    color: colors.textStrong,
    fontSize: 20,
    fontWeight: "800",
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  fieldLabel: {
    color: colors.textSubtle,
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.textStrong,
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  groupRow: {
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  groupRowSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  groupRowDisabled: {
    opacity: 0.5,
  },
  groupName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  groupNameSelected: {
    color: colors.primary,
  },
  stepperRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  stepperControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  stepperButton: {
    alignItems: "center",
    backgroundColor: colors.muted,
    borderRadius: 999,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  stepperButtonLabel: {
    color: colors.textStrong,
    fontSize: 16,
    fontWeight: "700",
  },
  stepperValue: {
    color: colors.textStrong,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    minWidth: 64,
    textAlign: "center",
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
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 24,
  },
  secondaryButtonLabel: {
    color: colors.textStrong,
    fontSize: 15,
    fontWeight: "700",
  },
  doneScreen: {
    alignItems: "stretch",
    backgroundColor: colors.background,
    flex: 1,
    gap: 12,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  doneTitle: {
    color: colors.textStrong,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  doneDescription: {
    color: colors.textSubtle,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  inviteUrl: {
    backgroundColor: colors.muted,
    borderRadius: 10,
    color: colors.textSubtle,
    fontSize: 12,
    overflow: "hidden",
    padding: 10,
    textAlign: "center",
  },
});
