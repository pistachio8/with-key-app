// src/lib/challenge/resolve-verify-target.ts
export type VerifyTargetChallenge = {
  id: string;
  title: string;
  groupName: string | null;
};

export type VerifyTarget =
  | { kind: "navigate"; href: string }
  | { kind: "picker" }
  | { kind: "none" };

/**
 * "사진 인증" 버튼 클릭 시 이동/모달 분기를 결정.
 * 우선순위: 현재 챌린지 컨텍스트 → active 1개 직행 → 2개+ 선택 → 0개 안내.
 */
export function resolveVerifyTarget(
  currentChallengeId: string | null,
  active: ReadonlyArray<VerifyTargetChallenge>,
): VerifyTarget {
  if (currentChallengeId && active.some((c) => c.id === currentChallengeId)) {
    return { kind: "navigate", href: `/challenge/${currentChallengeId}/action` };
  }
  if (active.length === 1) {
    return { kind: "navigate", href: `/challenge/${active[0].id}/action` };
  }
  if (active.length >= 2) {
    return { kind: "picker" };
  }
  return { kind: "none" };
}
