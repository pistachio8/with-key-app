// 챌린지 query key factory (03 §12 · ADR-0037 — 라이브러리 비의존 상수 factory).
//
// invalidation 기대값:
// - submitActionLog(인증 제출) 후 → challengeKeys.current(), challengeKeys.detail(challengeId)
// - signPledge 후 → challengeKeys.pledge(challengeId), challengeKeys.current(), challengeKeys.detail(challengeId)
// - createChallenge / startChallengeWithSignedParticipants 후 → challengeKeys.current(), challengeKeys.my()
// - acceptInvite / leaveChallenge / endChallenge / deleteChallenge 후
//   → challengeKeys.current(), challengeKeys.my(), challengeKeys.detail(challengeId)
// - 로그아웃/계정 전환 → queryClient.clear()
//   (key 에 viewerId 를 넣지 않는다 — client cache 는 계정 단위, 세션 교체 시 전면 폐기가 규칙)
export const challengeKeys = {
  all: ["challenge"] as const,
  // 홈 스트립 (fetchCurrentChallenges) — web cacheTag `user-*-home-feed` 대응.
  current: () => [...challengeKeys.all, "current"] as const,
  detail: (challengeId: string) => [...challengeKeys.all, "detail", challengeId] as const,
  // /me 챌린지 목록 — web cacheTag `user-*-my-challenges` 대응.
  my: () => [...challengeKeys.all, "my"] as const,
  pledge: (challengeId: string) => [...challengeKeys.all, "pledge", challengeId] as const,
};
