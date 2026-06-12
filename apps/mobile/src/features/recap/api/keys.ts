// 정산(recap) query key factory (03 §12 · ADR-0037).
//
// invalidation 기대값:
// - endChallenge(조기 종료) 후 → recapKeys.latest(), recapKeys.view(challengeId)
// - submitActionLog 후(만기 직전 인증) → recapKeys.view(challengeId)
// - 사진은 immutable(0011) — photos 는 시간 만료(signed URL TTL) 외 invalidation 불요.
//   단 expo-image cacheKey 는 actionLogId 고정(URL 회전과 무관, ADR-0036 §3).
// - 로그아웃/계정 전환 → queryClient.clear()
export const recapKeys = {
  all: ["recap"] as const,
  // challengeId 미지정 진입(/recap) — 가장 최근 종료 챌린지.
  latest: () => [...recapKeys.all, "latest"] as const,
  view: (challengeId: string) => [...recapKeys.all, "view", challengeId] as const,
  photos: (challengeId: string) => [...recapKeys.all, "photos", challengeId] as const,
};
