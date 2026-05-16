import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[auth/callback] exchange failed:", error.message);
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
