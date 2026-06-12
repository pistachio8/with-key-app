// read-contracts/challenge — home 스트립·챌린지 상세·내 챌린지·서약 화면의 view-model 계약.
// SoT 는 본 파일이며 web read 모듈(apps/web/src/lib/db/reads/*)은 re-export 로 소비한다.
// RN(G8)은 이 타입만 보고 화면을 만든다 — Next cache/cookie/admin 의존이 없는 순수 타입 (EVAL-0016 · ADR-0037).
import type { ChallengeStatus } from "../validators/challenge";
import type { ChallengePhase } from "../challenge/lifecycle";

// 홈 스트립(web fetchCurrentChallenges · RN challenge read service) — RN-safe(RLS) 직접 read.
export type GroupChallengeView = {
  groupId: string;
  groupName: string | null;
  // D-016: 마스킹·표시용 필드만 내려보냄.
  // `account_number_encrypted` 컬럼은 의도적으로 SELECT 화이트리스트에서 제외 —
  // 평문 복호화는 `revealAccountNumber`(BFF) 한 경로로만.
  bankCode: string | null;
  accountHolder: string | null;
  accountNumberLast4: string | null;
  challenge: {
    id: string;
    title: string;
    goalCount: number;
    durationDays: number;
    penaltyAmount: number;
    status: ChallengeStatus;
    // status + end_at 파생 phase (ADR-0027). 표시·자격 분기는 status 가 아니라 phase 로.
    phase: ChallengePhase;
    startAt: string | null;
    endAt: string | null;
    doneCount: number;
    daysLeft: number;
    potTotal: number;
    // 내 확정 벌금(끝난 주 미달 합·단조). 홈 "내 벌금" stat 용. (spec C0·C3)
    myConfirmedPenalty: number;
    // 코호트 분리(솔로 1 / 그룹 ≥2) — PR-2.
    participantCount: number;
    // 그룹 멤버이지만 이미 시작된 챌린지 코호트에는 없을 수 있다.
    userIsParticipant: boolean;
    // 홈 stats/list — 오늘 본인 인증 여부. KST 자정 기준.
    verifiedToday: boolean;
  } | null;
};

// 챌린지 상세 멤버 — 계약은 직렬화 안전(JSON) 필드만.
// web 은 여기에 서버 전용 `doneByWeek: ReadonlyMap<number, number>`(dashboard 칩·링)를
// 확장해 쓴다 — Map 은 JSON 직렬화 불가라 RN 계약에서 제외 (ADR-0037).
export type ChallengeMemberView = {
  id: string;
  displayName: string;
  doneCount: number;
  signed: boolean;
};

export type ChallengeGroupView = {
  id: string;
  ownerId: string;
  bankCode: string | null;
  accountHolder: string | null;
  accountNumberLast4: string | null;
};

// 챌린지 상세(web fetchChallengeDetail · RN challenge read service) — RN-safe(RLS) 직접 read.
export type ChallengeDetailView = {
  id: string;
  title: string;
  goalCount: number;
  durationDays: number;
  penaltyAmount: number;
  status: ChallengeStatus;
  startAt: string | null;
  endAt: string | null;
  // 조기 종료 cutoff 산정용 (ADR-0030). 미종료/레거시는 null.
  closedAt: string | null;
  members: ChallengeMemberView[];
  potTotal: number;
  group: ChallengeGroupView;
  // 코호트 분리(솔로 1 / 그룹 ≥2) + UI 분기 — PR-2. = members.length (시드 후 freeze).
  participantCount: number;
};

// /me/challenges 운영·참여 분리(web fetchMyChallenges) — RN-safe(RLS) 직접 read.
export type MyChallengeItem = {
  id: string;
  title: string;
  status: ChallengeStatus;
  startAt: string | null;
  endAt: string | null;
  ownerId: string;
};

export type MyChallenges = {
  owner: MyChallengeItem[];
  member: MyChallengeItem[];
};

export type MyChallengeCounts = {
  owner: number;
  member: number;
  totalParticipated: number;
};

// 서약 화면(web fetchPendingPledge) — RN-safe(RLS) 직접 read.
export type PledgeView = {
  id: string;
  title: string;
  goalCount: number;
  durationDays: number;
  penaltyAmount: number;
  members: ReadonlyArray<{ id: string; displayName: string; signed: boolean }>;
  mySigned: boolean;
};
