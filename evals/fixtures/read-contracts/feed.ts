// EVAL-0016 보존 eval fixture — 피드 BFF(GET /api/feed) 응답 계약 샘플.
// web fetchChallengeFeed 가 만드는 FeedItemView[] 와 같은 shape — 양쪽 spec 이
// @withkey/domain feedResponseSchema 로 parse 해 계약 일치를 검증한다.

export const FEED_CHALLENGE_ID = "c1";

export const FEED_RESPONSE = [
  {
    id: "log-1",
    authorId: "u2",
    authorName: "제이",
    photoSignedUrl:
      "https://example.supabase.co/storage/v1/object/sign/action-photos/u2/c1/log-1-abc.jpg?token=x",
    summary: "러닝 30분 완료 — 아침 공기가 상쾌했다.",
    keywords: ["러닝", "아침"],
    kudosByEmoji: { "🔥": 2, "💪": 0, "👏": 1 },
    viewerKudos: ["🔥"],
    peerRejectCount: 0,
    viewerRejected: false,
    createdAt: "2026-05-02T03:00:00Z",
  },
  {
    id: "log-2",
    authorId: "u1",
    authorName: "민지",
    photoSignedUrl: null,
    summary: "홈트 완료.",
    keywords: ["홈트"],
    kudosByEmoji: { "🔥": 0, "💪": 0, "👏": 0 },
    viewerKudos: [],
    peerRejectCount: 0,
    viewerRejected: false,
    createdAt: "2026-05-01T03:00:00Z",
  },
];
