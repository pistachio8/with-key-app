// EVAL-0052 — unregisterPushToken 단위 테스트 (로그아웃 시나리오 · ADR-0041 soft-delete).
const mockGetSupabaseClient = jest.fn();
const mockMatch = jest.fn();
const mockUpdate = jest.fn();
const mockFrom = jest.fn();

const mockGetItem = jest.fn();

jest.mock("@/services/supabase/client", () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: (...a: unknown[]) => mockGetItem(...a),
  setItemAsync: jest.fn(),
}));
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn() }));

// eslint-disable-next-line import/first -- jest.mock hoist
import { unregisterPushToken } from "./unregister-token";

beforeEach(() => {
  jest.clearAllMocks();
  mockMatch.mockResolvedValue({ error: null });
  mockUpdate.mockReturnValue({ match: mockMatch });
  mockFrom.mockReturnValue({ update: mockUpdate });
  mockGetSupabaseClient.mockReturnValue({ from: mockFrom });
});

describe("unregisterPushToken", () => {
  it("등록된 기기는 (user_id, device_id) token 을 disabled_at 으로 soft-delete 한다", async () => {
    mockGetItem.mockResolvedValue("device-uuid-1");

    const result = await unregisterPushToken("user-1");

    expect(result).toEqual({ ok: true, skipped: false });
    expect(mockFrom).toHaveBeenCalledWith("device_push_tokens");
    expect(mockUpdate).toHaveBeenCalledWith({ disabled_at: expect.any(String) });
    expect(mockMatch).toHaveBeenCalledWith({ user_id: "user-1", device_id: "device-uuid-1" });
  });

  it("device_id 가 없으면 (등록된 적 없는 기기) skip 한다", async () => {
    mockGetItem.mockResolvedValue(null);

    expect(await unregisterPushToken("user-1")).toEqual({ ok: true, skipped: true });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("update 실패는 ok:false 로 흡수한다", async () => {
    mockGetItem.mockResolvedValue("device-uuid-1");
    mockMatch.mockResolvedValue({ error: { message: "boom" } });

    expect(await unregisterPushToken("user-1")).toEqual({ ok: false });
  });
});
