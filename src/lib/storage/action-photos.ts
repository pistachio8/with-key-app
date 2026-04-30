import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  ALLOWED_PHOTO_MIME,
  MAX_PHOTO_BYTES,
  type AllowedPhotoMime,
} from "@/lib/validators/action-log";

const BUCKET = "action-photos";
const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp", "heic", "heif"] as const;
type AllowedExt = (typeof ALLOWED_EXT)[number];

const MIME_TO_EXT: Record<AllowedPhotoMime, AllowedExt> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

const EXT_TO_MIME: Record<AllowedExt, AllowedPhotoMime> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
const PHOTO_PATH_RE =
  /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+-[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp|heic|heif)$/i;

export function looksLikePhotoPath(value: string | null | undefined): value is string {
  if (!value || value.includes("://")) return false;
  return PHOTO_PATH_RE.test(value);
}

export function buildPhotoPath(opts: {
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
    throw new Error(`photo extension not allowed: ${ext}`);
  }

  return `${opts.userId}/${opts.challengeId}/${opts.actionLogId}-${nonce}.${ext}`;
}

export function extFromFile(file: Pick<File, "type" | "name">): AllowedExt {
  if (file.type) {
    if ((ALLOWED_PHOTO_MIME as readonly string[]).includes(file.type)) {
      return MIME_TO_EXT[file.type as AllowedPhotoMime];
    }
    throw new Error(`photo mime not allowed: ${file.type}`);
  }

  const dot = file.name.lastIndexOf(".");
  if (dot > 0) {
    const ext = file.name.slice(dot + 1).toLowerCase();
    if ((ALLOWED_EXT as readonly string[]).includes(ext)) return ext as AllowedExt;
  }

  throw new Error(`unknown photo type: ${file.name}`);
}

type UploadArgs = {
  userId: string;
  challengeId: string;
  actionLogId: string;
  file: File;
  client?: SupabaseClient;
};

export type UploadPhotoResult =
  | { ok: true; path: string }
  | { ok: false; reason: "mime" | "size" | "upload_failed" };

export async function uploadPhoto(args: UploadArgs): Promise<UploadPhotoResult> {
  const { userId, challengeId, actionLogId, file } = args;

  if (file.size < 1 || file.size > MAX_PHOTO_BYTES) {
    return { ok: false, reason: "size" };
  }

  let ext: AllowedExt;
  try {
    ext = extFromFile(file);
  } catch {
    return { ok: false, reason: "mime" };
  }

  const path = buildPhotoPath({ userId, challengeId, actionLogId, ext });
  const supabase = args.client ?? (await createClient());
  const contentType = file.type || EXT_TO_MIME[ext];

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType, upsert: false });

  if (error) {
    console.error("[uploadPhoto] storage upload failed", { path, error });
    return { ok: false, reason: "upload_failed" };
  }

  return { ok: true, path };
}

export async function getPhotoSignedUrl(
  path: string | null | undefined,
  client?: SupabaseClient,
): Promise<string | null> {
  if (!looksLikePhotoPath(path)) return null;

  const supabase = client ?? (await createClient());
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Batch sign multiple paths at once. Falls back to null for any path that
 * either fails RLS or is not a valid Storage path. Preserves input order.
 *
 * Rationale: a feed of N rows previously fanned out N Storage calls via
 * Promise.all; createSignedUrls collapses that into a single request.
 */
export async function getPhotoSignedUrls(
  paths: ReadonlyArray<string | null | undefined>,
  client?: SupabaseClient,
): Promise<Array<string | null>> {
  const validIndices: number[] = [];
  const validPaths: string[] = [];
  paths.forEach((path, index) => {
    if (looksLikePhotoPath(path)) {
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

export async function deletePhoto(
  userId: string,
  path: string,
  client?: SupabaseClient,
): Promise<void> {
  if (!path.startsWith(`${userId}/`)) return;
  const supabase = client ?? (await createClient());
  await supabase.storage.from(BUCKET).remove([path]);
}
