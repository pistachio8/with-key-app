"use client";

export type BrowserPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function isPushSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (typeof window === "undefined") return false;
  return "PushManager" in window;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Browser PushManager 를 진실 원천으로 사용한다. 기존 구독이 있으면 reuse(idempotent),
// 없을 때만 새 subscribe. server `push_subscriptions` row 와 매 호출 시 자연 정합화되며,
// 사용자 측 토글 OFF→ON 으로 인한 클라이언트 state staleness 를 우회 차단한다.
export async function syncBrowserSubscription(
  vapidPublicKey: string,
): Promise<BrowserPushSubscription> {
  if (!isPushSupported()) throw new Error("push_unsupported");
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("subscription_incomplete");
  }
  return {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  };
}

export async function unsubscribeFromPush(): Promise<string | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  const current = await reg.pushManager.getSubscription();
  if (!current) return null;
  await current.unsubscribe();
  return current.endpoint;
}
