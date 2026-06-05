import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Dev-only: verifies a magic-link hashed token server-side so the session
// cookie is set via @supabase/ssr. Used by `pnpm login:link` to bypass SMTP
// rate limits during local development. Disabled in production.
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const next = searchParams.get("next") ?? "/home";

  if (!token_hash) {
    return NextResponse.redirect(`${origin}/login?error=dev_login_missing_params`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash,
  });
  if (error) {
    console.error("[auth/dev-login] verifyOtp failed:", error.message);
    const reason = encodeURIComponent(error.message);
    return NextResponse.redirect(`${origin}/login?error=dev_login_verify&reason=${reason}`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
