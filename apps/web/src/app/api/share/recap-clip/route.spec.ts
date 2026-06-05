import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db/reads/recap", () => ({ fetchRecap: vi.fn() }));
vi.mock("@/lib/db/reads/challenge-photos", () => ({
  fetchChallengePhotos: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/share/og-fonts", () => ({ loadCardFonts: vi.fn().mockResolvedValue([]) }));
vi.mock("./encode", () => ({ encodeClip: vi.fn().mockResolvedValue(Buffer.from("mp4")) }));
vi.mock("next/og", () => ({
  ImageResponse: class extends Response {
    constructor() {
      super(new Blob([new Uint8Array([1, 2, 3])]));
    }
  },
}));

const { GET } = await import("./route");
const { createClient } = await import("@/lib/supabase/server");
const { fetchRecap } = await import("@/lib/db/reads/recap");
const { fetchChallengePhotos } = await import("@/lib/db/reads/challenge-photos");

function authed() {
  (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
  });
}

function req(qs = "challengeId=c1"): Request {
  return new Request(`http://localhost/api/share/recap-clip?${qs}`);
}

const RECAP = {
  challengeId: "c1",
  title: "주 3회 헬스장",
  goalCount: 12,
  status: "closed" as const,
  startAt: "2026-05-16T00:00:00+09:00",
  endAt: "2026-05-28T00:00:00+09:00",
  durationDays: 14,
  penaltyAmount: 1000,
  viewerId: "u1",
  viewerAchieved: true,
  viewerDoneCount: 12,
  viewerPerHeadPenalty: 0,
  anyoneAchieved: true,
  members: [{ id: "u1", achieved: true }],
  group: {
    id: "g1",
    name: "우리 헬스방",
    ownerId: "u1",
  },
};

describe("GET /api/share/recap-clip", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("challengeId 없으면 400", async () => {
    authed();
    const res = await GET(req(""));
    expect(res.status).toBe(400);
  });

  it("미인증 시 401", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("recap null 이면 404", async () => {
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(404);
  });

  it("recap 있으면 200 video/mp4", async () => {
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(RECAP);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
  });

  it("사진 있으면 몽타주 샘플로 200 video/mp4 (렌더 throw 없음)", async () => {
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(RECAP);
    (fetchChallengePhotos as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: "p1", signedUrl: "s1", takenAt: "t", ownerDisplayName: "나", ownerId: "u1" },
      { id: "p2", signedUrl: "s2", takenAt: "t", ownerDisplayName: "남", ownerId: "u2" },
    ]);
    const res = await GET(req("challengeId=c1&seed=5"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
  });
});
