import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db/reads/recap", () => ({ fetchRecap: vi.fn() }));
vi.mock("@/lib/db/reads/challenge-photos", () => ({
  fetchChallengePhotos: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/share/hero-image", () => ({
  duotoneDataUrl: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/og", () => ({
  ImageResponse: class extends Response {
    constructor() {
      super(new Blob(["png"], { type: "image/png" }), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }
  },
}));

const { GET } = await import("./route");
const { createClient } = await import("@/lib/supabase/server");
const { fetchRecap } = await import("@/lib/db/reads/recap");
const { fetchChallengePhotos } = await import("@/lib/db/reads/challenge-photos");
const { duotoneDataUrl } = await import("@/lib/share/hero-image");

function authed() {
  (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
  });
}

function buildReq(qs: string): Request {
  return new Request(`http://t/api/og/recap-card?${qs}`);
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

describe("GET /api/og/recap-card", () => {
  it("missing challengeId → 400", async () => {
    authed();
    const res = await GET(buildReq(""));
    expect(res.status).toBe(400);
  });

  it("미인증 시 401", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });
    const res = await GET(buildReq("challengeId=c1"));
    expect(res.status).toBe(401);
  });

  it("recap 없음 → 404", async () => {
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(buildReq("challengeId=c1"));
    expect(res.status).toBe(404);
  });

  it("active+만기 recap(status=active) → 200", async () => {
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue({ ...RECAP, status: "active" });
    const res = await GET(buildReq("challengeId=c1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/image\/png/);
  });

  it("template=ticket → 200 image/png", async () => {
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(RECAP);
    const res = await GET(buildReq("challengeId=c1&template=ticket"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/image\/png/);
  });

  it("template=ticket → 내 사진(u1) 중 seed로 골라 duotone 적용", async () => {
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(RECAP);
    (fetchChallengePhotos as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: "p1",
        signedUrl: "https://s/p1.jpg",
        takenAt: "t",
        ownerDisplayName: "나",
        ownerId: "u1",
      },
      {
        id: "p2",
        signedUrl: "https://s/p2.jpg",
        takenAt: "t",
        ownerDisplayName: "남",
        ownerId: "u2",
      },
    ]);
    const res = await GET(buildReq("challengeId=c1&template=ticket&seed=1"));
    expect(res.status).toBe(200);
    // 내 사진(u1=p1)만 후보 → 단일 후보라 seed 무관하게 p1 선택 → duotone 호출.
    expect(duotoneDataUrl).toHaveBeenCalledWith("https://s/p1.jpg");
  });

  it("내 사진 0장이면 전체 사진에서 고른다(fallback)", async () => {
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(RECAP);
    (fetchChallengePhotos as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: "p2",
        signedUrl: "https://s/p2.jpg",
        takenAt: "t",
        ownerDisplayName: "남",
        ownerId: "u2",
      },
    ]);
    const res = await GET(buildReq("challengeId=c1&template=ticket&seed=3"));
    expect(res.status).toBe(200);
    expect(duotoneDataUrl).toHaveBeenCalledWith("https://s/p2.jpg");
  });
});
