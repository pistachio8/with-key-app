// 벌칙(만회 찬스) 창2 query key factory (03 §12 · ADR-0037 — TanStack Query 도입은 spec 확정
// 대상이라 라이브러리 비의존 상수 factory 만 정의한다. 키 계층: [도메인, ...스코프]).
//
// invalidation 기대값:
// - submitPenaltyProof(증명 제출, Phase D) 후 → penaltyKeys.status(challengeId) invalidate (proofs·viewerProof)
// - togglePenaltyRejection(반려 토글, Phase E) 후 → penaltyKeys.status(challengeId) invalidate (rejectCount·rejectedByPeers)
// - 창2 진입/만료(시간 게이트 변화) → penaltyKeys.waiting() invalidate (home "만회 찬스 대기" 멤버십)
// - 로그아웃/계정 전환 → queryClient.clear() (viewer-keyed 캐시 전면 폐기 — key 에 viewerId 미포함)
export const penaltyKeys = {
  all: ["penalty"] as const,
  status: (challengeId: string) => [...penaltyKeys.all, "status", challengeId] as const,
  waiting: () => [...penaltyKeys.all, "waiting"] as const,
};
