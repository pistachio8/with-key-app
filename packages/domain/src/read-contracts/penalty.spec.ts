import { describe, it, expect } from "vitest";
import {
  penaltyStatusViewSchema,
  penaltyProofViewSchema,
  penaltyWindowPhaseSchema,
  type PenaltyStatusView,
} from "./penalty";

const PROOF = {
  proofId: "11111111-1111-1111-1111-111111111111",
  performerId: "u-jj",
  performerName: "JJ",
  status: "pending" as const,
  videoSignedUrl: "https://signed.example.com/v1",
  rejectCount: 1,
  viewerRejected: false,
  rejectedByPeers: false,
  isViewer: false,
};

const VIEW: PenaltyStatusView = {
  challengeId: "c1",
  title: "주 3회 헬스장",
  penaltyMission: "팔굽혀펴기 20개",
  penaltyAmount: 3000,
  windowPhase: "open",
  endAt: "2026-05-08T00:00:00Z",
  isParticipant: true,
  isSigned: true,
  viewerConfirmedPenalty: 3000,
  viewerProof: { ...PROOF, performerId: "u-minji", performerName: "민지", isViewer: true },
  proofs: [PROOF],
  signedParticipantCount: 3,
};

describe("penalty read-contract zod", () => {
  it("penaltyWindowPhaseSchema는 before/open/expired만 수용", () => {
    expect(penaltyWindowPhaseSchema.parse("open")).toBe("open");
    expect(penaltyWindowPhaseSchema.safeParse("running").success).toBe(false);
  });

  it("penaltyProofViewSchema가 proof view를 수용", () => {
    expect(penaltyProofViewSchema.parse(PROOF)).toEqual(PROOF);
  });

  it("penaltyStatusViewSchema가 status view를 round-trip", () => {
    expect(penaltyStatusViewSchema.parse(VIEW)).toEqual(VIEW);
  });

  it("status enum 밖이면 거부", () => {
    expect(penaltyProofViewSchema.safeParse({ ...PROOF, status: "settled" }).success).toBe(false);
  });

  it("익명성 by contract — voter_id 류 누출 필드는 schema가 strip (spec §Verification ②)", () => {
    // BFF 응답에 익명성 위반 필드가 실수로 실려도 read-contract 가 reject count 만 남기고 strip 한다.
    const leaked = { ...PROOF, voterId: "u-secret", rejecterIds: ["u-a", "u-b"] };
    const parsed = penaltyProofViewSchema.parse(leaked);
    expect("voterId" in parsed).toBe(false);
    expect("rejecterIds" in parsed).toBe(false);
  });
});
