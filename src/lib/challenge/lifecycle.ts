// 챌린지 "진행 vs 종료" 판정의 Single Source of Truth. ADR-0027.
//
// 영속·쓰기 SoT 는 DB `status` 컬럼(0029 unique index 포함)이고, 본 모듈의 `phase` 는
// "사용자에게 진행/종료로 보여줄까 · 인증 가능한가"(표시·자격)의 파생 SoT 다. 두 기준은 공존한다.
// 자연 만료(end_at 경과)로는 status 가 바뀌지 않으므로(운영자 수동 종료 + auto-close cron 만
// status 를 closed 로 전이), 표시·자격 판정은 반드시 end_at 을 본다.

export type ChallengeStatus = "pending" | "accepted" | "active" | "closed";

export type ChallengePhase = "pending" | "accepted" | "running" | "over" | "closed";

/**
 * status + end_at 으로 파생한 lifecycle phase.
 * - `closed`: 운영자 종료 또는 auto-close 로 DB 상 종료
 * - `over`: DB 상 active 이지만 end_at 경과(만료) — 종료로 취급, 정산 대상
 * - `running`: DB 상 active 이고 만기 전 — 진행 중(D-N 카운트다운)
 * - `pending`/`accepted`: 미시작
 */
export function challengePhase(
  status: ChallengeStatus,
  endAt: string | null,
  now: number = Date.now(),
): ChallengePhase {
  if (status === "closed") return "closed";
  if (status === "active") {
    return endAt != null && new Date(endAt).getTime() <= now ? "over" : "running";
  }
  return status; // 'pending' | 'accepted'
}

/** phase 가 over 또는 closed 인가 — "이 챌린지는 끝났는가"의 canonical 판정. */
export function isChallengeOver(
  status: ChallengeStatus,
  endAt: string | null,
  now: number = Date.now(),
): boolean {
  const phase = challengePhase(status, endAt, now);
  return phase === "over" || phase === "closed";
}

/**
 * end_at 까지 남은 일수(올림). 클램프하지 않는다 — 만료 시 0 이하가 된다.
 * ADR-0026 정렬(end_at = 마지막 날 다음 KST 자정) 덕에 running 챌린지는 항상 D-{duration}…D-1.
 * 호출처는 `phase==='running'` 일 때만 `D-${remainingDays}` 를 렌더해 "D-0" 노출을 막는다.
 */
export function remainingDays(endAt: string | null, now: number = Date.now()): number {
  if (!endAt) return 0;
  return Math.ceil((new Date(endAt).getTime() - now) / 86_400_000);
}
