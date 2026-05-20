import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { track } from "@/lib/analytics/track";

// ADR-0008 — 카카오 OAuth 도입 후 callback 책임 확장:
//   1) 세션 성립 (매직링크 token_hash / 매직링크 legacy PKCE code / OAuth code)
//   2) next=/invite/{token} 패턴이면 accept_invite RPC 자동 호출
//   3) invite_opened · user_signed_up 분석 이벤트 emit (수동 경로와 양방 일관성)
//   4) welcome cushion query 부착 후 redirect

const ONE_MINUTE_MS = 60_000;

// 외부 origin 으로의 오픈 리다이렉트 차단. internal path 만 허용.
// 매직링크 server action (login/_actions.ts) 의 nextPathSchema 와 동일 패턴.
function isSafeNextPath(value: string | null): value is string {
  if (!value) return false;
  if (value.length > 512) return false;
  return /^\/(?!\/)/.test(value);
}

function mapAcceptInviteErrorParam(code: string | undefined): string {
  if (code === "P0002") return "expired";
  if (code === "42501") return "full";
  return "auth";
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next");
  const next = isSafeNextPath(rawNext) ? rawNext : null;

  const supabase = await createClient();

  // 매직링크는 두 flow 중 하나로 도착한다.
  //   1) token_hash flow (ADR-0007 결정 2) — 이메일 템플릿이 ?token_hash=...&type=email
  //      을 보낼 때. verifier 쿠키 의존 없음 → 모바일 in-app browser/cross-browser 강건.
  //   2) PKCE flow — 옛 ConfirmationURL 매직링크 + 카카오 OAuth 가 공유. ADR-0008 —
  //      provider 판정은 flow 추정이 아닌 app_metadata SoT 로 분리.
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  // ADR-0008 — provider 판정은 Supabase 가 채운 app_metadata 직접 사용.
  // `code` flow 가 OAuth(카카오) 와 매직링크 legacy PKCE 둘 다에 쓰이므로 flow 추정은 오판정.
  const provider: "kakao" | "email" = user.app_metadata?.provider === "kakao" ? "kakao" : "email";

  // users 한 번 SELECT 로 onboarding 판정 + user_signed_up 휴리스틱 신호 확보.
  const { data: userRow } = await supabase
    .from("users")
    .select("onboarded_at, created_at")
    .eq("id", user.id)
    .maybeSingle();

  // 신규 가입 휴리스틱 — created_at < 1분 & onboarded_at NULL. POC 규모(~10~20명) ±1~2 오차 허용.
  // V1 진입 시 events partial unique index 로 정확화 (ADR-0008 Consequences).
  const justSignedUp =
    !!userRow &&
    userRow.onboarded_at === null &&
    !!userRow.created_at &&
    Date.now() - new Date(userRow.created_at).getTime() < ONE_MINUTE_MS;

  // ADR-0008 — invite next 자동가입 분기. 한 번의 카카오 탭으로 invite 가입까지 완결.
  const inviteTokenMatch = next?.match(/^\/invite\/([^/?#]+)/);
  if (inviteTokenMatch) {
    const token = decodeURIComponent(inviteTokenMatch[1]);

    const { data: groupId, error: rpcError } = await supabase.rpc("accept_invite", {
      p_token: token,
    });

    if (rpcError) {
      const errorParam = mapAcceptInviteErrorParam(
        (rpcError as { code?: string | null }).code ?? undefined,
      );
      // 가입 자체는 세션 성립 시점에 완료 — user_signed_up emit, invite_opened 는 skip.
      if (justSignedUp) {
        void track({ name: "user_signed_up", props: { provider } }, { userId: user.id });
      }
      console.error("[auth/callback] accept_invite failed:", rpcError.message);
      return NextResponse.redirect(
        `${origin}/invite/${encodeURIComponent(token)}?error=${errorParam}`,
      );
    }

    if (!groupId || typeof groupId !== "string") {
      console.error("[auth/callback] accept_invite returned non-string", groupId);
      return NextResponse.redirect(`${origin}/login?error=auth`);
    }

    // welcome cushion + pending challenge 분기 — 두 SELECT 병렬.
    const [groupNameRes, pendingChallengeRes] = await Promise.all([
      supabase.from("groups").select("name").eq("id", groupId).maybeSingle(),
      supabase
        .from("challenges")
        .select("id")
        .eq("group_id", groupId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const groupName = groupNameRes.data?.name ?? null;
    const pendingChallengeId = pendingChallengeRes.data?.id ?? null;

    // AcceptForm 수동 경로(_actions.ts:38)와 동일 — invite_opened 는 가입 성공 시 1회.
    void track(
      { name: "invite_opened", props: { groupId, fromOrganicUser: false } },
      { userId: user.id },
    );
    if (justSignedUp) {
      void track({ name: "user_signed_up", props: { provider } }, { userId: user.id });
    }

    const welcomeQuery = groupName ? `?welcome=${encodeURIComponent(groupName)}` : "";
    const target = pendingChallengeId
      ? `/challenge/${pendingChallengeId}/pledge${welcomeQuery}`
      : `/group/${groupId}${welcomeQuery}`;
    return NextResponse.redirect(`${origin}${target}`);
  }

  // invite next 가 아닌 일반 경로 — onboarding 분기 보존 (ADR-0006).
  if (justSignedUp) {
    void track({ name: "user_signed_up", props: { provider } }, { userId: user.id });
  }

  if (next) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // ADR-0006 — onboarded_at 가 SoT. NULL = 아직 슬라이드 미시청.
  if (userRow && !userRow.onboarded_at) {
    return NextResponse.redirect(`${origin}/login?onboard=1`);
  }

  return NextResponse.redirect(`${origin}/home`);
}
