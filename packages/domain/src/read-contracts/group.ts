// read-contracts/group — 그룹 상세·내 그룹 목록 view-model 계약 (EVAL-0016 · ADR-0037).
// 둘 다 RN-safe(RLS) 직접 read — RLS(groups_select_member 등)가 비멤버를 차단한다.
import type { ChallengeStatus } from "../validators/challenge";

export type GroupMemberView = {
  id: string;
  displayName: string;
  role: "owner" | "member";
  joinedAt: string;
};

export type GroupChallengeRow = {
  id: string;
  title: string;
  status: ChallengeStatus;
  startAt: string | null;
  endAt: string | null;
};

// 그룹 상세(web fetchGroupDetail · RN group read service).
// account_number_encrypted 평문은 본 계약에 포함되지 않음 (D-016).
export type GroupDetailView = {
  id: string;
  name: string | null;
  ownerId: string;
  bankCode: string | null;
  accountHolder: string | null;
  accountNumberLast4: string | null;
  members: GroupMemberView[];
  challenges: GroupChallengeRow[];
};

// 헤더 그룹 전환 sheet(F15) — 활성 그룹만, created_at 내림차순.
export type MyGroupSummary = {
  id: string;
  name: string | null;
};
