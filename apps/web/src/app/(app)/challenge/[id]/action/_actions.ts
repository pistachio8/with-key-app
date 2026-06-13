"use server";

import { revalidatePath, updateTag } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { type SubmitResult } from "@withkey/domain";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { deletePhoto, uploadPhoto } from "@/lib/storage/action-photos";
import { recordVerifySignals } from "@/lib/verify";
import { submitActionLogCore } from "@/lib/action-log/submit-core";

// BE_SCHEMA §8.5 — submitActionLog 는 공유 코어(submit-core.ts)의 web wrapper 다 (D-7 spec C1).
// cookie 세션 client 를 주입하고, Server Action 전용 updateTag(read-your-own-writes 즉시 갱신)를
// caller tail 로 둔다. 본문 로직(KST·doneCount·AI·photo·push·revalidatePath)은 RN BFF route 와
// 공유하는 코어가 소유 — 이것이 web↔RN drift 를 by construction 으로 막는다.
export const submitActionLog = withUser<FormData, SubmitResult>(
  async (user, formData): Promise<ActionResult<SubmitResult>> => {
    const result = await submitActionLogCore(await createClient(), user, formData);
    // Phase 5-1: 본인 verifiedToday 즉시 fresh — /home 의 stats/list cache 무효화.
    // updateTag 는 Next 16 Server Action 전용(Route Handler 금지)이라 코어가 아닌 wrapper 에서
    // 호출한다. 실패 응답에는 새 row 가 없으므로 무효화하지 않는다(원본 동작 보존).
    if (result.ok) updateTag(`user-${user.id}-home-feed`);
    return result;
  },
);

// 사진 1회 교체(EVAL-0024) 입력 — 본문은 안 받는다(불변). challengeId·actionLogId 만 식별.
const replacePhotoInputSchema = z.object({
  challengeId: z.string().uuid(),
  actionLogId: z.string().uuid(),
});

type ReplacePhotoResult = {
  id: string;
  // 교체된 새 photo_path (서명 URL 재발급/리렌더용).
  photoPath: string;
};

// EVAL-0024 (WP4) — 마감 전 1회 사진 교체. 잘못 올린 사진을 마감 전 한 번만 바로잡는다(AC-auto-verify-5).
// 2회째·마감 후는 서버 가드로 차단. 본문(키워드·종류·일기)은 불변이고 photo_path 만 갱신된다.
//
// 1회 제한 추적: action_logs.edited_at(0001, immutability 목록에서 제외 — 0045 §C)을 플래그로 쓴다.
//   edited_at IS NULL = 미교체. 교체 성공 시 now() 를 기록 → 이후 IS NOT NULL 이면 2회째로 거부한다.
// immutability 예외(EVAL-0020, 0045/0046): photo_path 교체는 예외 ②. photo_path·edited_at 갱신은
//   adminClient(service_role)로 한 번에 atomic UPDATE 한다 — `.is("edited_at", null)` 조건이 1회 제한을
//   race-safe 하게 강제하고(동시 2요청 중 1건만 성공), recordVerifySignals(EVAL-0021)가 같은 흐름에서
//   이미 admin write 를 쓰는 패턴과 정렬된다. 기존 update_action_log_photo_path RPC(0011)는 edited_at·
//   once-gate 를 지원하지 않고 그 확장은 migration 이라 본 task 의 non-goal 이다.
export const replaceActionPhoto = withUser<FormData, ReplacePhotoResult>(
  async (user, formData): Promise<ActionResult<ReplacePhotoResult>> => {
    const parsed = replacePhotoInputSchema.safeParse({
      challengeId: String(formData.get("challengeId") ?? ""),
      actionLogId: String(formData.get("actionLogId") ?? ""),
    });
    if (!parsed.success) return validationFailure(parsed.error);

    const maybeFile = formData.get("photo");
    const file = maybeFile instanceof File && maybeFile.size > 0 ? maybeFile : null;
    if (!file) return failure("invalid_input", { photo: ["required"] });

    const { challengeId, actionLogId } = parsed.data;
    const supabase = await createClient();

    // 소유·마감·교체여부 선제 조회(RLS — 본인 행만). end_at/status 로 마감 가드, edited_at 로 1회 가드.
    const { data: log, error: readErr } = await supabase
      .from("action_logs")
      .select("photo_path, edited_at, challenges!inner(status, end_at)")
      .eq("id", actionLogId)
      .eq("challenge_id", challengeId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (readErr) return failure(mapSupabaseError(readErr));
    if (!log) return failure("not_found");

    const ch = Array.isArray(log.challenges) ? log.challenges[0] : log.challenges;
    const now = Date.now();
    // 마감 후/비활성 차단 — submitActionLog 와 동일한 active + end_at 게이트.
    if (!ch || ch.status !== "active" || !ch.end_at || now > new Date(ch.end_at).getTime()) {
      return failure("forbidden");
    }
    // 이미 1회 교체됨 — 2회째 차단(빠른 경로, 업로드 전에 거부).
    if (log.edited_at) return failure("conflict");

    // 교체 사진 업로드 — 새 nonce 로 새 object 가 생성되므로 기존 object 와 충돌하지 않는다.
    const upload = await uploadPhoto({
      userId: user.id,
      challengeId,
      actionLogId,
      file,
      client: supabase,
    });
    if (!upload.ok) {
      return failure(upload.reason === "upload_failed" ? "upstream_error" : "invalid_input");
    }

    // photo_path + edited_at atomic 교체. `.is("edited_at", null)` 가 1회 제한의 최종(race-safe) 게이트다.
    const admin = adminClient();
    const { data: updated, error: updErr } = await admin
      .from("action_logs")
      .update({ photo_path: upload.path, edited_at: new Date(now).toISOString() })
      .eq("id", actionLogId)
      .eq("user_id", user.id)
      .is("edited_at", null)
      .select("id")
      .maybeSingle();

    if (updErr) {
      await deletePhoto(user.id, upload.path, supabase);
      return failure(mapSupabaseError(updErr));
    }
    if (!updated) {
      // 동시 요청이 먼저 슬롯을 차지함 — 방금 올린 object 를 정리하고 2회째로 거부한다.
      await deletePhoto(user.id, upload.path, supabase);
      return failure("conflict");
    }

    // 직전 사진 정리(best-effort) — 실패해도 교체 자체는 성공으로 본다.
    if (log.photo_path && log.photo_path !== upload.path) {
      await deletePhoto(user.id, log.photo_path, supabase);
    }

    // 교체 시 부정탐지 신호 재실행(EVAL-0021) — phash/EXIF/스크린샷 재계산. status 판정은 안 한다(EVAL-0022).
    // after() 로 응답 latency 와 분리하고 비파괴(실패해도 교체는 성공).
    const photoBuffer = Buffer.from(await file.arrayBuffer());
    after(() =>
      recordVerifySignals({
        actionLogId,
        userId: user.id,
        photo: photoBuffer,
        submittedAt: new Date(now),
      }).catch((e) => {
        console.error("[replaceActionPhoto] recordVerifySignals failed", e);
      }),
    );

    revalidatePath(`/challenge/${challengeId}`);
    revalidatePath(`/challenge/${challengeId}/dashboard`);
    updateTag(`user-${user.id}-home-feed`);

    return success({ id: actionLogId, photoPath: upload.path });
  },
);
