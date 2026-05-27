import { describe, it, expect, vi, beforeEach } from "vitest";

const getClaimsMock = vi.fn();

vi.mock("./server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
  })),
}));

describe("getAuthedUser", () => {
  beforeEach(() => {
    getClaimsMock.mockReset();
    vi.resetModules();
  });

  it("claims 의 sub/email 을 user 로 매핑한다", async () => {
    getClaimsMock.mockResolvedValue({
      data: {
        claims: { sub: "u1", email: "a@b.c" },
        header: { alg: "RS256", typ: "JWT" },
        signature: new Uint8Array(),
      },
      error: null,
    });
    const { getAuthedUser } = await import("./auth");
    const result = await getAuthedUser();
    expect(result.user).toEqual({ id: "u1", email: "a@b.c" });
  });

  it("email 이 없으면 null 로 채운다", async () => {
    getClaimsMock.mockResolvedValue({
      data: {
        claims: { sub: "u1" },
        header: { alg: "RS256", typ: "JWT" },
        signature: new Uint8Array(),
      },
      error: null,
    });
    const { getAuthedUser } = await import("./auth");
    const result = await getAuthedUser();
    expect(result.user).toEqual({ id: "u1", email: null });
  });

  it("error 가 있으면 user 는 null", async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: { message: "no session" } });
    const { getAuthedUser } = await import("./auth");
    const result = await getAuthedUser();
    expect(result.user).toBeNull();
  });

  it("세션이 없으면 (data/error 둘 다 null) user 는 null", async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: null });
    const { getAuthedUser } = await import("./auth");
    const result = await getAuthedUser();
    expect(result.user).toBeNull();
  });

  it("claims.sub 이 string 이 아니면 user 는 null", async () => {
    getClaimsMock.mockResolvedValue({
      data: {
        claims: { sub: undefined, email: "a@b.c" },
        header: { alg: "RS256", typ: "JWT" },
        signature: new Uint8Array(),
      },
      error: null,
    });
    const { getAuthedUser } = await import("./auth");
    const result = await getAuthedUser();
    expect(result.user).toBeNull();
  });
});
