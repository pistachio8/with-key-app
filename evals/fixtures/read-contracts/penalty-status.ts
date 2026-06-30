// 보존 fixture — 벌칙 창2 상태(PenaltyStatusView) transport snapshot (spec 2026-06-29 §C2).
// penalty-status 는 BFF(admin hydrate) 경로라 RN 이 view 를 조립하지 않는다 → 이 EXPECTED 는
// domain penaltyStatusViewSchema 수용 + RN BFF round-trip(fetchPenaltyStatus mock) 의 공유 SoT.
// 시나리오: 7일·주3회 closed, 창2 open. viewer 민지(미달 3000·pending 제출), JJ(미달·pending 제출).
// 다른 read-contract fixture(feed·recap 등)와 동일하게 순수 객체로 둔다 — 타입 정합은 소비
// spec(penalty.spec.ts)의 penaltyStatusViewSchema round-trip 이 검증한다(@withkey/domain self-import 는
// 빌드 산출물 의존이라 domain src typecheck context 에서 해석되지 않음).

export const PENALTY_STATUS_VIEWER = "u-minji";
export const PENALTY_STATUS_CHALLENGE = "c1";

export const PENALTY_STATUS_EXPECTED = {
  challengeId: "c1",
  title: "주 3회 헬스장",
  penaltyMission: "팔굽혀펴기 20개",
  penaltyAmount: 3000,
  windowPhase: "open",
  endAt: "2026-05-08T00:00:00Z",
  isParticipant: true,
  isSigned: true,
  viewerConfirmedPenalty: 3000,
  viewerProof: {
    proofId: "p-minji",
    performerId: "u-minji",
    performerName: "민지",
    status: "pending",
    videoSignedUrl: "https://signed.example.com/p-minji",
    rejectCount: 0,
    viewerRejected: false,
    rejectedByPeers: false,
    isViewer: true,
  },
  proofs: [
    {
      proofId: "p-minji",
      performerId: "u-minji",
      performerName: "민지",
      status: "pending",
      videoSignedUrl: "https://signed.example.com/p-minji",
      rejectCount: 0,
      viewerRejected: false,
      rejectedByPeers: false,
      isViewer: true,
    },
    {
      proofId: "p-jj",
      performerId: "u-jj",
      performerName: "JJ",
      status: "pending",
      videoSignedUrl: "https://signed.example.com/p-jj",
      rejectCount: 1,
      viewerRejected: false,
      rejectedByPeers: false,
      isViewer: false,
    },
  ],
  signedParticipantCount: 3,
};
