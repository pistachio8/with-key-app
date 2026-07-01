// EVAL-0055 — 알림 설정 write service: users.notification_prefs RLS self-row update + 설정 앱 딥링크.
// 추출 소스: apps/web/src/app/(app)/me/_actions.ts updateNotificationPrefs(#24 RN direct client).
// 토큰 등록/무효화는 push-notification capability(registerPushToken·unregisterPushToken)를 재사용한다 —
// PWA push_subscriptions(Web Push) 경로는 device_push_tokens 모델로 교체돼 여기서 다루지 않는다.
import { notificationPrefsSchema, type NotificationPrefs } from "@withkey/domain";
import { Linking } from "react-native";

import { getSupabaseClient } from "@/services/supabase/client";

export type UpdateNotificationPrefsResult = { ok: true } | { ok: false };

/**
 * 본인(users.id = userId) row 의 notification_prefs 를 갱신한다. RLS self-row 정책이 타인 row 를 막는다.
 * 입력은 domain 계약(notificationPrefsSchema)으로 검증 — 신규 스키마 정의 없이 재사용한다.
 */
export async function updateNotificationPrefs(
  userId: string,
  input: NotificationPrefs,
): Promise<UpdateNotificationPrefsResult> {
  const parsed = notificationPrefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("users")
    .update({ notification_prefs: parsed.data })
    .eq("id", userId);
  if (error) {
    console.error("[notification-prefs] update failed:", error.message);
    return { ok: false };
  }
  return { ok: true };
}

/**
 * OS 알림 설정 화면을 연다 — 권한 거부(PRD §6.3 AC-7: 설정 화면 재요청은 안내만) 시 사용자를 안내한다.
 * openSettings 는 best-effort — 실패해도 화면 흐름을 막지 않는다.
 */
export function openNotificationSettings(): void {
  void Linking.openSettings();
}
