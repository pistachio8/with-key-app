// write-contracts/penalty — 벌칙 증명 제출 BFF 쓰기 계약 (spec 2026-06-29 §C2).
// web Server Action(submitPenaltyProof) · BFF route(POST /api/penalty-proof) · RN service 가
// 공유하는 응답 SoT. ActionResult 봉투 passthrough — action-log.ts 패턴 동일.
import { z } from "zod";
import { errorCodeSchema } from "./action-log";
import { penaltyProofStatusSchema } from "../validators/penalty";

// _actions.ts SubmitResult({ proofId, status }) 승격. mediaPath 는 서버 내부값이라 응답에서 strip.
export const penaltyProofSubmitResultSchema = z.object({
  proofId: z.string(),
  status: penaltyProofStatusSchema,
});
export type PenaltyProofSubmitResult = z.infer<typeof penaltyProofSubmitResultSchema>;

// ActionFailure.issues 미러 — zod fieldErrors shape (필드명 → 메시지 배열). action-log.ts 동일.
const issuesSchema = z.record(z.string(), z.array(z.string()).optional()).optional();

// ActionResult<PenaltyProofSubmitResult> 봉투 discriminated union.
export const penaltyProofSubmitResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: penaltyProofSubmitResultSchema }),
  z.object({ ok: z.literal(false), error: errorCodeSchema, issues: issuesSchema }),
]);
export type PenaltyProofSubmitResponse = z.infer<typeof penaltyProofSubmitResponseSchema>;
