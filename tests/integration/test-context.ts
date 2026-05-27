import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";

// Phase 4 분해 후 `fetchChallengeFeed` 의 자식 read 들 (`listVisibleActionLogIds` ·
// `getActionLogHydrate` · `getViewerKudosForLog` · `getActionLogPhotoSignedUrl`) 이
// 각자 `@/lib/supabase/server.createClient()` 를 호출 → `next/headers.cookies()` →
// Next.js request scope 밖이라 `throwForMissingRequestStore` 에러.
//
// 본 헬퍼: AsyncLocalStorage 로 viewer 의 signed-in SupabaseClient 를 binding 하고
// `tests/integration/setup.ts` 의 `vi.mock("@/lib/supabase/server")` 이 bound client
// 를 우선 반환하도록 한다. production 코드는 무변경.
const integrationTestClientStore = new AsyncLocalStorage<SupabaseClient>();

export function withIntegrationClient<T>(client: SupabaseClient, fn: () => Promise<T>): Promise<T> {
  return integrationTestClientStore.run(client, fn);
}

export function getIntegrationClient(): SupabaseClient | undefined {
  return integrationTestClientStore.getStore();
}
