"use server";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import type { ZodError } from "zod";
import { feedbackSchema, type FeedbackInput } from "@withkey/domain";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import {
  deleteFeedbackPhoto,
  getFeedbackPhotoSignedUrl,
  uploadFeedbackPhoto,
} from "@/lib/storage/feedback-photos";
import { notifyFeedbackToSlack } from "@/lib/slack/notify";

function parseFormData(
  formData: FormData,
):
  | { ok: true; input: FeedbackInput; file: File | null }
  | { ok: false; error: ZodError<FeedbackInput> } {
  const raw = {
    category: String(formData.get("category") ?? ""),
    body: String(formData.get("body") ?? ""),
  };
  const parsed = feedbackSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error };

  const maybeFile = formData.get("photo");
  const file = maybeFile instanceof File && maybeFile.size > 0 ? maybeFile : null;
  return { ok: true, input: parsed.data, file };
}

// spec C4 — 사진 업로드 선행: INSERT-only RLS 라 insert 후 photo_path UPDATE 경로가 없다.
// id 선생성: SELECT 정책이 없어 insert(...).select() 가 RLS 에 막힌다 (ADR-0035).
export const submitFeedback = withUser<FormData, { ok: true }>(
  async (user, formData): Promise<ActionResult<{ ok: true }>> => {
    const parsed = parseFormData(formData);
    if (!parsed.ok) return validationFailure(parsed.error);

    const supabase = await createClient();
    const feedbackId = randomUUID();

    let photoPath: string | null = null;
    if (parsed.file) {
      const upload = await uploadFeedbackPhoto({
        userId: user.id,
        feedbackId,
        file: parsed.file,
        client: supabase,
      });
      if (upload.ok) {
        photoPath = upload.path;
      } else {
        // 비파괴 폴백 — 본문만 저장하고 제출은 성공시킨다.
        console.warn("[submitFeedback] uploadFeedbackPhoto failed", {
          feedbackId,
          reason: upload.reason,
        });
      }
    }

    const { error } = await supabase.from("feedback").insert({
      id: feedbackId,
      user_id: user.id,
      category: parsed.input.category,
      body: parsed.input.body,
      photo_path: photoPath,
    });

    if (error) {
      // orphan object 정리 (best-effort) — 업로드 선행의 트레이드오프 (ADR-0035).
      if (photoPath) await deleteFeedbackPhoto(user.id, photoPath, supabase);
      return failure(mapSupabaseError(error));
    }

    // Slack 알림은 응답 latency 와 분리 — submitActionLog 의 push 패턴과 동형.
    const slackInput = {
      category: parsed.input.category,
      body: parsed.input.body,
      userId: user.id,
      email: user.email,
    };
    after(async () => {
      try {
        const photoUrl = photoPath
          ? await getFeedbackPhotoSignedUrl(photoPath, adminClient())
          : null;
        await notifyFeedbackToSlack({ ...slackInput, photoUrl });
      } catch (e) {
        // notifyFeedbackToSlack 은 never-throw 지만 signed URL 생성 실패까지 방어.
        console.error("[submitFeedback] slack notify failed", e);
      }
    });

    return success({ ok: true });
  },
);
