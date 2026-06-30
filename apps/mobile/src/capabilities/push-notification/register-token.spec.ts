// EVAL-0052 — registerPushToken 단위 테스트 (ADR-0041 RN direct upsert).
// native 모듈(expo-notifications/device/constants/secure-store/crypto)을 경계에서 모킹하고
// register + device-id + notifications 실 로직을 함께 돌린다. supabase 는 write 경로라 inline mock.
const mockGetSupabaseClient = jest.fn();
const mockUpsert = jest.fn();
const mockFrom = jest.fn();

const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();
const mockGetExpoPushToken = jest.fn();
const mockSetChannel = jest.fn();

const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
const mockRandomUUID = jest.fn();

const mockDeviceState = { isDevice: true };
const mockConstantsState = { projectId: "proj-123" as string | null, version: "0.1.0" };

jest.mock("@/services/supabase/client", () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
}));
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: (...a: unknown[]) => mockGetPermissions(...a),
  requestPermissionsAsync: (...a: unknown[]) => mockRequestPermissions(...a),
  getExpoPushTokenAsync: (...a: unknown[]) => mockGetExpoPushToken(...a),
  setNotificationChannelAsync: (...a: unknown[]) => mockSetChannel(...a),
  AndroidImportance: { DEFAULT: 5 },
}));
jest.mock("expo-device", () => ({
  get isDevice() {
    return mockDeviceState.isDevice;
  },
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return {
        version: mockConstantsState.version,
        extra: { eas: { projectId: mockConstantsState.projectId } },
      };
    },
  },
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: (...a: unknown[]) => mockGetItem(...a),
  setItemAsync: (...a: unknown[]) => mockSetItem(...a),
}));
jest.mock("expo-crypto", () => ({
  randomUUID: () => mockRandomUUID(),
}));

// eslint-disable-next-line import/first -- jest.mock 은 babel 이 hoist 하므로 모킹 선언을 위에 둔다
import { registerPushToken } from "./register-token";

beforeEach(() => {
  jest.clearAllMocks();
  mockDeviceState.isDevice = true;
  mockConstantsState.projectId = "proj-123";
  mockFrom.mockReturnValue({ upsert: mockUpsert });
  mockGetSupabaseClient.mockReturnValue({ from: mockFrom });
  mockUpsert.mockResolvedValue({ error: null });
  mockGetPermissions.mockResolvedValue({ status: "granted" });
  mockRequestPermissions.mockResolvedValue({ status: "granted" });
  mockGetExpoPushToken.mockResolvedValue({ data: "ExponentPushToken[abc]" });
  mockGetItem.mockResolvedValue(null);
  mockRandomUUID.mockReturnValue("device-uuid-1");
});

describe("registerPushToken", () => {
  it("권한 허용 시 device_push_tokens 에 (user_id, device_id) upsert 한다", async () => {
    const result = await registerPushToken("user-1");

    expect(result).toEqual({ ok: true });
    expect(mockFrom).toHaveBeenCalledWith("device_push_tokens");
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        device_id: "device-uuid-1",
        expo_push_token: "ExponentPushToken[abc]",
        platform: "ios",
        app_version: "0.1.0",
        disabled_at: null,
        last_seen_at: expect.any(String),
      }),
      { onConflict: "user_id,device_id" },
    );
  });

  it("이미 허용 상태면 권한을 재요청하지 않는다", async () => {
    await registerPushToken("user-1");
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it("새 기기는 device_id UUID 를 생성·영속한다", async () => {
    await registerPushToken("user-1");
    expect(mockSetItem).toHaveBeenCalledWith("withkey.push.device_id", "device-uuid-1");
  });

  it("저장된 device_id 가 있으면 재사용한다(UUID 재생성 없음)", async () => {
    mockGetItem.mockResolvedValue("existing-device");
    await registerPushToken("user-1");
    expect(mockRandomUUID).not.toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ device_id: "existing-device" }),
      expect.anything(),
    );
  });

  it("권한 거부 시 조용히 skip — upsert 하지 않는다", async () => {
    mockGetPermissions.mockResolvedValue({ status: "undetermined" });
    mockRequestPermissions.mockResolvedValue({ status: "denied" });

    expect(await registerPushToken("user-1")).toEqual({ ok: false, reason: "permission_denied" });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("시뮬레이터(Device.isDevice=false)는 권한 요청 없이 skip", async () => {
    mockDeviceState.isDevice = false;

    expect(await registerPushToken("user-1")).toEqual({ ok: false, reason: "not_device" });
    expect(mockGetPermissions).not.toHaveBeenCalled();
  });

  it("EAS projectId 미설정이면 token 발급 없이 skip", async () => {
    mockConstantsState.projectId = null;

    expect(await registerPushToken("user-1")).toEqual({ ok: false, reason: "no_project_id" });
    expect(mockGetExpoPushToken).not.toHaveBeenCalled();
  });

  it("upsert 실패는 reason:error 로 흡수한다", async () => {
    mockUpsert.mockResolvedValue({ error: { message: "rls denied" } });
    expect(await registerPushToken("user-1")).toEqual({ ok: false, reason: "error" });
  });
});
