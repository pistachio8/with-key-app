"use server";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import type { ZodError } from "zod";
import { feedbackSchema, MAX_FEEDBACK_PHOTOS, type FeedbackInput } from "@withkey/domain";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import {
  deleteFeedbackPhoto,
  getFeedbackPhotoSignedUrl,
  uploadFeedbackPhotos,
} from "@/lib/storage/feedback-photos";
import { notifyFeedbackToSlack } from "@/lib/slack/notify";
import { track } from "@/lib/analytics/track";

function parseFormData(
  formData: FormData,
):
  | { ok: true; input: FeedbackInput; files: File[] }
  | { ok: false; error: ZodError<FeedbackInput> } {
  const raw = {
    category: String(formData.get("category") ?? ""),
    body: String(formData.get("body") ?? ""),
  };
  const parsed = feedbackSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error };

  // 멀티 사진은 "photos" 로 받고, 구 단일 "photo" 키도 흡수(하위호환). 최대 MAX 장.
  const photos = formData.getAll("photos");
  const single = formData.get("photo");
  const files = [...photos, ...(single ? [single] : [])]
    .filter((v): v is File => v instanceof File && v.size > 0)
    .slice(0, MAX_FEEDBACK_PHOTOS);
  return { ok: true, input: parsed.data, files };
}

// spec C4 — 사진 업로드 선행: INSERT-only RLS 라 insert 후 photo_path UPDATE 경로가 없다.
// id 선생성: SELECT 정책이 없어 insert(...).select() 가 RLS 에 막힌다 (ADR-0035).
export const submitFeedback = withUser<FormData, { ok: true }>(
  async (user, formData): Promise<ActionResult<{ ok: true }>> => {
    const parsed = parseFormData(formData);
    if (!parsed.ok) return validationFailure(parsed.error);

    const supabase = await createClient();
    const feedbackId = randomUUID();

    // 비파괴 — 실패한 장은 건너뛰고 성공 path 만 모은다(본문은 무조건 저장).
    let photoPaths: string[] = [];
    if (parsed.files.length > 0) {
      photoPaths = await uploadFeedbackPhotos({
        userId: user.id,
        feedbackId,
        files: parsed.files,
        client: supabase,
      });
    }

    const { error } = await supabase.from("feedback").insert({
      id: feedbackId,
      user_id: user.id,
      category: parsed.input.category,
      body: parsed.input.body,
      photo_path: photoPaths[0] ?? null, // deprecated 하위호환 — photo_paths[0] 미러
      photo_paths: photoPaths,
    });

    if (error) {
      // orphan object 정리 (best-effort) — 업로드 선행의 트레이드오프 (ADR-0035).
      if (photoPaths.length > 0) {
        await Promise.all(photoPaths.map((p) => deleteFeedbackPhoto(user.id, p, supabase)));
      }
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
      // analytics 는 Slack 노출과 독립 — slack 경로가 던져도 photo_count 는 남긴다.
      void track(
        {
          name: "feedback_submitted",
          props: { category: parsed.input.category, photo_count: photoPaths.length },
        },
        { userId: user.id },
      );
      try {
        const admin = adminClient();
        const urls = (
          await Promise.all(photoPaths.map((p) => getFeedbackPhotoSignedUrl(p, admin)))
        ).filter((u): u is string => !!u);
        await notifyFeedbackToSlack({ ...slackInput, photoUrls: urls });
      } catch (e) {
        // notifyFeedbackToSlack 은 never-throw 지만 signed URL 생성 실패까지 방어.
        console.error("[submitFeedback] slack notify failed", e);
      }
    });

    return success({ ok: true });
  },
);
