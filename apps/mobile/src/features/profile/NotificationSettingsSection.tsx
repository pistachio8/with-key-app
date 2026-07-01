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

  useEffect(() => {
    activeRef.current = true;
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
            // 켤 때: 권한 확보 + 토큰 등록을 capability 로 위임(권한 미허용이면 내부에서 재요청).
            const res = await registerPushToken(userId);
            if (!res.ok && res.reason === "permission_denied") {
              // 거부 → 켠 상태 유지하지 않고 설정 안내만(AC-7).
              setPrefs(prev);
              setPermissionBlocked(true);
              return;
            }
            // not_device·no_project_id·error 는 delivery 인프라/기기 한계 — pref 저장은 진행(best-effort).
            setPermissionBlocked(false);
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
            await unregisterPushToken(userId);
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
