import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFetch = vi.fn();

vi.mock("@/lib/supabase/bearer", () => ({
  bearerTokenFrom: (req: Request) => {
    const h = req.headers.get("authorization");
    if (!h) return null;
    const [s, t] = h.split(" ");
    return s?.toLowerCase() === "bearer" && t ? t : null;
  },
  createBearerClient: () => ({ auth: { getUser: mockGetUser } }),
}));
vi.mock("@/lib/db/reads/penalty-status", () => ({
  fetchPenaltyStatusForViewerClient: (...a: unknown[]) => mockFetch(...a),
}));

import { GET } from "./route";

const CID = "11111111-1111-1111-1111-111111111111";
function req(token: string | null, cid: string | null = CID): Request {
  const url = `https://x.test/api/penalty-status${cid ? `?challengeId=${cid}` : ""}`;
  return new Request(url, token ? { headers: { authorization: `Bearer ${token}` } } : {});
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "u-minji" } }, error: null });
});

describe("GET /api/penalty-status", () => {
  it("토큰 없으면 401", async () => {
    const res = await GET(req(null));
    expect(res.status).toBe(401);
  });

  it("getUser 인증 실패(error)면 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid token" } });
    const res = await GET(req("tok"));
    expect(res.status).toBe(401);
  });

  it("challengeId가 uuid 아니면 400", async () => {
    const res = await GET(req("tok", "not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("view가 있으면 200 + JSON", async () => {
    mockFetch.mockResolvedValue({ challengeId: CID, penaltyMission: "팔굽혀펴기", proofs: [] });
    const res = await GET(req("tok"));
    expect(res.status).toBe(200);
    expect((await res.json()).challengeId).toBe(CID);
  });

  it("null(접근 불가)이면 404", async () => {
    mockFetch.mockResolvedValue(null);
    const res = await GET(req("tok"));
    expect(res.status).toBe(404);
  });

  it("벌칙 미션 없으면 404", async () => {
    mockFetch.mockResolvedValue({ challengeId: CID, penaltyMission: null, proofs: [] });
    const res = await GET(req("tok"));
    expect(res.status).toBe(404);
  });

  it("read throw → 500 (feed 선례: 봉투 계약 밖, RN은 BffRequestError로 처리)", async () => {
    mockFetch.mockRejectedValue(new Error("boom"));
    const res = await GET(req("tok"));
    expect(res.status).toBe(500);
  });
});
