// @vitest-environment node
// D-7 spec scenario 5 — BFF route. bearer 없음→401, 성공봉투→200, 실패봉투→statusFor 매핑.
// core·bearer 를 mock 해 route 의 인증·status 매핑·캐시 무효화 책임만 검증한다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SUBMIT_SUCCESS_ENVELOPE,
  SUBMIT_FAILURE_ENVELOPE,
} from "../../../../../../evals/fixtures/write-contracts/action-log";

const mocks = vi.hoisted(() => ({
  submitActionLogCore: vi.fn(),
  getUser: vi.fn(),
  bearerToken: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/supabase/bearer", () => ({
  bearerTokenFrom: (...args: unknown[]) => mocks.bearerToken(...args),
  createBearerClient: () => ({ auth: { getUser: (...args: unknown[]) => mocks.getUser(...args) } }),
}));

vi.mock("@/lib/action-log/submit-core", () => ({
  submitActionLogCore: (...args: unknown[]) => mocks.submitActionLogCore(...args),
}));

vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => mocks.revalidateTag(...args),
}));

import { POST } from "./route";

const user = { id: "11111111-1111-4111-8111-111111111111", email: "u@test.local" };

function makeRequest(): Request {
  const fd = new FormData();
  fd.append("challengeId", "22222222-2222-4222-8222-222222222222");
  return new Request("http://localhost/api/action-log", { method: "POST", body: fd });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bearerToken.mockReturnValue("token-abc");
  mocks.getUser.mockResolvedValue({ data: { user }, error: null });
});

describe("POST /api/action-log", () => {
  it("bearer 토큰 없으면 401 + unauthorized 봉투 — core 미호출", async () => {
    mocks.bearerToken.mockReturnValue(null);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "unauthorized" });
    expect(mocks.submitActionLogCore).not.toHaveBeenCalled();
  });

  it("토큰이 유효하지 않으면(getUser error) 401 — core 미호출", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad token" } });
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(mocks.submitActionLogCore).not.toHaveBeenCalled();
  });

  it("성공 봉투는 200 + 봉투 passthrough + home-feed revalidateTag", async () => {
    mocks.submitActionLogCore.mockResolvedValue(SUBMIT_SUCCESS_ENVELOPE);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(SUBMIT_SUCCESS_ENVELOPE);
    expect(mocks.submitActionLogCore).toHaveBeenCalledWith(
      expect.anything(),
      user,
      expect.any(FormData),
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith(`user-${user.id}-home-feed`, "max");
  });

  it("실패 봉투(forbidden)는 403 + 봉투 passthrough + revalidateTag 미호출", async () => {
    mocks.submitActionLogCore.mockResolvedValue(SUBMIT_FAILURE_ENVELOPE);
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual(SUBMIT_FAILURE_ENVELOPE);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it.each([
    ["unauthorized", 401],
    ["invalid_input", 422],
    ["not_found", 404],
    ["conflict", 409],
    ["rate_limited", 429],
    ["upstream_error", 502],
  ] as const)("error '%s' → status %d (statusFor 매핑)", async (error, status) => {
    mocks.submitActionLogCore.mockResolvedValue({ ok: false, error });
    const res = await POST(makeRequest());
    expect(res.status).toBe(status);
  });

  it("코어가 예기치 못한 예외를 던지면 502 + upstream_error 봉투(HTML 500 아님)", async () => {
    mocks.submitActionLogCore.mockRejectedValue(new Error("boom"));
    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "upstream_error" });
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });
});
