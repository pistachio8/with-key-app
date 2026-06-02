import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";

// ADR-0024 이후: `fetchChallengeFeed` 의 자식 read 중 `@/lib/supabase/server.createClient()`
// 를 호출하는 것은 Layer 1 (`listVisibleActionLogIds` · `getVisibilityVersion`) 뿐이다.
// hydrate 단계 (`getActionLogHydrate` · `getActionLogPhotoSignedUrl` · `getKudosCountsForLog` ·
// `getViewerKudosForLog`)는 `adminClient()` 로 전환됐고, setup.ts 의 `@/lib/supabase/admin`
// mock 이 service-role client 를 반환한다 (Layer 2/3 는 production 처럼 RLS 우회).
//
// 본 헬퍼: Layer 1 의 `createClient()` 가 `next/headers.cookies()` → request scope 밖
// `throwForMissingRequestStore` 로 터지지 않도록, AsyncLocalStorage 로 viewer 의 signed-in
// SupabaseClient 를 binding 하고 `setup.ts` 의 `vi.mock("@/lib/supabase/server")` 이 bound
// client 를 우선 반환하게 한다. 즉 visibility gate(RLS)는 이 bound viewer client 가 담당.
// production 코드는 무변경.
const integrationTestClientStore = new AsyncLocalStorage<SupabaseClient>();

export function withIntegrationClient<T>(client: SupabaseClient, fn: () => Promise<T>): Promise<T> {
  return integrationTestClientStore.run(client, fn);
}

export function getIntegrationClient(): SupabaseClient | undefined {
  return integrationTestClientStore.getStore();
}
