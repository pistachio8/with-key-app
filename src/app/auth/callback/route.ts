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
  if (next) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // 신규 가입자 판정: group_members 0건 = 아직 어떤 그룹에도 속하지 않은 사용자.
  // 본 분기는 plan PR3 §3.2 Step 4 — onboarding 트리거. localStorage gate 는
  // /login?onboard=1 도착 후 OnboardingSlides 컴포넌트가 한 번 더 거른다.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { count } = await supabase
      .from("group_members")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);
    if ((count ?? 0) === 0) {
      return NextResponse.redirect(`${origin}/login?onboard=1`);
    }
  }

  return NextResponse.redirect(`${origin}/home`);
}
