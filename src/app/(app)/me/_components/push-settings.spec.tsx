// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const registerPushSubscription = vi.fn();
const clearMyPushSubscriptions = vi.fn();
const updateNotificationPrefs = vi.fn();
vi.mock("@/app/(app)/me/_actions", () => ({
  registerPushSubscription: (...a: unknown[]) => registerPushSubscription(...a),
  clearMyPushSubscriptions: (...a: unknown[]) => clearMyPushSubscriptions(...a),
  updateNotificationPrefs: (...a: unknown[]) => updateNotificationPrefs(...a),
}));

const isPushSupported = vi.fn();
const syncBrowserSubscription = vi.fn();
const unsubscribeFromPush = vi.fn();
vi.mock("@/lib/push/subscribe", () => ({
  isPushSupported: () => isPushSupported(),
  syncBrowserSubscription: (...a: unknown[]) => syncBrowserSubscription(...a),
  unsubscribeFromPush: () => unsubscribeFromPush(),
}));

import { PushSettings } from "./push-settings";

beforeEach(() => {
  vi.clearAllMocks();
  isPushSupported.mockReturnValue(true);
  registerPushSubscription.mockResolvedValue({ ok: true });
  clearMyPushSubscriptions.mockResolvedValue({ ok: true });
  updateNotificationPrefs.mockResolvedValue({ ok: true });
  syncBrowserSubscription.mockResolvedValue({
    endpoint: "https://fcm.googleapis.com/fcm/send/x",
    p256dh: "p",
    auth: "a",
  });
  unsubscribeFromPush.mockResolvedValue("https://fcm.googleapis.com/fcm/send/x");
});

describe("PushSettings", () => {
  it("renders toggles reflecting initialPrefs", async () => {
    render(
      <PushSettings
        initialPrefs={{ start: true, deadline: false, kudos: false }}
        initialSubscribedEndpoint="https://fcm.googleapis.com/fcm/send/x"
        vapidPublicKey="BFN..."
      />,
    );
    const startSwitch = await screen.findByRole("switch", { name: "시작 알림" });
    const deadlineSwitch = await screen.findByRole("switch", {
      name: "마감 임박 알림",
    });
    expect((startSwitch as HTMLInputElement).checked).toBe(true);
    expect((deadlineSwitch as HTMLInputElement).checked).toBe(false);
  });

  it("syncs subscription when first pref is turned on", async () => {
    render(
      <PushSettings
        initialPrefs={{ start: false, deadline: false, kudos: false }}
        initialSubscribedEndpoint={null}
        vapidPublicKey="BFN..."
      />,
    );
    const startSwitch = await screen.findByRole("switch", { name: "시작 알림" });
    fireEvent.click(startSwitch);
    await waitFor(() => expect(syncBrowserSubscription).toHaveBeenCalled());
    await waitFor(() =>
      expect(registerPushSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: "https://fcm.googleapis.com/fcm/send/x",
        }),
      ),
    );
    await waitFor(() =>
      expect(updateNotificationPrefs).toHaveBeenCalledWith({
        start: true,
        deadline: false,
        kudos: false,
      }),
    );
  });

  it("unsubscribes when both prefs go off", async () => {
    render(
      <PushSettings
        initialPrefs={{ start: true, deadline: false, kudos: false }}
        initialSubscribedEndpoint="https://fcm.googleapis.com/fcm/send/x"
        vapidPublicKey="BFN..."
      />,
    );
    const startSwitch = await screen.findByRole("switch", { name: "시작 알림" });
    fireEvent.click(startSwitch); // start=false, deadline=false → no kinds on
    await waitFor(() => expect(unsubscribeFromPush).toHaveBeenCalled());
    await waitFor(() => expect(clearMyPushSubscriptions).toHaveBeenCalled());
    await waitFor(() =>
      expect(updateNotificationPrefs).toHaveBeenCalledWith({
        start: false,
        deadline: false,
        kudos: false,
      }),
    );
  });

  it("does not call syncBrowserSubscription when turning a pref OFF", async () => {
    render(
      <PushSettings
        initialPrefs={{ start: true, deadline: true, kudos: false }}
        initialSubscribedEndpoint={null}
        vapidPublicKey="BFN..."
      />,
    );
    const startSwitch = await screen.findByRole("switch", { name: "시작 알림" });
    fireEvent.click(startSwitch); // start true → false
    await waitFor(() =>
      expect(updateNotificationPrefs).toHaveBeenCalledWith({
        start: false,
        deadline: true,
        kudos: false,
      }),
    );
    expect(syncBrowserSubscription).not.toHaveBeenCalled();
    expect(registerPushSubscription).not.toHaveBeenCalled();
  });

  // 핵심 회귀 케이스 — stale subscribed=true 상태에서 토글 OFF→ON 시, 기존 분기
  // `if (turningOn && !subscribed)` 는 ensureSubscription 호출 자체를 건너뛰어
  // server `push_subscriptions` row 가 비어있는 채로 prefs.start=true 가 박히는
  // 정합 깨짐을 만들었다. 새 분기 `if (turningOn)` + syncBrowserSubscription 의
  // idempotent reuse 가 이 우회를 차단해야 한다.
  it("syncs subscription on toggle ON even when initial subscribed state is stale", async () => {
    render(
      <PushSettings
        initialPrefs={{ start: false, deadline: true, kudos: false }}
        initialSubscribedEndpoint="https://web.push.apple.com/stale-from-server"
        vapidPublicKey="BFN..."
      />,
    );
    const startSwitch = await screen.findByRole("switch", { name: "시작 알림" });
    fireEvent.click(startSwitch); // start false → true
    await waitFor(() => expect(syncBrowserSubscription).toHaveBeenCalled());
    await waitFor(() =>
      expect(registerPushSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: "https://fcm.googleapis.com/fcm/send/x",
        }),
      ),
    );
    await waitFor(() =>
      expect(updateNotificationPrefs).toHaveBeenCalledWith({
        start: true,
        deadline: true,
        kudos: false,
      }),
    );
  });

  it("rolls back prefs without saving when sync fails", async () => {
    syncBrowserSubscription.mockRejectedValueOnce(new Error("permission_denied"));
    render(
      <PushSettings
        initialPrefs={{ start: false, deadline: false, kudos: false }}
        initialSubscribedEndpoint={null}
        vapidPublicKey="BFN..."
      />,
    );
    const startSwitch = await screen.findByRole("switch", { name: "시작 알림" });
    fireEvent.click(startSwitch);
    await waitFor(() => expect(syncBrowserSubscription).toHaveBeenCalled());
    expect(updateNotificationPrefs).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("shows the unsupported banner when browser lacks support", async () => {
    isPushSupported.mockReturnValue(false);
    render(
      <PushSettings
        initialPrefs={{ start: true, deadline: true, kudos: false }}
        initialSubscribedEndpoint={null}
        vapidPublicKey="BFN..."
      />,
    );
    expect(await screen.findByText(/이 브라우저는 푸시 알림을 지원하지 않/)).toBeTruthy();
    expect(screen.queryByRole("switch", { name: "시작 알림" })).toBeNull();
  });
});
