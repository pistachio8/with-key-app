// RN authService (ADR-0034) — Kakao SSO 1차 + magic link fallback + logout.
// 웹 /auth/callback 의 서버 orchestration 은 PWA 용으로 잔존하고, RN 은 클라이언트가
// 세션 성립을 직접 처리한다. invite stash/accept orchestration 은 EVAL-0013.
import Constants from "expo-constants";

import { kakaoAuth } from "@/capabilities/kakao-auth";
import { getSupabaseClient } from "@/services/supabase/client";

export type AuthResult = { ok: true } | { ok: false; error: AuthErrorCode };

export type AuthErrorCode =
  | "kakao_cancelled" // 사용자가 카카오 동의 화면에서 취소
  | "kakao_no_id_token" // OIDC 미활성 — Kakao 콘솔 OpenID Connect 설정 필요
  | "invalid_email"
  | "rate_limited" // Supabase OTP 쿨다운(이메일당 60초) / 시간당 쿼터
  | "auth_failed";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function universalLinkOrigin(): string {
  const domain = Constants.expoConfig?.extra?.universalLinkDomain;
  if (typeof domain !== "string" || domain.length === 0) {
    throw new Error("universalLinkDomain missing in expo config extra");
  }
  return `https://${domain}`;
}

/** 카카오톡 SSO → id token → supabase 세션. ADR-0034 결정 1. */
export async function signInWithKakao(): Promise<AuthResult> {
  let idToken: string | null;
  let accessToken: string;
  try {
    ({ idToken, accessToken } = await kakaoAuth.login());
  } catch (error) {
    console.error("[auth] kakao login failed:", error instanceof Error ? error.message : error);
    return { ok: false, error: "kakao_cancelled" };
  }

  if (!idToken) {
    // 토큰 본문은 로그 금지 — 코드만 남긴다.
    console.error("[auth] kakao login returned no idToken (OIDC disabled?)");
    return { ok: false, error: "kakao_no_id_token" };
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "kakao",
    token: idToken,
    access_token: accessToken,
  });
  if (error) {
    console.error("[auth] signInWithIdToken failed:", error.message);
    return { ok: false, error: "auth_failed" };
  }
  return { ok: true };
}

/**
 * Magic link fallback (ADR-0034 결정 2). emailRedirectTo 는 custom scheme 이 아닌
 * universal link — 이메일 클라이언트가 https 링크만 신뢰하므로 App Links 로 앱이 열리고,
 * 미설치 기기는 웹 PWA callback 으로 떨어진다(의도된 fallback).
 */
export async function requestMagicLink(email: string): Promise<AuthResult> {
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "invalid_email" };
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${universalLinkOrigin()}/auth/callback` },
  });
  if (error) {
    console.error("[auth] signInWithOtp failed:", error.message);
    return { ok: false, error: isRateLimitError(error) ? "rate_limited" : "auth_failed" };
  }
  return { ok: true };
}

/** 이메일로 받은 token_hash 를 세션으로 교환 — 웹 callback 의 token_hash flow 와 동일 (ADR-0007). */
export async function verifyMagicLinkToken(tokenHash: string): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
  if (error) {
    console.error("[auth] verifyOtp failed:", error.message);
    return { ok: false, error: "auth_failed" };
  }
  return { ok: true };
}

/** 로그아웃 — supabase 세션 폐기(SecureStore chunk 는 storage adapter 가 제거) + Kakao 토큰 정리. */
export async function signOut(): Promise<AuthResult> {
  // Kakao 로그아웃은 best-effort — Kakao 로그인 이력이 없거나 SDK 오류여도 세션 폐기는 진행.
  try {
    await kakaoAuth.logout();
  } catch {
    // noop
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("[auth] signOut failed:", error.message);
    return { ok: false, error: "auth_failed" };
  }
  return { ok: true };
}

// 웹 login/_actions.ts 의 isRateLimitError 와 동일 판정 기준.
function isRateLimitError(err: { status?: number; code?: string | null }): boolean {
  if (err.status === 429) return true;
  return /^over_.*_rate_limit$/.test(err.code ?? "");
}
