// src/app/api/og/recap-card/route.spec.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db/reads/recap", () => ({ fetchRecap: vi.fn() }));
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

function buildReq(challengeId: string): Request {
  return new Request(`http://t/api/og/recap-card?challengeId=${challengeId}`);
}

describe("GET /api/og/recap-card", () => {
  it("미인증 시 401", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });
    const res = await GET(buildReq("c1"));
    expect(res.status).toBe(401);
  });

  it("멤버 아님 또는 active 챌린지 시 404", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    });
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(buildReq("c1"));
    expect(res.status).toBe(404);
  });

  it("정상 — image/png Content-Type", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    });
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue({
      challengeId: "c1",
      title: "주 3회 헬스장",
      status: "closed",
      startAt: "2026-05-05T00:00:00Z",
      endAt: "2026-05-20T00:00:00Z",
      durationDays: 16,
      members: [{ id: "u1", displayName: "민지", isMvp: false }],
      group: {
        id: "g1",
        name: "우리 그룹",
        ownerId: "u1",
        bankCode: "088",
        accountHolder: "민지",
        accountNumberLast4: "1234",
      },
    });
    const res = await GET(buildReq("c1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/image\/png/);
  });
});
