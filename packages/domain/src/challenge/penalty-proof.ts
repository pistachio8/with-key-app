// 벌칙(만회 찬스) 증명 동료 판단 과반 공식 — spec §C4 / EVAL-0044.
// toggle_penalty_proof_rejection RPC(0055)·toggle_peer_rejection(0048)의 과반식 TS SoT.
// SQL 은 로컬 실행 검증이 어려우므로(로컬 Supabase 부재), 동일 공식을 순수 함수로 두어 단위 테스트한다.

/**
 * 증명이 동료 과반 반려로 "불성실" 판정됐는지.
 *
 * 수행자(증명 제출자)는 자기 증명을 반려할 수 없으므로 유효 판단자는 `N-1`명이고,
 * 반려가 그 과반(`rejectCount > (N-1)/2`)이면 반려 확정이다. peer-reject(0048)와 off-by-one 없이 동일식.
 *
 * - 솔로(signedParticipantCount=1): `(1-1)/2 = 0`, rejectCount=0 → `false` = 항상 인정.
 *   판단할 동료가 없으니 면제(spec §C4 — POC 친구 그룹 범위라 별도 floor 없음).
 * - 2명: 판단자 1 → 1표면 과반(반려). 3명: 판단자 2 → 2표. 4명: 판단자 3 → 2표(>1.5).
 */
export function isPenaltyProofRejectedByPeers(
  rejectCount: number,
  signedParticipantCount: number,
): boolean {
  return rejectCount > (signedParticipantCount - 1) / 2;
}
