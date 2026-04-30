"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { failure, success, type ActionResult } from "@/lib/actions/response";

const emailSchema = z.string().email();

// Preview deploys get a fresh URL per branch, so a build-time env can't
// track them. Read the live request origin first and fall back to env
// only when no headers exist (non-HTTP contexts / tests).
async function resolveAppOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export async function requestMagicLink(email: string): Promise<ActionResult<{ sent: true }>> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return failure("invalid_input", { email: ["이메일 형식이 올바르지 않아요."] });
  }

  const origin = await resolveAppOrigin();
  // TODO(remove after PR #8 preview verification): confirm Vercel request
  // headers produce the preview URL instead of localhost.
  console.log("[requestMagicLink] resolved origin:", origin);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    console.error("[requestMagicLink] supabase error:", error.message);
    return failure("upstream_error");
  }
  return success({ sent: true });
}
