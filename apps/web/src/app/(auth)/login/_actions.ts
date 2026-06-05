"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { failure, success, type ActionResult } from "@/lib/actions/response";

const emailSchema = z.string().email();

// callback 의 ?next= 분기를 살리기 위한 화이트리스트.
// 외부 origin 으로의 오픈 리다이렉트를 막기 위해 "/" 로 시작하고 "//" (프로토콜 상대) 가 아닌 내부 경로만 허용.
const nextPathSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^\/(?!\/)/, "internal path required");

// Preview deploys get a fresh URL per branch, so a build-time env can't
// track them. Read the live request origin first and fall back to env
// only when no headers exist (non-HTTP contexts / tests).
async function resolveAppOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export async function requestMagicLink(
  email: string,
  next?: string,
): Promise<ActionResult<{ sent: true }>> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return failure("invalid_input", { email: ["이메일 형식이 올바르지 않아요."] });
  }

  // invite 등 next destination 이 있으면 callback URL 에 query param 으로 부착 → Supabase 가 그대로 redirect_to.
  // 유효성 실패(외부 URL · 빈 값 등) 면 조용히 drop 하고 일반 로그인으로 진행 (사용자 입장에서 destination 만 잃음).
  const safeNext = next ? nextPathSchema.safeParse(next) : null;
  const origin = await resolveAppOrigin();
  const callbackUrl = new URL(`${origin}/auth/callback`);
  if (safeNext?.success) {
    callbackUrl.searchParams.set("next", safeNext.data);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      emailRedirectTo: callbackUrl.toString(),
    },
  });

  if (error) {
    console.error("[requestMagicLink] supabase error:", error.message);
    return failure(isRateLimitError(error) ? "rate_limited" : "upstream_error");
  }
  return success({ sent: true });
}

// Supabase OTP 발송은 이메일당 60초 쿨다운 + 프로젝트 시간당 쿼터가 있다.
// AuthApiError 는 status=429 로 오고, 신버전에서는 "over_email_send_rate_limit" 류 code 도 들어온다.
function isRateLimitError(err: { status?: number; code?: string | null }): boolean {
  if (err.status === 429) return true;
  const code = err.code ?? "";
  return /^over_.*_rate_limit$/.test(code);
}

// ADR-0006 — 온보딩 슬라이드 종료(시작하기·건너뛰기) 시 호출되는 단일 write 경로.
// callback 의 분기 기준이 public.users.onboarded_at 이므로 finish() 가 이걸 set 해야
// 다음 로그인부터 슬라이드가 노출되지 않는다.
//
// 실패는 silent — 사용자를 슬라이드에 가두지 않기 위해 클라이언트는 결과 무관하게 /home 으로 라우팅한다.
// 회귀 비용은 "다음 로그인 한 번 더 슬라이드 노출"뿐이며 데이터 손실은 없다.
export async function markOnboarded(): Promise<ActionResult<{ onboardedAt: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return failure("unauthorized");

  const { data, error } = await supabase
    .from("users")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", user.id)
    .select("onboarded_at")
    .single();

  if (error) {
    console.error("[markOnboarded] update failed:", error.message);
    return failure("upstream_error");
  }
  return success({ onboardedAt: data.onboarded_at as string });
}
