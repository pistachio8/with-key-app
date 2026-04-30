import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

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

export default async function globalSetup() {
  const email = `e2e+${Date.now()}@test.local`;
  const baseURL = `http://127.0.0.1:${process.env.E2E_PORT ?? 3000}`;

  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Create the user.
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
  if (!session) throw new Error("verifyOtp returned no session");

  // 3) Build the cookie payload @supabase/ssr expects. The browser storage
  //    format is a full TokenManager record, but the minimum that
  //    exchangeCodeForSession / getUser accept is the raw session JSON.
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

  // 4) Boot a browser, seed the cookie, verify /home loads.
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: cookieName,
      value: cookieValue,
      domain: "127.0.0.1",
      path: "/",
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();
  await page.goto(baseURL + "/home");
  await page.waitForURL((u) => u.pathname === "/home", { timeout: 15_000 });

  await context.storageState({ path: "tests/e2e/.auth/user.json" });
  await browser.close();
}
