import { cache } from "react";
import { createClient } from "./server";

export type AuthedUser = {
  id: string;
  email: string | null;
};

// ADR-0023: GoTrue `/auth/v1/user` 네트워크 호출을 제거하기 위해 `auth.getUser()` 대신
// `auth.getClaims()` 를 사용한다. asymmetric JWT 서명 키가 활성화된 프로젝트에서는
// JWKS 캐시로 JWT 서명 검증이 로컬에서 일어나 네트워크 호출이 발생하지 않는다.
// React `cache()` 로 같은 request scope 안 dedup 은 유지 (Activity/PPR pass 간 추가
// 호출 발생 시 보호).
//
// 반환 타입은 의도적으로 좁힌 `AuthedUser` — 호출자 11+ 곳 모두 `id` / `email` 만 사용.
// claims 의 다른 필드(`app_metadata` 등) 가 필요해질 때는 직접 `supabase.auth.getUser()`
// 를 부르는 경로를 따로 두는 것이 ADR-0022 의 적용 제외 정책과 일관된다.
export const getAuthedUser = cache(async (): Promise<{ user: AuthedUser | null }> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return { user: null };

  const { claims } = data;
  if (typeof claims.sub !== "string") return { user: null };

  const email = typeof claims.email === "string" ? claims.email : null;
  return { user: { id: claims.sub, email } };
});
