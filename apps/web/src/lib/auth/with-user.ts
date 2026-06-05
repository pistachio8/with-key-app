import { getAuthedUser } from "@/lib/supabase/auth";
import { failure, type ActionResult } from "@/lib/actions/response";

type AuthedUser = { id: string; email?: string | null };

// ADR-0022 (RSC PR2 후속) — server-action 진입점에서도 raw `supabase.auth.getUser()`
// 대신 React `cache()` 로 dedupe 되는 `getAuthedUser` 를 경유한다. 한 server action
// 안에서 내부 헬퍼(requireUser 등)가 같은 request scope 에 호출돼도 GoTrue 호출이
// 1회로 통합되어 `over_request_rate_limit` 압력이 완화된다. createClient 도 더 이상
// withUser 안에서 별도로 만들 필요가 없다 — 핸들러가 필요하면 직접 생성한다.
export function withUser<TInput, TData>(
  handler: (user: AuthedUser, input: TInput) => Promise<ActionResult<TData>>,
): (input: TInput) => Promise<ActionResult<TData>> {
  return async (input) => {
    const { user } = await getAuthedUser();
    if (!user) return failure("unauthorized");
    return handler({ id: user.id, email: user.email }, input);
  };
}
