// RN invite 토큰 발급 (EVAL-0018 · 00 §13.2 #18 — RN direct client).
// invites INSERT 는 RLS `invites_insert_owner`(0002)가 owner 만 허용 — service-role 불요.
// 토큰은 web generateInviteToken 과 동일 스펙: 32B(256bit) 랜덤 base64url
// (PRD §3.3 AC-2 — 72h 만료는 DB default). Math.random 폴백은 두지 않는다(엔트로피 보안).
import Constants from "expo-constants";

import { getSupabaseClient } from "@/services/supabase/client";

export type CreateInviteResult =
  | { ok: true; token: string; url: string | null }
  | { ok: false; error: "invite_failed" };

const TOKEN_BYTES = 32;

// Hermes 가 Web Crypto 미제공인 빌드에서는 명확히 실패 — 조용한 약한 토큰 금지.
// 실기기에서 미지원이 확인되면 expo-crypto polyfill 도입을 spec 으로 결정한다.
function randomInviteToken(): string {
  const cryptoObj = globalThis.crypto;
  if (typeof cryptoObj?.getRandomValues !== "function") {
    throw new Error("crypto.getRandomValues unavailable — secure invite token requires polyfill");
  }
  const bytes = cryptoObj.getRandomValues(new Uint8Array(TOKEN_BYTES));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  // base64 → base64url (web randomBytes(32).toString("base64url") 과 동일 형식).
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 초대 공유 URL — web 호스트(universal link 도메인) 기준. 도메인 미설정 시 null. */
export function buildInviteShareUrl(token: string): string | null {
  const domain = Constants.expoConfig?.extra?.universalLinkDomain;
  if (typeof domain !== "string" || domain.length === 0) return null;
  return `https://${domain}/invite/${encodeURIComponent(token)}`;
}

/**
 * 그룹 초대 토큰 발급 — challenge 생성 직후 공유 링크용 (web createChallenge step 4 패리티).
 * 비owner 시도는 RLS 가 INSERT 를 거부한다(42501) — unauthorized negative path.
 */
export async function createInvite(groupId: string, userId: string): Promise<CreateInviteResult> {
  const supabase = getSupabaseClient();

  let token: string;
  try {
    token = randomInviteToken();
  } catch (error) {
    console.error("[createInvite] token generation failed", error);
    return { ok: false, error: "invite_failed" };
  }

  const { error } = await supabase
    .from("invites")
    .insert({ group_id: groupId, token, created_by: userId });
  if (error) {
    // 토큰 본문은 로그 금지 — 코드/메시지 메타만.
    console.error("[createInvite] insert failed:", error.code, error.message);
    return { ok: false, error: "invite_failed" };
  }

  return { ok: true, token, url: buildInviteShareUrl(token) };
}
