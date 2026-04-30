"use server";

import { actionLogInputSchema, type ActionLogInput } from "@/lib/validators/action-log";
import { generateDiary } from "@/lib/ai/diary";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";

type SubmitResult = { id: string; summary: string };

// BE_SCHEMA §8.5. RLS 가 참가자/active/기간 검증.
export const submitActionLog = withUser<ActionLogInput, SubmitResult>(
  async (user, input): Promise<ActionResult<SubmitResult>> => {
    const parsed = actionLogInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    const supabase = await createClient();

    // Ownership/active 이중 방어: RLS 가 최종 차단하지만 UX 메시지 분기 위해 선제 체크.
    const { data: membership, error: mErr } = await supabase
      .from("challenge_participants")
      .select("user_id, challenges!inner(status, start_at, end_at)")
      .eq("challenge_id", parsed.data.challengeId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (mErr) return failure(mapSupabaseError(mErr));
    if (!membership) return failure("not_found");
    const ch = Array.isArray(membership.challenges)
      ? membership.challenges[0]
      : membership.challenges;
    if (!ch || ch.status !== "active") return failure("forbidden");
    const now = Date.now();
    if (
      !ch.start_at ||
      !ch.end_at ||
      now < new Date(ch.start_at).getTime() ||
      now > new Date(ch.end_at).getTime()
    ) {
      return failure("forbidden");
    }

    const { data: profile } = await supabase
      .from("users")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    const diary = await generateDiary(
      {
        activityType: parsed.data.activityType,
        keywords: parsed.data.selectedKeywords,
        memo: parsed.data.memo,
      },
      { displayName: profile?.display_name ?? undefined },
    );

    const { data, error } = await supabase
      .from("action_logs")
      .insert({
        challenge_id: parsed.data.challengeId,
        user_id: user.id,
        activity_type: parsed.data.activityType,
        photo_url: parsed.data.photoUrl,
        selected_keywords: parsed.data.selectedKeywords,
        shown_keywords: parsed.data.shownKeywords,
        reroll_count: parsed.data.rerollCount,
        memo: parsed.data.memo ?? null,
        ai_summary: diary.summary,
        template_fallback: diary.fallback,
        prompt_version: diary.promptVersion,
      })
      .select("id")
      .single();

    if (error) return failure(mapSupabaseError(error));
    if (!data) return failure("upstream_error");

    void track(
      {
        name: "action_logged",
        props: {
          challengeId: parsed.data.challengeId,
          activityType: parsed.data.activityType,
          selectedKeywords: parsed.data.selectedKeywords,
          keywordCount: parsed.data.selectedKeywords.length,
          hasMemo: Boolean(parsed.data.memo),
          rerollCount: parsed.data.rerollCount,
          photoSize: 0,
        },
      },
      { userId: user.id },
    );

    void track(
      {
        name: "ai_generated",
        props: {
          actionLogId: data.id,
          latencyMs: diary.latencyMs,
          fallback: diary.fallback,
          keywordCoverage: diary.keywordCoverage,
          promptVersion: diary.promptVersion,
        },
      },
      { userId: user.id },
    );

    return success({ id: data.id, summary: diary.summary });
  },
);
