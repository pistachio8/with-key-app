// EVAL-0052 — Expo push token 등록 (ADR-0041 §73: RN direct client · RLS self-row upsert).
// 로그인 직후 1회 호출(useRegisterPushToken). 권한 거부·시뮬레이터·projectId 미설정은 조용히 skip.
// PWA 의 push_subscriptions(Web Push) 경로는 건드리지 않는다 — 별도 테이블·별도 등록 액션.
import { getSupabaseClient } from "@/services/supabase/client";

import { getOrCreateDeviceId } from "./device-id";
import {
  acquireExpoPushToken,
  appVersion,
  easProjectId,
  ensureAndroidChannel,
  ensurePermissionGranted,
  isPhysicalDevice,
  pushPlatform,
} from "./notifications";

export type RegisterPushResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "unsupported_platform"
        | "not_device"
        | "permission_denied"
        | "no_project_id"
        | "error";
    };

/**
 * 현재 기기의 Expo push token 을 device_push_tokens 에 upsert 한다.
 * 충돌 키 (user_id, device_id) — 토큰 갱신·재활성(disabled_at=null)을 같은 row 로 처리(ADR-0041).
 * RLS dpt_all_self 가 self-row 만 허용하므로 BFF 없이 RN 이 직접 쓴다.
 */
export async function registerPushToken(userId: string): Promise<RegisterPushResult> {
  const platform = pushPlatform();
  if (!platform) return { ok: false, reason: "unsupported_platform" };
  if (!isPhysicalDevice()) return { ok: false, reason: "not_device" };

  await ensureAndroidChannel();

  // 거부는 조용히 무시 — 재요청을 강요하지 않는다(task §Requirements).
  const granted = await ensurePermissionGranted();
  if (!granted) return { ok: false, reason: "permission_denied" };

  // EAS projectId 가 없으면 token 발급 불가 — 인프라 선행(EVAL-0053) 전까지 skip.
  const projectId = easProjectId();
  if (!projectId) return { ok: false, reason: "no_project_id" };

  try {
    const expoPushToken = await acquireExpoPushToken(projectId);
    const deviceId = await getOrCreateDeviceId();

    const supabase = getSupabaseClient();
    const { error } = await supabase.from("device_push_tokens").upsert(
      {
        user_id: userId,
        device_id: deviceId,
        expo_push_token: expoPushToken,
        platform,
        app_version: appVersion(),
        last_seen_at: new Date().toISOString(),
        disabled_at: null,
      },
      { onConflict: "user_id,device_id" },
    );
    if (error) {
      console.error("[push] device token upsert failed:", error.message);
      return { ok: false, reason: "error" };
    }
    return { ok: true };
  } catch (error) {
    // 토큰 본문은 로그 금지 — 메시지만 남긴다(push token 도 사용자 식별 정보).
    console.error(
      "[push] token registration failed:",
      error instanceof Error ? error.message : String(error),
    );
    return { ok: false, reason: "error" };
  }
}
