import { z } from "zod";

// 벌칙(만회 찬스) 증명 제출·동료 판단 입력/결과 — spec §C3·§C4 / EVAL-0044. peer-rejection.ts 미러.

// 증명 status — penalty_proofs.status CHECK(0055)와 1:1. 'accepted'/'expired'는 창2 만료 확정(EVAL-0045+).
export const penaltyProofStatusSchema = z.enum(["pending", "accepted", "rejected", "expired"]);

// 제출: action-videos 경로(mediaPath)만. 수행자는 서버 auth.uid() 로 식별(클라가 보내지 않는다 — 위조 방지).
export const penaltyProofSubmitInputSchema = z.object({
  challengeId: z.string().uuid(),
  mediaPath: z.string().min(10).max(512),
});

// 동료 판단 토글: proofId 만. voter 는 서버 auth.uid()(위조 방지·익명성).
export const penaltyProofRejectionInputSchema = z.object({
  proofId: z.string().uuid(),
});

// toggle_penalty_proof_rejection RPC(0055) 반환 — 카운트만 노출(voter_id 비노출, 익명성).
export const penaltyProofRejectionToggleResultSchema = z.object({
  rejectCount: z.number().int().nonnegative(),
  viewerRejected: z.boolean(),
  status: penaltyProofStatusSchema,
});

export type PenaltyProofStatus = z.infer<typeof penaltyProofStatusSchema>;
export type PenaltyProofSubmitInput = z.infer<typeof penaltyProofSubmitInputSchema>;
export type PenaltyProofRejectionInput = z.infer<typeof penaltyProofRejectionInputSchema>;
export type PenaltyProofRejectionToggleResult = z.infer<
  typeof penaltyProofRejectionToggleResultSchema
>;
