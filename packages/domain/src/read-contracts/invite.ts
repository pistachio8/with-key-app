// read-contracts/invite — 비로그인 초대 미리보기 계약 (EVAL-0016 · ADR-0036 §4 · ADR-0037).
// RN·web 모두 SECURITY DEFINER RPC `get_invite_preview(token)` 로 전환 예정 —
// migration 과 web 전환은 ADR-0036 후속 task(별도 PR). 본 스키마는 그 RPC 응답 계약을 고정한다.
// token 미발견 시 null 동등 동작.
import { z } from "zod";

export type InvitePreview = {
  groupId: string;
  groupName: string | null;
  expiresAt: string;
  expired: boolean;
  full: boolean;
  // pending 챌린지가 있으면 1줄 요약을 같이 내려줌 — 친구가 참여 전에 조건 확인 가능.
  pendingChallenge: {
    title: string;
    goalCount: number;
    penaltyAmount: number;
    durationDays: number;
  } | null;
};

export const invitePreviewSchema: z.ZodType<InvitePreview> = z.object({
  groupId: z.string(),
  groupName: z.string().nullable(),
  expiresAt: z.string(),
  expired: z.boolean(),
  full: z.boolean(),
  pendingChallenge: z
    .object({
      title: z.string(),
      goalCount: z.number(),
      penaltyAmount: z.number(),
      durationDays: z.number(),
    })
    .nullable(),
});
