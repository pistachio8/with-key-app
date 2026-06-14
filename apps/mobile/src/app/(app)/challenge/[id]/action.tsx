// /challenge/[id]/action — 사진 인증 제출 (EVAL-0019 · D-7 spec C5 · web action-form.tsx 패리티).
// 활동 선택 → 키워드(풀 shuffle, 최대 3) → 사진 촬영/선택(권한·재시도) → 압축(1920px/JPEG) →
// submitActionLog BFF(POST /api/action-log). secret(OpenAI·service-role)은 서버만 본다.
// id uuid 검증은 상위 _layout 에서 완료. AI 일기·doneCount·feed 반영은 서버 코어가 수행한다.
import {
  ACTIVITY_TYPES,
  canReroll,
  initialShuffle,
  reroll,
  type ActivityType,
  type ShuffleState,
  type SubmitActionLogResponse,
} from "@withkey/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  preparePhotoForUpload,
  submitActionLog,
  type NativePhotoPart,
} from "@/features/action-log";
import { colors } from "@/shared/theme/colors";

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  running: "🏃 러닝",
  gym: "🏋️ 헬스",
  yoga: "🧘 요가",
  other: "✨ 기타",
  meal: "🥗 식단",
};

const MAX_KEYWORDS = 3;

type SubmitSuccess = Extract<SubmitActionLogResponse, { ok: true }>["data"];

// ErrorCode → 사용자 문구 (web makeUserMessage 패리티 — not_found/forbidden 특화 + 기본).
function errorLabel(error: string): string {
  switch (error) {
    case "not_found":
      return "현재 참여 중인 챌린지를 찾을 수 없어요.";
    case "forbidden":
      return "지금은 인증할 수 있는 기간이 아니에요.";
    case "invalid_input":
      return "입력을 다시 확인해 주세요.";
    default:
      return "인증에 실패했어요. 잠시 후 다시 시도해 주세요.";
  }
}

type Status = "idle" | "preparing" | "submitting" | "done" | "error";

export default function ChallengeActionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0]! : params.id;

  const [activityType, setActivityType] = useState<ActivityType>("gym");
  const [shuffle, setShuffle] = useState<ShuffleState>(() => initialShuffle("gym"));
  const [selected, setSelected] = useState<string[]>([]);
  const [photo, setPhoto] = useState<NativePhotoPart | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitSuccess | null>(null);

  const busy = status === "preparing" || status === "submitting";
  const canSubmit = selected.length >= 1 && !busy;

  const selectActivity = useCallback((type: ActivityType) => {
    setActivityType(type);
    setShuffle(initialShuffle(type));
    setSelected([]);
  }, []);

  const toggleKeyword = useCallback((keyword: string) => {
    setSelected((prev) => {
      if (prev.includes(keyword)) return prev.filter((k) => k !== keyword);
      if (prev.length >= MAX_KEYWORDS) return prev;
      return [...prev, keyword];
    });
  }, []);

  const onReroll = useCallback(() => {
    setShuffle((prev) => {
      const next = reroll(prev);
      // 새 키워드 세트라 이전 선택 중 사라진 것은 해제 — 남은 것만 유지.
      setSelected((sel) => sel.filter((k) => next.shown.includes(k)));
      return next;
    });
  }, []);

  const pickPhoto = useCallback(async (source: "camera" | "library") => {
    setPhotoNotice(null);
    try {
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setPhotoNotice(
          source === "camera"
            ? "카메라 권한이 필요해요. 설정에서 허용한 뒤 다시 시도해 주세요."
            : "사진 보관함 권한이 필요해요. 설정에서 허용한 뒤 다시 시도해 주세요.",
        );
        return;
      }
      const picked =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
      const asset = picked.canceled ? null : picked.assets[0];
      if (!asset) return;

      setStatus("preparing");
      const prepared = await preparePhotoForUpload({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        fileName: asset.fileName,
      });
      setStatus("idle");
      if (!prepared.ok) {
        setPhotoNotice(
          prepared.reason === "too_large"
            ? "사진이 너무 커요. 다른 사진을 선택해 주세요."
            : "사진 처리에 실패했어요. 다시 시도해 주세요.",
        );
        return;
      }
      setPhoto(prepared.photo);
    } catch {
      // 카메라/보관함 호출 실패(하드웨어·시스템 제한 등) — void 호출이 rejection 을 삼켜
      // 무반응이 되지 않도록 사용자에 피드백한다. 사진 본문/오류 상세는 로그 금지.
      setStatus("idle");
      setPhotoNotice("사진을 불러오지 못했어요. 다시 시도해 주세요.");
    }
  }, []);

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setStatus("submitting");
    setErrorMessage(null);
    try {
      const response = await submitActionLog({
        challengeId: id,
        activityType: shuffle.activityType,
        selectedKeywords: selected,
        shownKeywords: shuffle.shown,
        rerollCount: shuffle.rerollCount,
        photo,
      });
      if (response.ok) {
        setResult(response.data);
        setStatus("done");
      } else {
        setErrorMessage(errorLabel(response.error));
        setStatus("error");
      }
    } catch {
      // 계약 위반·네트워크·타임아웃 — 본문은 로그 금지, 사용자엔 일반 문구.
      setErrorMessage("인증에 실패했어요. 잠시 후 다시 시도해 주세요.");
      setStatus("error");
    }
  }, [canSubmit, id, shuffle, selected, photo]);

  if (status === "done" && result) {
    return (
      <ActionDone
        result={result}
        onClose={() => router.replace({ pathname: "/challenge/[id]", params: { id } })}
      />
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>인증하기</Text>

        <Text style={styles.sectionLabel}>오늘 한 운동</Text>
        <View style={styles.chipRow}>
          {ACTIVITY_TYPES.map((type) => {
            const active = type === activityType;
            return (
              <Pressable
                key={type}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                disabled={busy}
                onPress={() => selectActivity(type)}
                style={({ pressed }) => [
                  styles.chip,
                  active && styles.chipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {ACTIVITY_LABELS[type]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>
            느낌 키워드 <Text style={styles.muted}>(최대 {MAX_KEYWORDS}개)</Text>
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy || !canReroll(shuffle)}
            onPress={onReroll}
            style={({ pressed }) => [
              styles.rerollButton,
              (busy || !canReroll(shuffle)) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.rerollLabel}>🎲 다시 뽑기</Text>
          </Pressable>
        </View>
        <View style={styles.chipRow}>
          {shuffle.shown.map((keyword) => {
            const active = selected.includes(keyword);
            const atLimit = !active && selected.length >= MAX_KEYWORDS;
            return (
              <Pressable
                key={keyword}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                disabled={busy || atLimit}
                onPress={() => toggleKeyword(keyword)}
                style={({ pressed }) => [
                  styles.chip,
                  active && styles.chipActive,
                  atLimit && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{keyword}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>사진 (선택)</Text>
        {photo ? (
          <View style={styles.photoPreviewWrap}>
            <Image source={{ uri: photo.uri }} style={styles.photoPreview} resizeMode="cover" />
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => setPhoto(null)}
              style={({ pressed }) => [styles.photoRemove, pressed && styles.pressed]}
            >
              <Text style={styles.photoRemoveLabel}>사진 지우기</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.photoButtonRow}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void pickPhoto("camera")}
              style={({ pressed }) => [styles.photoButton, pressed && styles.pressed]}
            >
              <Text style={styles.photoButtonLabel}>📷 촬영</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void pickPhoto("library")}
              style={({ pressed }) => [styles.photoButton, pressed && styles.pressed]}
            >
              <Text style={styles.photoButtonLabel}>🖼️ 보관함</Text>
            </Pressable>
          </View>
        )}
        {photoNotice != null && <Text style={styles.notice}>{photoNotice}</Text>}

        {errorMessage != null && <Text style={styles.errorText}>{errorMessage}</Text>}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={() => void onSubmit()}
          style={({ pressed }) => [
            styles.submitButton,
            !canSubmit && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {busy ? (
            <View style={styles.submitBusy}>
              <ActivityIndicator color={colors.inverse} />
              <Text style={styles.submitLabel}>
                {status === "preparing" ? "사진 준비 중..." : "인증 중..."}
              </Text>
            </View>
          ) : (
            <Text style={styles.submitLabel}>인증 완료</Text>
          )}
        </Pressable>
        {selected.length < 1 && (
          <Text style={styles.hint}>키워드를 1개 이상 선택하면 인증할 수 있어요.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

type DoneProps = {
  result: SubmitSuccess;
  onClose: () => void;
};

function ActionDone({ result, onClose }: DoneProps) {
  const doneCount = result.verifiedDays.length;
  return (
    <SafeAreaView style={styles.doneScreen}>
      <Text style={styles.doneEmoji}>{result.goalReached ? "🎉" : "✅"}</Text>
      <Text style={styles.doneTitle}>
        {result.isFirstAction ? "첫 인증 완료!" : result.goalReached ? "목표 달성!" : "인증 완료!"}
      </Text>
      <Text style={styles.doneSummary}>{result.summary}</Text>
      <Text style={styles.doneMeta}>
        {result.currentDay}일차 · 누적 인증 {doneCount}/{result.goalCount}일
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onClose}
        style={({ pressed }) => [styles.submitButton, styles.doneButton, pressed && styles.pressed]}
      >
        <Text style={styles.submitLabel}>피드 보기</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    gap: 12,
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    color: colors.textStrong,
    fontSize: 24,
    fontWeight: "800",
  },
  sectionLabel: {
    color: colors.textStrong,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 8,
  },
  sectionHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  muted: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "500",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  chipLabelActive: {
    color: colors.inverse,
  },
  rerollButton: {
    backgroundColor: colors.muted,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rerollLabel: {
    color: colors.textStrong,
    fontSize: 13,
    fontWeight: "700",
  },
  photoButtonRow: {
    flexDirection: "row",
    gap: 8,
  },
  photoButton: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 18,
  },
  photoButtonLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  photoPreviewWrap: {
    gap: 8,
  },
  photoPreview: {
    aspectRatio: 1,
    backgroundColor: colors.muted,
    borderRadius: 12,
    width: "100%",
  },
  photoRemove: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  photoRemoveLabel: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  notice: {
    color: colors.warn,
    fontSize: 13,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "600",
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 14,
    marginTop: 8,
    paddingVertical: 16,
  },
  submitBusy: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  submitLabel: {
    color: colors.inverse,
    fontSize: 16,
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.85,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center",
  },
  doneScreen: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 24,
  },
  doneEmoji: {
    fontSize: 56,
  },
  doneTitle: {
    color: colors.textStrong,
    fontSize: 24,
    fontWeight: "800",
  },
  doneSummary: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  doneMeta: {
    color: colors.textMuted,
    fontSize: 14,
  },
  doneButton: {
    alignSelf: "stretch",
    marginTop: 16,
  },
});
