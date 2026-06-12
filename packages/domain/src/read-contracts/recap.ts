// read-contracts/recap — 정산(recap) 화면 view-model 계약 (EVAL-0016 · ADR-0037).
// recap view·사진 그리드 모두 RN-safe(RLS) 직접 read.

export type RecapMemberView = {
  id: string;
  displayName: string;
  doneCount: number;
  achieved: boolean;
  isMvp: boolean;
};

export type RecapGroupView = {
  id: string;
  name: string;
  ownerId: string;
  bankCode: string | null;
  accountHolder: string | null;
  accountNumberLast4: string | null;
};

// 정산 뷰(web fetchRecap · RN recap read service).
export type RecapView = {
  challengeId: string;
  title: string;
  goalCount: number;
  durationDays: number;
  penaltyAmount: number;
  startAt: string | null;
  endAt: string | null;
  status: "active" | "closed";
  viewerId: string;
  viewerAchieved: boolean;
  viewerDoneCount: number;
  viewerPerHeadPenalty: number;
  // 영수증 주차 요약 — viewer 기준. cutoff 안에 끝난 주 수 / 그중 달성한 주 수.
  viewerElapsedWeeks: number;
  viewerAchievedWeeks: number;
  // PRD §10 — 정산 시점 그룹 계좌 lazy prompt 에 필요.
  group: RecapGroupView | null;
  members: ReadonlyArray<RecapMemberView>;
  anyoneAchieved: boolean;
};

// recap 사진 그리드(web fetchChallengePhotos · RN recap read service).
// signedUrl 은 viewer 토큰으로 생성한 pre-signed URL(스토리지 RLS ap_select_group_member).
export type RecapPhotoView = {
  id: string;
  signedUrl: string;
  takenAt: string;
  ownerDisplayName: string;
  ownerId: string;
};
