"use server";

import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import {
  penaltyProofSubmitInputSchema,
  penaltyProofRejectionInputSchema,
  penaltyProofRejectionToggleResultSchema,
  type PenaltyProofRejectionInput,
  type PenaltyProofRejectionToggleResult,
} from "@withkey/domain";
import { withUser } from "@/lib/auth/with-user";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { createClient } from "@/lib/supabase/server";
import { uploadVideo } from "@/lib/storage/action-videos";

// 벌칙(만회 찬스) 증명 제출·동료 판단 Server Action (spec §C3·§C4 / EVAL-0044).
// togglePeerRejection(challenge/[id]/_actions.ts) 패턴을 그대로 미러 — withUser 래퍼 + supabase.rpc +
// 입력 zod 검증 + read-your-writes tag 무효화. write 는 RPC(submit_penalty_proof·toggle_penalty_proof_rejection)
// 단일 경로(0055 §D) — 클라는 challengeId / proofId 만 보낸다.

// action-videos 경로의 3번째 세그먼트 — 벌칙 증명은 actionLogId 가 없으므로 합성 라벨을 쓴다.
// 결과 경로 {userId}/{challengeId}/penalty-{nonce}.{ext} 는 submit_penalty_proof RPC 의
// split_part 검증(seg1=userId, seg2=challengeId)·looksLikeVideoPath·storage RLS(av_insert_self) 모두 통과.
const PENALTY_VIDEO_LABEL = "penalty";

type SubmitResult = { proofId: string; status: string };

// 증명 제출: 영상 업로드 → submit_penalty_proof RPC(창2 시간창·자격 검증은 RPC 가 강제).
// FormData(challengeId + 영상 파일)를 받는다 — mediaPath 는 서버가 업로드 후 생성(클라 위조 방지).
export const submitPenaltyProof = withUser<FormData, SubmitResult>(
  async (user, formData): Promise<ActionResult<SubmitResult>> => {
    const challengeId = String(formData.get("challengeId") ?? "");
    const maybeFile = formData.get("video");
    const file = maybeFile instanceof File && maybeFile.size > 0 ? maybeFile : null;
    if (!file) return failure("invalid_input", { video: ["required"] });

    // 입력 경계 검증을 업로드보다 먼저 — challengeId 가 uuid 가 아니면 buildVideoPath 가 세그먼트
    // 검증(SEGMENT_RE)에서 throw 한다(uncaught → withUser 가 ActionResult shape 대신 오류 응답).
    // zod 로 먼저 막아 서버 경계 방어 + 일관된 실패 shape 를 보존한다.
    const idCheck = penaltyProofSubmitInputSchema.shape.challengeId.safeParse(challengeId);
    if (!idCheck.success) return failure("invalid_input", { challengeId: ["invalid"] });

    const supabase = await createClient();

    // action-videos 업로드 — MIME/크기 검증은 uploadVideo 가 담당. actionLogId 자리에 합성 라벨.
    const upload = await uploadVideo({
      userId: user.id,
      challengeId: idCheck.data,
      actionLogId: PENALTY_VIDEO_LABEL,
      file,
      client: supabase,
    });
    if (!upload.ok) {
      return failure(upload.reason === "upload_failed" ? "upstream_error" : "invalid_input", {
        video: [upload.reason],
      });
    }

    // 입력 계약(@withkey/domain zod) 검증 — challengeId uuid · mediaPath 길이.
    const parsed = penaltyProofSubmitInputSchema.safeParse({
      challengeId: idCheck.data,
      mediaPath: upload.path,
    });
    if (!parsed.success) return validationFailure(parsed.error);

    const { data, error } = await supabase.rpc("submit_penalty_proof", {
      p_challenge_id: parsed.data.challengeId,
      p_media_path: parsed.data.mediaPath,
    });
    if (error) return failure(mapSupabaseError(error));
    const row = data?.[0];
    if (!row?.proof_id) return failure("upstream_error");

    // read-your-writes: viewer proof·video signed URL 즉시 fresh. page 는 path revalidate.
    revalidatePath(`/challenge/${parsed.data.challengeId}/penalty`);
    updateTag(`penalty-video-${parsed.data.mediaPath}`);

    return success({ proofId: row.proof_id as string, status: String(row.status) });
  },
);

// 동료 판단 토글: toggle_penalty_proof_rejection RPC(시간창·본인 거부·과반 전이를 한 트랜잭션으로).
// togglePeerRejection 미러 — 클라는 proofId 만 보낸다.
export const togglePenaltyProofRejection = withUser<
  PenaltyProofRejectionInput,
  PenaltyProofRejectionToggleResult
>(async (user, input): Promise<ActionResult<PenaltyProofRejectionToggleResult>> => {
  const parsed = penaltyProofRejectionInputSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const proofId = parsed.data.proofId;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("toggle_penalty_proof_rejection", {
    p_proof_id: proofId,
  });
  if (error) return failure(mapSupabaseError(error));
  const row = data?.[0];
  if (!row) return failure("upstream_error");

  // read-your-writes: 본인 viewer state + 카운트 즉시 invalidate, 타인 다음 fetch SWR fresh
  // (peer-reject 토글과 동일 패턴). 과반 전이는 page 의 status 분기에 반영돼야 하므로 path revalidate.
  updateTag(`user-${user.id}-penalty-proof-reject-${proofId}`);
  updateTag(`penalty-proof-reject-count-${proofId}`);
  revalidateTag(`penalty-proof-reject-count-${proofId}`, "max");

  // RPC 반환(snake_case)을 domain zod SoT 로 검증 — 예상 밖 status·shape 면 upstream_error.
  const parsedResult = penaltyProofRejectionToggleResultSchema.safeParse({
    rejectCount: row.reject_count,
    viewerRejected: row.viewer_rejected,
    status: row.status,
  });
  if (!parsedResult.success) return failure("upstream_error");

  return success(parsedResult.data);
});
