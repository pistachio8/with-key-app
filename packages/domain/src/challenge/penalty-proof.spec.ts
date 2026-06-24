import { describe, it, expect } from "vitest";
import { isPenaltyProofRejectedByPeers } from "./penalty-proof";

// toggle_penalty_proof_rejection(0055)·toggle_peer_rejection(0048) 동일 과반식 검증(off-by-one 미러 보증).
describe("isPenaltyProofRejectedByPeers (peer-reject 과반 미러)", () => {
  it("솔로(N=1): 판단자 0 → 반려 불가, 항상 인정(floor 없음)", () => {
    expect(isPenaltyProofRejectedByPeers(0, 1)).toBe(false);
  });

  it("2명(판단자 1): 1표면 과반 → 반려", () => {
    expect(isPenaltyProofRejectedByPeers(0, 2)).toBe(false);
    expect(isPenaltyProofRejectedByPeers(1, 2)).toBe(true);
  });

  it("3명(판단자 2): 1표 미달, 2표 과반", () => {
    expect(isPenaltyProofRejectedByPeers(1, 3)).toBe(false);
    expect(isPenaltyProofRejectedByPeers(2, 3)).toBe(true);
  });

  it("4명(판단자 3): 1표 미달, 2표 과반(>1.5)", () => {
    expect(isPenaltyProofRejectedByPeers(1, 4)).toBe(false);
    expect(isPenaltyProofRejectedByPeers(2, 4)).toBe(true);
  });

  it("5명(판단자 4): 2표 미달, 3표 과반(>2)", () => {
    expect(isPenaltyProofRejectedByPeers(2, 5)).toBe(false);
    expect(isPenaltyProofRejectedByPeers(3, 5)).toBe(true);
  });
});
