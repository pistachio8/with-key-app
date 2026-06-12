// 프로필(me) read service — RN-safe(RLS) Supabase 직접 read (00 §13.3 · ADR-0037).
// 추출 소스: apps/web/src/lib/db/reads/{me,notification-prefs}.ts (cache/cookie 의존 제거).
// Web Push 구독 endpoint read(fetchActiveSubscriptionEndpoint)는 RN 미포팅 —
// push 토큰 모델이 device_push_tokens 로 교체된다 (D-2 · 04 §7 A9).
import { notificationPrefsSchema, type NotificationPrefs } from "@withkey/domain";

import { getSupabaseClient } from "@/services/supabase/client";

export async function fetchMyDisplayName(userId: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data.display_name as string | null;
}

/** 본인이 owner 인 그룹에 챌린지 1건 이상 존재 여부. 에러 시 false(신규 사용자 카피 폴백). */
export async function hasEverCreatedChallenge(userId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data: ownedGroups, error: groupsErr } = await supabase
    .from("groups")
    .select("id")
    .eq("owner_id", userId);

  if (groupsErr) return false;
  if (!ownedGroups || ownedGroups.length === 0) return false;

  const { data: anyChallenge, error: chErr } = await supabase
    .from("challenges")
    .select("id")
    .in(
      "group_id",
      (ownedGroups as { id: string }[]).map((g) => g.id),
    )
    .limit(1);

  if (chErr) return false;
  return (anyChallenge?.length ?? 0) > 0;
}

// 신규 가입자 / parse 실패 fallback 은 OFF — 명시적 토글 ON 시점에 OS 권한 프롬프트가
// 트리거되도록 한다 (web notification-prefs.ts 와 동일 정책, migration 0031·0033 정합).
const DEFAULT_PREFS: NotificationPrefs = { start: false, deadline: false, kudos: false };

export async function fetchNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("notification_prefs")
    .eq("id", userId)
    .single();
  if (error || !data) return DEFAULT_PREFS;
  const parsed = notificationPrefsSchema.safeParse(data.notification_prefs);
  return parsed.success ? parsed.data : DEFAULT_PREFS;
}
