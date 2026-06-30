// EVAL-0052 — 로그아웃 시 push token 무효화 (ADR-0041: soft-delete = disabled_at).
// dispatch sender 가 disabled_at IS NULL token 만 발송 대상으로 보므로, 무효화 후 발송이 멈춘다.
// hard-delete 가 아닌 soft-delete — 재로그인 upsert 가 같은 (user_id, device_id) row 를 재활성한다.
import { getSupabaseClient } from "@/services/supabase/client";

import { getExistingDeviceId } from "./device-id";

export type UnregisterPushResult = { ok: true; skipped: boolean } | { ok: false };

/** 현재 기기의 (user_id, device_id) token 을 disabled_at=NOW() 로 soft-delete 한다. */
export async function unregisterPushToken(userId: string): Promise<UnregisterPushResult> {
  const deviceId = await getExistingDeviceId();
  // 등록된 적 없는 기기 — 무효화할 row 가 없다.
  if (!deviceId) return { ok: true, skipped: true };

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("device_push_tokens")
    .update({ disabled_at: new Date().toISOString() })
    .match({ user_id: userId, device_id: deviceId });
  if (error) {
    console.error("[push] device token disable failed:", error.message);
    return { ok: false };
  }
  return { ok: true, skipped: false };
}
