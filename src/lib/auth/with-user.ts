import { createClient } from "@/lib/supabase/server";
import { failure, type ActionResult } from "@/lib/actions/response";

type AuthedUser = { id: string; email?: string | null };

export function withUser<TInput, TData>(
  handler: (user: AuthedUser, input: TInput) => Promise<ActionResult<TData>>,
): (input: TInput) => Promise<ActionResult<TData>> {
  return async (input) => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return failure("unauthorized");
    return handler({ id: user.id, email: user.email }, input);
  };
}
