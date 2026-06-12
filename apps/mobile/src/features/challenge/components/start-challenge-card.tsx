// 운영자 시작 카드 (EVAL-0018 · web start-challenge-card.tsx 패리티) —
// status==='pending' && owner && 본인 서명 완료일 때만 노출(렌더 조건은 호출 화면).
// owner-only 강제는 RPC(0039)가 담당 — 클라이언트 조건은 표시용일 뿐이다.
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/shared/theme/colors";

import { startChallengeWithSignedParticipants } from "../api/challenge-lifecycle";

type Props = {
  challengeId: string;
  signedCount: number;
  unsignedCount: number;
  /** 시작 성공 후 호출 — 화면이 detail 을 다시 읽어 running 상태를 반영한다. */
  onStarted: () => void;
};

export function StartChallengeCard({ challengeId, signedCount, unsignedCount, onStarted }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = signedCount <= 1 ? "혼자 시작하기" : "서명한 멤버로 시작하기";

  // async handler 를 onPress 에 그대로 넘기지 않는다 — void 처리 + 에러 표면화.
  function handleStart() {
    if (pending) return;
    setPending(true);
    setError(null);
    void startChallengeWithSignedParticipants(challengeId)
      .then((res) => {
        if (!res.ok) {
          setError(
            res.error === "forbidden"
              ? "챌린지를 시작할 수 없어요. 서명 상태를 확인해 주세요."
              : "시작에 실패했어요. 다시 시도해 주세요.",
          );
          return;
        }
        onStarted();
      })
      .catch((err) => {
        console.error("[StartChallengeCard] unexpected throw:", err);
        setError("시작에 실패했어요. 다시 시도해 주세요.");
      })
      .finally(() => setPending(false));
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {unsignedCount === 0 ? "전원 서명 완료 🎉" : "시작할 준비가 됐어요"}
      </Text>
      <Text style={styles.description}>
        서명한 {signedCount}명으로 지금 시작할 수 있어요.
        {unsignedCount > 0
          ? ` 아직 서명하지 않은 ${unsignedCount}명은 다음 챌린지부터 함께해요.`
          : ""}
      </Text>
      {error != null && <Text style={styles.error}>{error}</Text>}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: pending }}
        disabled={pending}
        onPress={handleStart}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        {pending ? (
          <ActivityIndicator color={colors.inverse} />
        ) : (
          <Text style={styles.buttonLabel}>{label}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    marginHorizontal: 16,
    padding: 16,
  },
  title: {
    color: colors.textStrong,
    fontSize: 16,
    fontWeight: "700",
  },
  description: {
    color: colors.textSubtle,
    fontSize: 13,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 4,
    minHeight: 48,
  },
  pressed: {
    opacity: 0.85,
  },
  buttonLabel: {
    color: colors.inverse,
    fontSize: 15,
    fontWeight: "700",
  },
});
