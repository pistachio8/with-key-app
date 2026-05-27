import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { afterEach, beforeAll, vi } from "vitest";
import { resolve } from "node:path";

// Phase 4 (SNS cache plan v4) 분해 후 read 함수들이 자체 `createClient()` → `cookies()`
// 호출. integration test 는 Next.js request scope 밖이라 `throwForMissingRequestStore`.
// `tests/integration/test-context.ts` 의 AsyncLocalStorage 가 bound client 를 들고 있으면
// 그것을 우선 반환하고, 아니면 원래 production createClient 가 throw 하도록 fallthrough.
vi.mock("@/lib/supabase/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/server")>();
  const { getIntegrationClient } = await import("./test-context");
  return {
    ...actual,
    async createClient() {
      const bound = getIntegrationClient();
      if (bound) return bound;
      return actual.createClient();
    },
  };
});

// `cacheTag` / `cacheLife` 는 next.config 의 `cacheComponents: true` 가 활성된 환경에서만
// 호출 가능. vitest 는 next.config 를 읽지 않아 runtime 가드가 throw 한다.
// integration test 는 RLS · 쿼리 동작을 검증하는 것이 목적이고 캐시 자체는 단위 spec
// (cacheTag 호출 인자 검증) 에서 다루므로 next/cache 의 cache 디렉티브 부속 API 만 no-op.
// revalidate/update 류는 mutation 경로의 단위 spec 이 mock 하므로 그대로 둔다.
vi.mock("next/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/cache")>();
  return {
    ...actual,
    cacheTag: () => {},
    cacheLife: () => {},
  };
});

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
 * Uses signInWithPassword to avoid the OTP verifyOtp endpoint, which has a tight
 * Supabase rate limit (~30/hr) and caused CI failures under normal test volume.
 * Takes the object returned by `createUser()`.
 */
export async function asUser(user: {
  id: string;
  email: string;
  password: string;
}): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw error;
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
