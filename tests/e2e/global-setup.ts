import { chromium, type FullConfig } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    "E2E requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (see .env.local)",
  );
}

export default async function globalSetup(_config: FullConfig) {
  const email = `e2e+${Date.now()}@test.local`;
  const baseURL = `http://127.0.0.1:${process.env.E2E_PORT ?? 3000}`;

  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Ensure the user exists (email_confirm bypasses the verify step).
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error && created.error.status !== 422) throw created.error;

  // 2) Generate a magic link. `action_link` is the Supabase /auth/v1/verify
  //    URL that redirects to the app's /auth/callback?code=... on success,
  //    exercising the exact same code path as a real magic-link sign-in.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${baseURL}/auth/callback?next=/home` },
  });
  if (error) throw error;
  const actionLink = data.properties?.action_link;
  if (!actionLink) throw new Error("no action_link returned from generateLink");

  // 3) Navigate the browser through the real redirect chain:
  //    supabase.../auth/v1/verify → app/auth/callback?code=... → /home.
  //    The app's callback route calls exchangeCodeForSession, which writes
  //    the @supabase/ssr cookies. storageState() then captures them.
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(actionLink);
  await page.waitForURL((u) => u.pathname === "/home", { timeout: 15_000 });

  await context.storageState({ path: "tests/e2e/.auth/user.json" });
  await browser.close();
}
