/* global self, clients, indexedDB */

// 알림 센터(모킹업 §13)용 IDB 적재 — src/lib/notifications/store.ts 와 schema 정확히 일치.
const NOTIF_DB = "with-key-notifications";
const NOTIF_STORE = "notifications";
const NOTIF_VERSION = 1;

function openNotifDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NOTIF_DB, NOTIF_VERSION);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(NOTIF_STORE)) {
        const s = db.createObjectStore(NOTIF_STORE, { keyPath: "id" });
        s.createIndex("byReceivedAt", "receivedAt");
        s.createIndex("byCategory", "category");
      }
    };
  });
}

async function storeNotification(record) {
  try {
    const db = await openNotifDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(NOTIF_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(NOTIF_STORE).put(record);
    });
  } catch {
    // IDB 적재 실패는 push 표시를 막지 않는다.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "from. with",
    body: "",
    url: "/home",
    challengeId: null,
    type: "start",
    category: "reminder",
  };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // parse 실패는 최소 정보로 표시
  }
  const targetUrl = payload.targetUrl || payload.url || "/home";
  const id =
    payload.id ||
    (self.crypto && typeof self.crypto.randomUUID === "function"
      ? self.crypto.randomUUID()
      : `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const category = payload.category || "reminder";

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: {
          id,
          url: targetUrl,
          targetUrl,
          challengeId: payload.challengeId,
          type: payload.type,
          category,
        },
      });
      await storeNotification({
        id,
        type: payload.type || "start",
        category,
        title: payload.title || "",
        body: payload.body || "",
        targetUrl,
        receivedAt: new Date().toISOString(),
        readAt: null,
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.targetUrl || data.url || "/home";
  event.waitUntil(
    (async () => {
      try {
        await fetch("/api/push/opened", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            challengeId: data.challengeId,
            type: data.type,
          }),
          keepalive: true,
        });
      } catch {
        // beacon 실패는 무시
      }
      const all = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const c of all) {
        const url = new URL(c.url);
        if (url.origin === self.location.origin) {
          try {
            await c.navigate(targetUrl);
            return c.focus();
          } catch {
            // 일부 브라우저는 navigate 권한이 없을 수 있다 — focus 만.
            return c.focus();
          }
        }
      }
      return clients.openWindow(targetUrl);
    })(),
  );
});
