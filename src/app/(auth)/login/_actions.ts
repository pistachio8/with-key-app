"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { failure, success, type ActionResult } from "@/lib/actions/response";

const emailSchema = z.string().email();

export async function requestMagicLink(email: string): Promise<ActionResult<{ sent: true }>> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return failure("invalid_input", { email: ["이메일 형식이 올바르지 않아요."] });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) {
    console.error("[requestMagicLink] supabase error:", error.message);
    return failure("upstream_error");
  }
  return success({ sent: true });
}
