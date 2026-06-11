// 건의 사진 Storage 헬퍼 — spec C2. action-photos 와 분리: 버킷·경로 규격(2-segment)이 다르다.
import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { MAX_PHOTO_BYTES } from "@withkey/domain";
import { extFromFile } from "./action-photos";

const BUCKET = "feedback-photos";
const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp"] as const;
const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
// {userId}/{feedbackId}-{nonce}.{ext}
const FEEDBACK_PHOTO_PATH_RE =
  /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+-[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/i;

// Slack #qa 트리아지용 — 내부 채널 한정 노출이라 앱 피드(600s)보다 길게 둔다 (ADR-0035).
export const FEEDBACK_SIGNED_URL_TTL_SECONDS = 72 * 60 * 60;

export function looksLikeFeedbackPhotoPath(value: string | null | undefined): value is string {
  if (!value || value.includes("://")) return false;
  return FEEDBACK_PHOTO_PATH_RE.test(value);
}

export function buildFeedbackPhotoPath(opts: {
  userId: string;
  feedbackId: string;
  ext: string;
  nonce?: string;
}): string {
  const nonce = opts.nonce ?? randomUUID().replaceAll("-", "").slice(0, 12);
  const ext = opts.ext.toLowerCase();

  for (const segment of [opts.userId, opts.feedbackId, nonce]) {
    if (!SEGMENT_RE.test(segment)) {
      throw new Error(`invalid path segment: ${segment}`);
    }
  }
  if (!(ALLOWED_EXT as readonly string[]).includes(ext)) {
    throw new Error(`photo extension not allowed: ${ext}`);
  }

  return `${opts.userId}/${opts.feedbackId}-${nonce}.${ext}`;
}

export type UploadFeedbackPhotoResult =
  | { ok: true; path: string }
  | { ok: false; reason: "mime" | "size" | "upload_failed" };

export async function uploadFeedbackPhoto(args: {
  userId: string;
  feedbackId: string;
  file: File;
  client?: SupabaseClient;
}): Promise<UploadFeedbackPhotoResult> {
  const { userId, feedbackId, file } = args;

  if (file.size < 1 || file.size > MAX_PHOTO_BYTES) {
    return { ok: false, reason: "size" };
  }

  let ext: string;
  try {
    ext = extFromFile(file);
  } catch {
    return { ok: false, reason: "mime" };
  }

  const path = buildFeedbackPhotoPath({ userId, feedbackId, ext });
  const supabase = args.client ?? (await createClient());

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });

  if (error) {
    console.error("[uploadFeedbackPhoto] storage upload failed", { path, error });
    return { ok: false, reason: "upload_failed" };
  }

  return { ok: true, path };
}

export async function getFeedbackPhotoSignedUrl(
  path: string | null | undefined,
  client: SupabaseClient,
): Promise<string | null> {
  if (!looksLikeFeedbackPhotoPath(path)) return null;
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(path, FEEDBACK_SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function deleteFeedbackPhoto(
  userId: string,
  path: string,
  client?: SupabaseClient,
): Promise<void> {
  if (!path.startsWith(`${userId}/`)) return;
  const supabase = client ?? (await createClient());
  await supabase.storage.from(BUCKET).remove([path]);
}
