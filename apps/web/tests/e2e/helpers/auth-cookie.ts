import type { BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

// Load .env.local the same way global-setup does. Playwright already has these
// in process.env when running under its webServer, but this keeps the helper
// usable in isolation too.
loadEnv({ path: resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_ROLE = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE) {
  throw new Error(
    "E2E requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY",
  );
}

// @supabase/ssr cookie naming: `sb-<project-ref>-auth-token`, value is
// `base64-<base64url(JSON session)>`. See node_modules/@supabase/ssr/…/cookies.js.
function projectRefFromUrl(url: string): string {
  const m = url.match(/^https?:\/\/([^.]+)\./);
  if (!m) throw new Error(`cannot derive project ref from ${url}`);
  return m[1];
}

function base64UrlEncode(s: string): string {
  return Buffer.from(s, "utf-8")
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export type SeededSessionOptions = {
  email: string;
  domain?: string;
};

export type SeededSession = {
  userId: string;
  email: string;
  cleanup: () => Promise<void>;
};

/**
 * Creates the Supabase user (if not already present), verifies a magic link to
 * produce a real session, and writes the @supabase/ssr auth cookie onto the
 * given BrowserContext. Returns { userId, email } plus a cleanup function that
 * admin-deletes the user.
 */
export async function seedSessionCookie(
  context: BrowserContext,
  opts: SeededSessionOptions,
): Promise<SeededSession> {
  const email = opts.email;
  const domain = opts.domain ?? "127.0.0.1";

  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Create the user (or tolerate an existing one — 422 = already registered).
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error && created.error.status !== 422) throw created.error;

  // 2) Generate a magic link, extract the OTP token, verify it → session.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr) throw linkErr;
  const otp = linkData.properties?.email_otp;
  if (!otp) throw new Error("no email_otp returned from generateLink");

  // Use a separate anon client for verify (service_role would bypass auth logic).
  const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: verifyData, error: verifyErr } = await anon.auth.verifyOtp({
    email,
    token: otp,
    type: "magiclink",
  });
  if (verifyErr) throw verifyErr;
  const session = verifyData.session;
  const user = verifyData.user;
  if (!session || !user) throw new Error("verifyOtp returned no session");

  // 3) Build the cookie payload @supabase/ssr expects.
  const sessionJson = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  });
  const cookieValue = `base64-${base64UrlEncode(sessionJson)}`;
  const cookieName = `sb-${projectRefFromUrl(SUPABASE_URL!)}-auth-token`;

  // 4) Inject the cookie onto the provided BrowserContext.
  await context.addCookies([
    {
      name: cookieName,
      value: cookieValue,
      domain,
      path: "/",
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  return {
    userId: user.id,
    email,
    cleanup: async () => {
      await admin.auth.admin.deleteUser(user.id);
    },
  };
}
