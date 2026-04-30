// Dev-only helper: generate a Supabase magic link without sending email.
// Bypasses SMTP rate limits during local development.
//
// Each developer configures their own test email via DEV_LOGIN_EMAIL in
// .env.local, or passes one as a CLI argument for one-off use.
//
// Usage:
//   pnpm login:link                    # uses DEV_LOGIN_EMAIL from .env.local
//   pnpm login:link other@example.com  # overrides with explicit email

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const email = process.argv[2] ?? process.env.DEV_LOGIN_EMAIL;
if (!email) {
  console.error(
    "No email provided.\n" +
      "  Set DEV_LOGIN_EMAIL in .env.local, or pass an email as an argument:\n" +
      "    pnpm login:link you@example.com",
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL;

if (!url || !secret || !appUrl) {
  console.error(
    "missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, NEXT_PUBLIC_APP_URL",
  );
  process.exit(1);
}

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: { redirectTo: `${appUrl}/auth/callback` },
});

if (error) {
  console.error("generateLink failed:", error.message);
  process.exit(1);
}

const hashedToken = data?.properties?.hashed_token;
if (!hashedToken) {
  console.error("no hashed_token returned");
  process.exit(1);
}

// Route through /auth/dev-login so the session cookie is set server-side.
// The built-in /auth/v1/verify endpoint returns tokens in a URL fragment,
// which our production PKCE callback does not handle.
const devLink = new URL(`${appUrl}/auth/dev-login`);
devLink.searchParams.set("token_hash", hashedToken);
devLink.searchParams.set("email", email);

console.log(`\nDev login link for ${email}:\n${devLink.toString()}\n`);
