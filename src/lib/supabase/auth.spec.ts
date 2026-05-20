import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();

vi.mock("./server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));

describe("getAuthedUser", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    vi.resetModules();
  });

  it("user 객체를 반환한다", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.c" } }, error: null });
    const { getAuthedUser } = await import("./auth");
    const result = await getAuthedUser();
    expect(result.user?.id).toBe("u1");
  });

  it("error 가 있으면 user 는 null", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: "no session" } });
    const { getAuthedUser } = await import("./auth");
    const result = await getAuthedUser();
    expect(result.user).toBeNull();
  });
});
