// read-contracts/penalty — 벌칙(만회 찬스) 창2 화면 view-model 계약 (spec 2026-06-29 §C2 · ADR-0037).
// web fetchPenaltyStatus(admin hydrate)는 RN 에서 BFF `GET /api/penalty-status`(Bearer) 단일 endpoint
// 로만 노출된다 — admin hydrate read 는 mobile 직접 노출 금지. 본 zod 가 그 HTTP 응답 SoT(feed.ts 패턴).
// PenaltyWaitingView 는 순수 RLS read(home "만회 찬스 대기")라 BFF 가 아니라 RN 직접 read → 타입만(transport 불요).
// 추출 소스: apps/web/src/lib/db/reads/penalty-status.ts · penalty-waiting.ts. 여기 타입이 SoT 다.
import { z } from "zod";
import { penaltyProofStatusSchema, type PenaltyProofStatus } from "../validators/penalty";

// 창2 페이즈 — 종료+48h 전 'before' / [+48h,+96h] 'open' / +96h 후 'expired'.
export const penaltyWindowPhaseSchema = z.enum(["before", "open", "expired"]);
export type PenaltyWindowPhase = z.infer<typeof penaltyWindowPhaseSchema>;

export type PenaltyProofView = {
  proofId: string;
  performerId: string;
  performerName: string;
  status: PenaltyProofStatus;
  videoSignedUrl: string | null;
  rejectCount: number;
  viewerRejected: boolean;
  // 과반 반려 판정(표시용) — isPenaltyProofRejectedByPeers(rejectCount, signedParticipantCount).
  rejectedByPeers: boolean;
  isViewer: boolean;
};

export const penaltyProofViewSchema: z.ZodType<PenaltyProofView> = z.object({
  proofId: z.string(),
  performerId: z.string(),
  performerName: z.string(),
  status: penaltyProofStatusSchema,
  videoSignedUrl: z.string().nullable(),
  rejectCount: z.number().int().nonnegative(),
  viewerRejected: z.boolean(),
  rejectedByPeers: z.boolean(),
  isViewer: z.boolean(),
});

export type PenaltyStatusView = {
  challengeId: string;
  title: string;
  penaltyMission: string | null;
  penaltyAmount: number;
  // 창2 타임라인(화면 분기 게이트). end 는 closed_at ?? end_at.
  windowPhase: PenaltyWindowPhase;
  endAt: string | null;
  isParticipant: boolean;
  isSigned: boolean;
  // 확정 미달분 X>0(창1 닫힌 뒤 제출 자격). amount(원) — 0 이면 제출 대상 아님.
  viewerConfirmedPenalty: number;
  viewerProof: PenaltyProofView | null;
  proofs: PenaltyProofView[];
  // 서약 참가자 수(과반 분모).
  signedParticipantCount: number;
};

export const penaltyStatusViewSchema: z.ZodType<PenaltyStatusView> = z.object({
  challengeId: z.string(),
  title: z.string(),
  penaltyMission: z.string().nullable(),
  penaltyAmount: z.number(),
  windowPhase: penaltyWindowPhaseSchema,
  endAt: z.string().nullable(),
  isParticipant: z.boolean(),
  isSigned: z.boolean(),
  viewerConfirmedPenalty: z.number(),
  viewerProof: penaltyProofViewSchema.nullable(),
  proofs: z.array(penaltyProofViewSchema),
  signedParticipantCount: z.number().int().nonnegative(),
});

// home "만회 찬스 대기" — 순수 RLS read view-model (BFF 아님, RN 직접). transport zod 불요(타입만).
export type PenaltyWaitingView = {
  challengeId: string;
  title: string;
  groupName: string | null;
  penaltyAmount: number;
};
