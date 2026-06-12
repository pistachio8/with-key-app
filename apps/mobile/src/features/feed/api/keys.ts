// 피드 query key factory (03 §12 · ADR-0037 — TanStack Query 도입은 spec 확정 대상이라
// 라이브러리 비의존 상수 factory 만 정의한다. 키 계층: [도메인, ...스코프]).
//
// invalidation 기대값:
// - submitActionLog(인증 제출) 후 → feedKeys.list(challengeId) invalidate
// - toggleKudos 후 → feedKeys.list(challengeId) invalidate (counts·viewerKudos 포함 응답)
// - 멤버 입·탈퇴(visibility 변화) 후 → feedKeys.list(challengeId) invalidate
// - 로그아웃/계정 전환 → queryClient.clear() (viewer-keyed 캐시 전면 폐기)
export const feedKeys = {
  all: ["feed"] as const,
  list: (challengeId: string) => [...feedKeys.all, "list", challengeId] as const,
};
