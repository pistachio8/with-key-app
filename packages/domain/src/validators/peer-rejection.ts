import { z } from "zod";

// 🟨 익명 피어 반려 입력(ADR-0038 / EVAL-0025). kudos 와 분리 — emoji 없음(반려는 단일 의미).
// 토글은 actionLogId 만 필요(voter 는 서버에서 auth.uid() 로 식별, 클라가 보내지 않는다 — 위조 방지·익명성).
export const peerRejectionInputSchema = z.object({
  actionLogId: z.string().uuid(),
});

// toggle_peer_rejection RPC(0048) 반환 — 카운트만 노출(voter_id 비노출, 익명성).
export const peerRejectionToggleResultSchema = z.object({
  peerRejectCount: z.number().int().nonnegative(),
  viewerRejected: z.boolean(),
  status: z.enum(["passed", "peer_rejected", "failed", "manual_review", "pending"]),
});

export type PeerRejectionInput = z.infer<typeof peerRejectionInputSchema>;
export type PeerRejectionToggleResult = z.infer<typeof peerRejectionToggleResultSchema>;
