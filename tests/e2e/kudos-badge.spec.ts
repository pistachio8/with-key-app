import { test, expect } from "./fixtures";

// plan 2026-05-22-header-unread-dot-source — 헤더 dot 소스를 IDB unread 로 이전.
// 옛 spec 은 `last_feed_seen_at` (서버 측 Kudos 미읽음) 갱신으로 dot 클리어를 검증했으나
// 새 구현에서 dot 은 항상 DOM 에 있고 `opacity-0/100` 으로 토글되며 IDB unreadCount 만 본다.
// 따라서 본 spec 은 IDB 에 직접 미읽음 알림을 시드해 dot 노출, 비우면 사라짐을 검증.

test("header dot: IDB unread 시 노출, 비우면 opacity-0 (markAllRead 시뮬)", async ({ page }) => {
  await page.goto("/home");

  // 초기: IDB 비어있음 → dot opacity-0 (visibility false 와 동치 — 시각적으로 안 보임).
  const dot = page.getByTestId("header-unread-dot");
  await expect(dot).toBeAttached();
  await expect(dot).toHaveClass(/opacity-0/);

  // IDB 에 미읽음 알림 1건 시드.
  await page.evaluate(async () => {
    const DB = "with-key-notifications";
    const STORE = "notifications";
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => {
        const upgrade = req.result;
        if (!upgrade.objectStoreNames.contains(STORE)) {
          const s = upgrade.createObjectStore(STORE, { keyPath: "id" });
          s.createIndex("byReceivedAt", "receivedAt");
          s.createIndex("byCategory", "category");
        }
      };
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put({
        id: `e2e-${Date.now()}`,
        type: "kudos_received",
        category: "friend_action",
        title: "응원이 도착했어요",
        body: "테스터님이 👍을 보냈어요",
        targetUrl: "/notifications",
        receivedAt: new Date().toISOString(),
        readAt: null,
      });
    });
  });

  // 페이지 새로고침 → NotificationBell 마운트 시 unreadCount() 호출 → dot 노출.
  await page.reload();
  await expect(page.getByTestId("header-unread-dot")).toHaveClass(/opacity-100/);

  // IDB 비움 (markAllRead 시뮬).
  await page.evaluate(async () => {
    const DB = "with-key-notifications";
    const STORE = "notifications";
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).clear();
    });
  });

  // /notifications 진입 (pathname 변경) → NotificationBell refresh → dot 다시 opacity-0.
  await page.goto("/notifications");
  await page.goto("/home");
  await expect(page.getByTestId("header-unread-dot")).toHaveClass(/opacity-0/);
});
