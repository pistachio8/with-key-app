/* global self, clients */

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
  };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // parse 실패는 최소 정보로 표시
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: {
        url: payload.url,
        challengeId: payload.challengeId,
        type: payload.type,
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
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
        // beacon 실패는 무시 — 알림 열기 자체는 성공시킨다
      }
      const url = data.url || "/home";
      const all = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const c of all) {
        if (c.url.includes(url)) return c.focus();
      }
      return clients.openWindow(url);
    })(),
  );
});
