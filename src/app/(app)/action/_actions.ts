"use server";

import type { ZodError } from "zod";
import { actionLogInputSchema, type ActionLogInput } from "@/lib/validators/action-log";
import { generateDiary } from "@/lib/ai/diary";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";
import { deletePhoto, uploadPhoto } from "@/lib/storage/action-photos";

type SubmitResult = { id: string; summary: string; photoAttached: boolean };

function readJsonArray(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string") return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function parseFormData(
  formData: FormData,
):
  | { ok: true; input: ActionLogInput; file: File | null }
  | { ok: false; error: ZodError<ActionLogInput> } {
  const memoRaw = formData.get("memo");
  const memo = typeof memoRaw === "string" ? memoRaw.trim() : "";
  const raw = {
    challengeId: String(formData.get("challengeId") ?? ""),
    activityType: String(formData.get("activityType") ?? ""),
    selectedKeywords: readJsonArray(formData.get("selectedKeywords")),
    shownKeywords: readJsonArray(formData.get("shownKeywords")),
    rerollCount: Number(formData.get("rerollCount") ?? 0),
    memo: memo.length > 0 ? memo : undefined,
  };
  const parsed = actionLogInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error };

  const maybeFile = formData.get("photo");
  const file = maybeFile instanceof File && maybeFile.size > 0 ? maybeFile : null;
  return { ok: true, input: parsed.data, file };
}

// BE_SCHEMA §8.5. RLS 가 참가자/active/기간 검증.
export const submitActionLog = withUser<FormData, SubmitResult>(
  async (user, formData): Promise<ActionResult<SubmitResult>> => {
    const parsed = parseFormData(formData);
    if (!parsed.ok) return validationFailure(parsed.error);

    const supabase = await createClient();

    // Ownership/active 이중 방어: RLS 가 최종 차단하지만 UX 메시지 분기 위해 선제 체크.
    const { data: membership, error: mErr } = await supabase
      .from("challenge_participants")
      .select("user_id, challenges!inner(status, start_at, end_at)")
      .eq("challenge_id", parsed.input.challengeId)
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

    // D-017: display_name 은 템플릿 fallback 시 1인칭 톤에서 쓰임. RLS users_select_self 가 허용.
    const { data: profile } = await supabase
      .from("users")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    const diary = await generateDiary(
      {
        activityType: parsed.input.activityType,
        keywords: parsed.input.selectedKeywords,
        memo: parsed.input.memo,
      },
      { displayName: profile?.display_name ?? undefined },
    );

    const { data, error } = await supabase
      .from("action_logs")
      .insert({
        challenge_id: parsed.input.challengeId,
        user_id: user.id,
        activity_type: parsed.input.activityType,
        photo_path: null,
        selected_keywords: parsed.input.selectedKeywords,
        shown_keywords: parsed.input.shownKeywords,
        reroll_count: parsed.input.rerollCount,
        memo: parsed.input.memo ?? null,
        ai_summary: diary.summary,
        template_fallback: diary.fallback,
        prompt_version: diary.promptVersion,
      })
      .select("id")
      .single();

    if (error) return failure(mapSupabaseError(error));
    if (!data) return failure("upstream_error");

    // D-018: 2-step photo upload → RPC update. 실패는 비파괴 폴백 (photoAttached=false).
    let photoAttached = false;
    let photoSize = 0;
    if (parsed.file) {
      const upload = await uploadPhoto({
        userId: user.id,
        challengeId: parsed.input.challengeId,
        actionLogId: data.id,
        file: parsed.file,
        client: supabase,
      });

      if (upload.ok) {
        const { error: rpcError } = await supabase.rpc("update_action_log_photo_path", {
          p_log_id: data.id,
          p_photo_path: upload.path,
        });
        if (rpcError) {
          console.error("[submitActionLog] update_action_log_photo_path failed", rpcError);
          await deletePhoto(user.id, upload.path, supabase);
        } else {
          photoAttached = true;
          photoSize = parsed.file.size;
        }
      } else {
        console.warn("[submitActionLog] uploadPhoto failed", {
          actionLogId: data.id,
          reason: upload.reason,
        });
      }
    }

    // track() is never-throw (D-017) — no .catch needed.
    void track(
      {
        name: "action_logged",
        props: {
          challengeId: parsed.input.challengeId,
          activityType: parsed.input.activityType,
          selectedKeywords: parsed.input.selectedKeywords,
          keywordCount: parsed.input.selectedKeywords.length,
          hasMemo: Boolean(parsed.input.memo),
          rerollCount: parsed.input.rerollCount,
          photoSize,
          photoAttached,
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

    return success({ id: data.id, summary: diary.summary, photoAttached });
  },
);
