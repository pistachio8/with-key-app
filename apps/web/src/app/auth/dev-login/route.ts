import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isDevLoginEnabled, mintDevToken, DevLoginError } from "@/lib/auth/dev-login";

// Dev-only: exchanges a magic-link hashed token for a session, bypassing Kakao
// SSO / SMTP so devices and Preview deployments can debug screens (spec §5.2).
//
// Gated by DEV_LOGIN_ENABLED, not by the build mode: Vercel marks both Preview
// and Production builds as production, so gating on build mode would 404 Preview
// and kill the RN/web menu paths. DEV_LOGIN_ENABLED is registered only on the
// Preview env scope, never on Production (spec §4·D7).
//
// Three paths:
//   ?token_hash=...           → verifyOtp + cookie + redirect   (CLI: pnpm login:link)
//   ?email=...&next=/home     → mint + verifyOtp + cookie + redirect   (web menu)
//   ?email=...&format=token   → mint → JSON { hashed_token }    (RN menu, client exchanges)
export async function GET(request: NextRequest) {
  if (!isDevLoginEnabled()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get("next") ?? "/home";
  const email = searchParams.get("email");
  const format = searchParams.get("format");

  // Resolve the hashed token: either passed in (CLI) or minted here from an
  // allowlisted email (menu). mintDevToken enforces the gate + allowlist.
  let tokenHash = searchParams.get("token_hash");
  if (!tokenHash && email) {
    try {
      tokenHash = await mintDevToken(email);
    } catch (error: unknown) {
      const status = error instanceof DevLoginError ? error.status : 502;
      const message = status === 400 ? "email not in allowlist" : "dev login error";
      return new NextResponse(status === 404 ? "Not found" : message, { status });
    }
  }

  if (!tokenHash) {
    return NextResponse.redirect(`${origin}/login?error=dev_login_missing_params`);
  }

  // RN menu path: hand the token back as JSON; the app exchanges it via its own
  // verifyMagicLinkToken (no server cookie — RN keeps its own session).
  if (format === "token") {
    return NextResponse.json({ hashed_token: tokenHash });
  }

  // Web / CLI path: exchange server-side so the @supabase/ssr cookie is set.
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
  if (error) {
    console.error("[auth/dev-login] verifyOtp failed:", error.message);
    const reason = encodeURIComponent(error.message);
    return NextResponse.redirect(`${origin}/login?error=dev_login_verify&reason=${reason}`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
