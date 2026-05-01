// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const registerPushSubscription = vi.fn();
const clearMyPushSubscriptions = vi.fn();
const updateNotificationPrefs = vi.fn();
vi.mock("@/app/(app)/settings/_actions", () => ({
  registerPushSubscription: (...a: unknown[]) => registerPushSubscription(...a),
  clearMyPushSubscriptions: (...a: unknown[]) => clearMyPushSubscriptions(...a),
  updateNotificationPrefs: (...a: unknown[]) => updateNotificationPrefs(...a),
}));

const isPushSupported = vi.fn();
const subscribeToPush = vi.fn();
const unsubscribeFromPush = vi.fn();
vi.mock("@/lib/push/subscribe", () => ({
  isPushSupported: () => isPushSupported(),
  subscribeToPush: (...a: unknown[]) => subscribeToPush(...a),
  unsubscribeFromPush: () => unsubscribeFromPush(),
}));

import { PushSettings } from "./push-settings";

beforeEach(() => {
  vi.clearAllMocks();
  isPushSupported.mockReturnValue(true);
  registerPushSubscription.mockResolvedValue({ ok: true });
  clearMyPushSubscriptions.mockResolvedValue({ ok: true });
  updateNotificationPrefs.mockResolvedValue({ ok: true });
  subscribeToPush.mockResolvedValue({
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
        initialPrefs={{ start: true, deadline: false }}
        initialSubscribedEndpoint="https://fcm.googleapis.com/fcm/send/x"
        vapidPublicKey="BFN..."
      />,
    );
    // useEffect sets supported → wait for toggles
    const startSwitch = await screen.findByRole("switch", { name: "시작 알림" });
    const deadlineSwitch = await screen.findByRole("switch", {
      name: "마감 임박 알림",
    });
    expect((startSwitch as HTMLInputElement).checked).toBe(true);
    expect((deadlineSwitch as HTMLInputElement).checked).toBe(false);
  });

  it("subscribes when first pref is turned on", async () => {
    render(
      <PushSettings
        initialPrefs={{ start: false, deadline: false }}
        initialSubscribedEndpoint={null}
        vapidPublicKey="BFN..."
      />,
    );
    const startSwitch = await screen.findByRole("switch", { name: "시작 알림" });
    fireEvent.click(startSwitch);
    await waitFor(() => expect(subscribeToPush).toHaveBeenCalled());
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
      }),
    );
  });

  it("unsubscribes when both prefs go off", async () => {
    render(
      <PushSettings
        initialPrefs={{ start: true, deadline: false }}
        initialSubscribedEndpoint="https://fcm.googleapis.com/fcm/send/x"
        vapidPublicKey="BFN..."
      />,
    );
    const startSwitch = await screen.findByRole("switch", { name: "시작 알림" });
    fireEvent.click(startSwitch); // now start=false, deadline=false → no kinds on
    await waitFor(() => expect(unsubscribeFromPush).toHaveBeenCalled());
    await waitFor(() => expect(clearMyPushSubscriptions).toHaveBeenCalled());
    await waitFor(() =>
      expect(updateNotificationPrefs).toHaveBeenCalledWith({
        start: false,
        deadline: false,
      }),
    );
  });

  it("does not re-subscribe when turning one pref OFF while the other stays ON", async () => {
    render(
      <PushSettings
        initialPrefs={{ start: true, deadline: true }}
        initialSubscribedEndpoint={null}
        vapidPublicKey="BFN..."
      />,
    );
    const startSwitch = await screen.findByRole("switch", { name: "시작 알림" });
    fireEvent.click(startSwitch); // start true → false, deadline stays true
    await waitFor(() =>
      expect(updateNotificationPrefs).toHaveBeenCalledWith({
        start: false,
        deadline: true,
      }),
    );
    expect(subscribeToPush).not.toHaveBeenCalled();
    expect(registerPushSubscription).not.toHaveBeenCalled();
  });

  it("shows the unsupported banner when browser lacks support", async () => {
    isPushSupported.mockReturnValue(false);
    render(
      <PushSettings
        initialPrefs={{ start: true, deadline: true }}
        initialSubscribedEndpoint={null}
        vapidPublicKey="BFN..."
      />,
    );
    expect(await screen.findByText(/이 브라우저는 푸시 알림을 지원하지 않/)).toBeTruthy();
    expect(screen.queryByRole("switch", { name: "시작 알림" })).toBeNull();
  });
});
