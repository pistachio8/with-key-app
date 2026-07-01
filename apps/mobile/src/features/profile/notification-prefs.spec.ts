// EVAL-0055 — 알림 설정 write service 단위 테스트: RLS self-row update + 설정 딥링크.
// supabase 는 write 경로라 inline mock(unregister-token.spec 패턴). domain 계약 검증은 실 스키마로 돈다.
const mockGetSupabaseClient = jest.fn();
const mockEq = jest.fn();
const mockUpdate = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/services/supabase/client", () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
}));

// eslint-disable-next-line import/first -- jest.mock 은 babel 이 hoist 하므로 모킹 선언을 위에 둔다
import { Linking } from "react-native";
// eslint-disable-next-line import/first
import { openNotificationSettings, updateNotificationPrefs } from "./notification-prefs";

beforeEach(() => {
  jest.clearAllMocks();
  mockEq.mockResolvedValue({ error: null });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ update: mockUpdate });
  mockGetSupabaseClient.mockReturnValue({ from: mockFrom });
});

describe("updateNotificationPrefs", () => {
  it("users self-row 의 notification_prefs 를 update 한다(RLS self-row = .eq(id))", async () => {
    const result = await updateNotificationPrefs("u1", {
      start: true,
      deadline: false,
      kudos: true,
    });

    expect(result).toEqual({ ok: true });
    expect(mockFrom).toHaveBeenCalledWith("users");
    expect(mockUpdate).toHaveBeenCalledWith({
      notification_prefs: { start: true, deadline: false, kudos: true },
    });
    expect(mockEq).toHaveBeenCalledWith("id", "u1");
  });

  it("update 에러는 ok:false 로 흡수한다", async () => {
    mockEq.mockResolvedValue({ error: { message: "rls denied" } });
    await expect(
      updateNotificationPrefs("u1", { start: false, deadline: false, kudos: false }),
    ).resolves.toEqual({ ok: false });
  });

  it("domain 계약(notificationPrefsSchema) 위반 입력은 write 없이 ok:false", async () => {
    const result = await updateNotificationPrefs("u1", {
      // @ts-expect-error 계약 위반 입력을 강제 주입 — safeParse 가 걸러야 한다
      start: "yes",
      deadline: false,
      kudos: false,
    });

    expect(result).toEqual({ ok: false });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("openNotificationSettings", () => {
  it("OS 설정 화면을 연다(Linking.openSettings)", () => {
    const spy = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    openNotificationSettings();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
