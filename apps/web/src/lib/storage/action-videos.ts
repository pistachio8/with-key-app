import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ALLOWED_VIDEO_MIME, MAX_VIDEO_BYTES, type AllowedVideoMime } from "@withkey/domain";

// 영상 인증 클립(spec §C2 / EVAL-0043). action-photos.ts 패턴 미러 —
// 같은 경로 규약({userId}/{challengeId}/{actionLogId}-{nonce}.{ext}) · private 버킷 · signed URL.
const BUCKET = "action-videos";
const ALLOWED_EXT = ["mp4", "webm", "mov"] as const;
type AllowedExt = (typeof ALLOWED_EXT)[number];

const MIME_TO_EXT: Record<AllowedVideoMime, AllowedExt> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

const EXT_TO_MIME: Record<AllowedExt, AllowedVideoMime> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
const VIDEO_PATH_RE =
  /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+-[A-Za-z0-9._-]+\.(mp4|webm|mov)$/i;

export function looksLikeVideoPath(value: string | null | undefined): value is string {
  if (!value || value.includes("://")) return false;
  return VIDEO_PATH_RE.test(value);
}

export function buildVideoPath(opts: {
  userId: string;
  challengeId: string;
  actionLogId: string;
  ext: string;
  nonce?: string;
}): string {
  const nonce = opts.nonce ?? randomUUID().replaceAll("-", "").slice(0, 12);
  const ext = opts.ext.toLowerCase();

  for (const segment of [opts.userId, opts.challengeId, opts.actionLogId, nonce]) {
    if (!SEGMENT_RE.test(segment)) {
      throw new Error(`invalid path segment: ${segment}`);
    }
  }
  if (!(ALLOWED_EXT as readonly string[]).includes(ext)) {
    throw new Error(`video extension not allowed: ${ext}`);
  }

  return `${opts.userId}/${opts.challengeId}/${opts.actionLogId}-${nonce}.${ext}`;
}

export function extFromVideoFile(file: Pick<File, "type" | "name">): AllowedExt {
  if (file.type) {
    if ((ALLOWED_VIDEO_MIME as readonly string[]).includes(file.type)) {
      return MIME_TO_EXT[file.type as AllowedVideoMime];
    }
    throw new Error(`video mime not allowed: ${file.type}`);
  }

  const dot = file.name.lastIndexOf(".");
  if (dot > 0) {
    const ext = file.name.slice(dot + 1).toLowerCase();
    if ((ALLOWED_EXT as readonly string[]).includes(ext)) return ext as AllowedExt;
  }

  throw new Error(`unknown video type: ${file.name}`);
}

type UploadArgs = {
  userId: string;
  challengeId: string;
  actionLogId: string;
  file: File;
  client?: SupabaseClient;
};

export type UploadVideoResult =
  | { ok: true; path: string }
  | { ok: false; reason: "mime" | "size" | "upload_failed" };

export async function uploadVideo(args: UploadArgs): Promise<UploadVideoResult> {
  const { userId, challengeId, actionLogId, file } = args;

  if (file.size < 1 || file.size > MAX_VIDEO_BYTES) {
    return { ok: false, reason: "size" };
  }

  let ext: AllowedExt;
  try {
    ext = extFromVideoFile(file);
  } catch {
    return { ok: false, reason: "mime" };
  }

  const path = buildVideoPath({ userId, challengeId, actionLogId, ext });
  const supabase = args.client ?? (await createClient());
  const contentType = file.type || EXT_TO_MIME[ext];

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType, upsert: false });

  if (error) {
    console.error("[uploadVideo] storage upload failed", { path, error });
    return { ok: false, reason: "upload_failed" };
  }

  return { ok: true, path };
}

export async function getVideoSignedUrl(
  path: string | null | undefined,
  client?: SupabaseClient,
): Promise<string | null> {
  if (!looksLikeVideoPath(path)) return null;

  const supabase = client ?? (await createClient());
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Batch sign multiple video paths at once (action-photos getPhotoSignedUrls 미러).
 * Preserves input order; nulls out any path failing RLS or shape validation.
 */
export async function getVideoSignedUrls(
  paths: ReadonlyArray<string | null | undefined>,
  client?: SupabaseClient,
): Promise<Array<string | null>> {
  const validIndices: number[] = [];
  const validPaths: string[] = [];
  paths.forEach((path, index) => {
    if (looksLikeVideoPath(path)) {
      validIndices.push(index);
      validPaths.push(path);
    }
  });

  const result: Array<string | null> = paths.map(() => null);
  if (validPaths.length === 0) return result;

  const supabase = client ?? (await createClient());
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(validPaths, 600);
  if (error || !data) return result;

  data.forEach((row, i) => {
    if (row?.signedUrl) result[validIndices[i]] = row.signedUrl;
  });
  return result;
}

export async function deleteVideo(
  userId: string,
  path: string,
  client?: SupabaseClient,
): Promise<void> {
  if (!path.startsWith(`${userId}/`)) return;
  const supabase = client ?? (await createClient());
  await supabase.storage.from(BUCKET).remove([path]);
}
