// RN BFF(Bearer) 전용 token 기반 RLS user client (ADR-0036 §2 · ADR-0037).
// cookie 세션(@supabase/ssr)이 없는 Bearer 요청에서 viewer 의 access token 으로
// RLS 가 적용되는 user client 를 만든다 — Layer 1 visibility 같은 인가 경계 쿼리는
// 반드시 이 client(또는 cookie user client)로 실행하고 admin 으로 대체하지 않는다.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 요청마다 새 인스턴스 — token 이 요청 단위 자격증명이라 싱글톤 캐시 금지(viewer 혼선 방지).
export function createBearerClient(accessToken: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for bearer client");
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required for bearer client");

  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** `Authorization: Bearer <token>` 헤더에서 token 추출. 형식이 아니면 null. */
export function bearerTokenFrom(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}
