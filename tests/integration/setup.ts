import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { afterEach, beforeAll } from "vitest";
import { resolve } from "node:path";

// Vitest doesn't auto-load .env.local. Integration tests need the remote project keys.
loadEnv({ path: resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_ROLE = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE) {
  throw new Error(
    "integration tests require NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY (see .env.local)",
  );
}

// Admin client — bypasses RLS. Use only from factories / truncation helpers.
export const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Returns an anon-keyed Supabase client already signed in as the given test user.
 * Impersonation works by issuing a magic link via admin API and verifying the OTP.
 * Takes the object returned by `createUser()` — uses the real email, not the uid.
 */
export async function asUser(user: { id: string; email: string }): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
  });
  if (error) throw error;
  const otp = data.properties?.email_otp;
  if (!otp) throw new Error("no email_otp in generateLink response");
  const verify = await client.auth.verifyOtp({
    email: user.email,
    token: otp,
    type: "magiclink",
  });
  if (verify.error) throw verify.error;
  return client;
}

async function resetDb() {
  // Scoped truncate: only removes rows owned by @test.local users.
  // Preserves any manual dev seed data in the remote project.
  const { error } = await admin.rpc("truncate_test_data");
  if (error) throw error;
}

beforeAll(async () => {
  const { error } = await admin.from("users").select("id").limit(1);
  if (error && error.code === "42P01") {
    throw new Error(
      "integration tests expect migrations applied — run `pnpm db:push` before tests",
    );
  }
});

afterEach(async () => {
  await resetDb();
});

export function expectRlsDenied(err: unknown) {
  if (!err || typeof err !== "object") throw new Error("expected an error");
  const code = (err as { code?: string }).code;
  if (code !== "42501" && code !== "PGRST116") {
    throw new Error(`expected RLS denial, got code=${code}`);
  }
}
