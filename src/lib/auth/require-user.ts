import "server-only";
import { redirect } from "next/navigation";
import { getAuthedUser } from "@/lib/supabase/auth";

// ADR-0022: 직접 supabase.auth.getUser() 호출 대신 React cache() 로 dedupe 되는
// getAuthedUser 위에 구현. 같은 request scope 의 다른 호출과 dedup 되어 Supabase
// Auth API 압력 감소 (over_request_rate_limit 완화).
export async function requireUser(): Promise<{ id: string; email?: string | null }> {
  const { user } = await getAuthedUser();
  if (!user) redirect("/login");
  return { id: user.id, email: user.email };
}
