import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  const supabase = await createClient();

  // 매직링크는 두 flow 중 하나로 도착한다.
  //   1) token_hash flow (ADR-0007 결정 2) — 이메일 템플릿이 ?token_hash=...&type=email
  //      을 보낼 때. verifier 쿠키 의존 없음 → 모바일 in-app browser/cross-browser 강건.
  //   2) PKCE flow — 옛 ConfirmationURL 링크용 마이그레이션 안전망. verifier 쿠키 부재
  //      시(모바일/cross-device) 구조적 fail. POC 안정화 후 별도 PR로 제거 예정.
  if (token_hash) {
    const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash });
    if (error) {
      console.error("[auth/callback] verifyOtp failed:", error.message);
      return NextResponse.redirect(`${origin}/login?error=auth`);
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] exchange failed:", error.message);
      return NextResponse.redirect(`${origin}/login?error=auth`);
    }
  } else {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  // 초대 진입(?next=/invite/...) 이면 invite flow 가 onboarding 보다 우선 — 즉시 이동.
  // ADR-0006 — invite 사용자는 두 번째 비-invite 로그인에서 처음 슬라이드를 본다 (의도된 지연).
  if (next) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // ADR-0006 — onboarding 판정은 public.users.onboarded_at 단일 SoT.
  // NULL = 아직 슬라이드 미시청 → /login?onboard=1 로 보내 슬라이드를 띄운다.
  // 종료 시 markOnboarded() Server Action 이 컬럼을 set 하므로 다음 로그인엔 /home 직행.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data } = await supabase
      .from("users")
      .select("onboarded_at")
      .eq("id", user.id)
      .maybeSingle();
    if (!data?.onboarded_at) {
      return NextResponse.redirect(`${origin}/login?onboard=1`);
    }
  }

  return NextResponse.redirect(`${origin}/home`);
}
