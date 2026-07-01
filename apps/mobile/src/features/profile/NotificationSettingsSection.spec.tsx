// EVAL-0055 — 알림 설정 섹션 단위 테스트: 3종 토글 렌더 + 권한 재요청/거부 안내 + 전체 OFF 토큰 무효화.
// 실 IO(prefs read/write · push capability · 설정 딥링크)는 모듈 경계에서 mock — 계약 자체는
// notification-prefs.spec / register-token.spec / unregister-token.spec(보존 eval)이 검증한다.
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockFetchNotificationPrefs = jest.fn();
const mockUpdateNotificationPrefs = jest.fn();
const mockOpenNotificationSettings = jest.fn();
const mockRegisterPushToken = jest.fn();
const mockUnregisterPushToken = jest.fn();

jest.mock("@/features/profile/api/profile-reads", () => ({
  fetchNotificationPrefs: (...a: unknown[]) => mockFetchNotificationPrefs(...a),
}));
jest.mock("./notification-prefs", () => ({
  updateNotificationPrefs: (...a: unknown[]) => mockUpdateNotificationPrefs(...a),
  openNotificationSettings: (...a: unknown[]) => mockOpenNotificationSettings(...a),
}));
jest.mock("@/capabilities/push-notification", () => ({
  registerPushToken: (...a: unknown[]) => mockRegisterPushToken(...a),
  unregisterPushToken: (...a: unknown[]) => mockUnregisterPushToken(...a),
}));

// eslint-disable-next-line import/first -- jest.mock 은 babel 이 hoist 하므로 모킹 선언을 위에 둔다
import { NotificationSettingsSection } from "./NotificationSettingsSection";

const ALL_OFF = { start: false, deadline: false, kudos: false };

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchNotificationPrefs.mockResolvedValue(ALL_OFF);
  mockUpdateNotificationPrefs.mockResolvedValue({ ok: true });
  mockRegisterPushToken.mockResolvedValue({ ok: true });
  mockUnregisterPushToken.mockResolvedValue({ ok: true, skipped: false });
});

describe("NotificationSettingsSection", () => {
  it("notification_prefs 3종 토글을 렌더한다", async () => {
    render(<NotificationSettingsSection userId="u1" />);
    expect(await screen.findByLabelText("그룹 활동 알림")).toBeTruthy();
    expect(screen.getByLabelText("마감 임박 알림")).toBeTruthy();
    expect(screen.getByLabelText("응원 받음 알림")).toBeTruthy();
  });

  it("토글 ON + 권한 허용 → 토큰 등록 후 prefs 를 저장한다", async () => {
    render(<NotificationSettingsSection userId="u1" />);
    const start = await screen.findByLabelText("그룹 활동 알림");

    fireEvent(start, "valueChange", true);

    await waitFor(() => expect(mockRegisterPushToken).toHaveBeenCalledWith("u1"));
    await waitFor(() =>
      expect(mockUpdateNotificationPrefs).toHaveBeenCalledWith("u1", {
        start: true,
        deadline: false,
        kudos: false,
      }),
    );
    expect(mockOpenNotificationSettings).not.toHaveBeenCalled();
  });

  it("토글 ON + 권한 거부 → prefs 저장 없이 설정 앱 안내를 노출한다", async () => {
    mockRegisterPushToken.mockResolvedValue({ ok: false, reason: "permission_denied" });
    render(<NotificationSettingsSection userId="u1" />);
    const start = await screen.findByLabelText("그룹 활동 알림");

    fireEvent(start, "valueChange", true);

    expect(await screen.findByText(/기기 설정에서 알림을 켜/)).toBeTruthy();
    expect(mockUpdateNotificationPrefs).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("설정 열기"));
    expect(mockOpenNotificationSettings).toHaveBeenCalledTimes(1);
  });

  it("마지막 토글 OFF(전체 OFF) → prefs 저장 후 이 기기 토큰을 무효화한다", async () => {
    mockFetchNotificationPrefs.mockResolvedValue({ start: true, deadline: false, kudos: false });
    render(<NotificationSettingsSection userId="u1" />);
    const start = await screen.findByLabelText("그룹 활동 알림");

    fireEvent(start, "valueChange", false);

    await waitFor(() => expect(mockUpdateNotificationPrefs).toHaveBeenCalledWith("u1", ALL_OFF));
    await waitFor(() => expect(mockUnregisterPushToken).toHaveBeenCalledWith("u1"));
    // 끄는 경로는 권한 재요청(registerPushToken)을 호출하지 않는다.
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
  });

  it("이미 하나 ON 인 상태에서 추가 ON 은 registerPushToken 을 재호출하지 않는다", async () => {
    render(<NotificationSettingsSection userId="u1" />);
    const start = await screen.findByLabelText("그룹 활동 알림");

    // 전부 OFF → 첫 ON: 등록 1회.
    fireEvent(start, "valueChange", true);
    await waitFor(() => expect(mockUpdateNotificationPrefs).toHaveBeenCalledTimes(1));
    expect(mockRegisterPushToken).toHaveBeenCalledTimes(1);

    // 이미 하나 ON 상태에서 두 번째 ON: 재등록(upsert) 없이 prefs 만 저장.
    const deadline = screen.getByLabelText("마감 임박 알림");
    fireEvent(deadline, "valueChange", true);
    await waitFor(() => expect(mockUpdateNotificationPrefs).toHaveBeenCalledTimes(2));
    expect(mockRegisterPushToken).toHaveBeenCalledTimes(1);
    expect(mockUpdateNotificationPrefs).toHaveBeenLastCalledWith("u1", {
      start: true,
      deadline: true,
      kudos: false,
    });
  });

  it("전체 OFF 시 unregisterPushToken 실패는 console.error 로 남기고 흐름을 막지 않는다", async () => {
    mockFetchNotificationPrefs.mockResolvedValue({ start: true, deadline: false, kudos: false });
    mockUnregisterPushToken.mockResolvedValue({ ok: false });
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    render(<NotificationSettingsSection userId="u1" />);
    const start = await screen.findByLabelText("그룹 활동 알림");

    fireEvent(start, "valueChange", false);

    await waitFor(() => expect(mockUnregisterPushToken).toHaveBeenCalledWith("u1"));
    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        "[NotificationSettings] unregisterPushToken failed",
        "u1",
      ),
    );
    // prefs 저장은 정상 완료 — soft-delete 실패가 흐름을 막지 않는다.
    expect(mockUpdateNotificationPrefs).toHaveBeenCalledWith("u1", ALL_OFF);
    consoleError.mockRestore();
  });
});
