// EVAL-0055 — 알림 설정 섹션: notification_prefs 3종 토글 + 권한 재요청/거부 안내.
// 포팅 소스: apps/web/src/app/(app)/me/_components/{push-settings,notification-card}.tsx.
// 토글 ON 시 push-notification capability(registerPushToken)로 권한 확보 + 토큰 등록(멱등)을 재사용하고,
// 전체 OFF 시 unregisterPushToken 으로 이 기기 토큰을 무효화한다(재구현 없음).
// 권한이 거부되면 켜진 상태로 두지 않고 OS 설정 안내만 노출한다(PRD §6.3 AC-7).
import type { NotificationPrefs } from "@withkey/domain";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import { registerPushToken, unregisterPushToken } from "@/capabilities/push-notification";
import { fetchNotificationPrefs } from "@/features/profile/api/profile-reads";
import { Button } from "@/shared/ui";
import { colors } from "@/shared/theme/colors";
import { radius } from "@/shared/theme/radius";
import { spacing } from "@/shared/theme/spacing";
import { typography } from "@/shared/theme/typography";

import { openNotificationSettings, updateNotificationPrefs } from "./notification-prefs";

type ToggleKey = keyof NotificationPrefs;

// web push-settings.tsx 의 라벨/설명과 1:1 (start·deadline·kudos).
const TOGGLES: { key: ToggleKey; label: string; description: string }[] = [
  { key: "start", label: "그룹 활동 알림", description: "챌린지 시작과 친구 인증을 알려드려요" },
  { key: "deadline", label: "마감 임박 알림", description: "마감 24시간 전" },
  { key: "kudos", label: "응원 받음 알림", description: "내 인증글에 응원이 달리면 알려드려요" },
];

export function NotificationSettingsSection({ userId }: { userId: string }) {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const activeRef = useRef(true);
  // 이 기기의 토큰 등록이 성공했는지 추적 — 이미 등록됐고 ≥1 개 ON 이면 재등록(upsert)을 건너뛴다.
  // 등록 미완/직전 실패(false)면 다음 turn-on 에서 다시 등록을 시도한다(회귀 방지).
  const tokenRegisteredRef = useRef(false);

  useEffect(() => {
    activeRef.current = true;
    // userId 가 바뀌면(계정 전환) 등록 상태를 초기화 — 다른 사용자 기준으로 재등록해야 한다.
    tokenRegisteredRef.current = false;
    // 초기 prefs read (RLS self-row) — 실패는 전부 OFF 폴백(profile-reads 정책).
    void fetchNotificationPrefs(userId).then((loaded) => {
      if (activeRef.current) setPrefs(loaded);
    });
    return () => {
      activeRef.current = false;
    };
  }, [userId]);

  const handleToggle = useCallback(
    (key: ToggleKey, value: boolean) => {
      if (!prefs || saving) return;
      const prev = prefs;
      const next: NotificationPrefs = { ...prefs, [key]: value };
      setPrefs(next); // optimistic
      setErrorMsg(null);

      void (async () => {
        setSaving(true);
        try {
          if (value) {
            const wasAllOff = !(prev.start || prev.deadline || prev.kudos);
            // 등록은 "전부 OFF → 처음 하나 ON" 전환에서만 필요하다.
            // 단 아직 이 기기 토큰이 등록되지 않았다면(미등록·직전 실패) 그때도 등록을 시도한다.
            const needsRegister = wasAllOff || !tokenRegisteredRef.current;
            if (needsRegister) {
              // 권한 확보 + 토큰 등록을 capability 로 위임(권한 미허용이면 내부에서 재요청).
              const res = await registerPushToken(userId);
              if (!res.ok && res.reason === "permission_denied") {
                // 거부 → 켠 상태 유지하지 않고 설정 안내만(AC-7).
                setPrefs(prev);
                setPermissionBlocked(true);
                return;
              }
              // ok 일 때만 등록 성공으로 표시 — not_device·no_project_id·error 는 다음에 재시도.
              tokenRegisteredRef.current = res.ok;
              // not_device·no_project_id·error 는 delivery 인프라/기기 한계 — pref 저장은 진행(best-effort).
              setPermissionBlocked(false);
            }
          }

          const saved = await updateNotificationPrefs(userId, next);
          if (!saved.ok) {
            setPrefs(prev);
            setErrorMsg("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
            return;
          }

          const anyOn = next.start || next.deadline || next.kudos;
          if (!anyOn) {
            // 전체 OFF → 이 기기 토큰을 soft-delete(dispatch 대상에서 제외).
            const result = await unregisterPushToken(userId);
            if (!result.ok) {
              // soft-delete 실패는 위생 수준(다음 로그인 upsert 로 재활성) — 흐름은 막지 않고 컨텍스트만 남긴다.
              console.error("[NotificationSettings] unregisterPushToken failed", userId);
            } else {
              // 무효화됐으니 다음 turn-on 에서 재등록이 필요하다.
              tokenRegisteredRef.current = false;
            }
          }
        } finally {
          if (activeRef.current) setSaving(false);
        }
      })();
    },
    [prefs, saving, userId],
  );

  return (
    <View style={styles.section} accessibilityLabel="알림 설정">
      <Text style={styles.heading}>알림 설정</Text>
      {prefs === null ? (
        <Text style={styles.hint}>불러오는 중…</Text>
      ) : (
        <>
          {TOGGLES.map(({ key, label, description }) => (
            <View key={key} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{label}</Text>
                <Text style={styles.rowDescription}>{description}</Text>
              </View>
              <Switch
                accessibilityLabel={label}
                value={prefs[key]}
                disabled={saving}
                onValueChange={(v) => handleToggle(key, v)}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
          ))}
          <Text style={styles.hint}>새벽 2~7시(KST)는 자동 차단돼요.</Text>
          {permissionBlocked && (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                알림 권한이 꺼져 있어요. 기기 설정에서 알림을 켜야 받을 수 있어요.
              </Text>
              <Button variant="outline" size="sm" onPress={openNotificationSettings}>
                설정 열기
              </Button>
            </View>
          )}
          {errorMsg && (
            <Text style={styles.error} accessibilityRole="alert">
              {errorMsg}
            </Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  heading: {
    ...typography.h3,
    color: colors.foreground,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
  rowLabel: {
    ...typography.body,
    color: colors.foreground,
    fontWeight: "600",
  },
  rowDescription: {
    ...typography.sub,
  },
  hint: {
    ...typography.caption,
  },
  notice: {
    backgroundColor: colors.brandSecondarySoft,
    borderRadius: radius.md,
    gap: spacing.sm,
    padding: spacing.md,
  },
  noticeText: {
    ...typography.sub,
    color: colors.foreground,
  },
  error: {
    ...typography.sub,
    color: colors.destructive,
  },
});
