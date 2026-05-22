// 알림 센터(모킹업 §13) IDB 캐시 — Q7 결정 (C). POC 후 (A) Supabase 테이블 확장 가능.
// SW 가 push 수신 시 raw indexedDB 로 직접 적재 (sw 에서는 module import 불가) →
// 본 모듈과 SW 의 DB_NAME/STORE/VERSION 이 정확히 일치해야 한다.

import { openDB, type IDBPDatabase } from "idb";

export type NotificationCategory = "reminder" | "friend_action" | "penalty";
export type NotificationType =
  | "start" // 챌린지 시작 (모두 서명) — 리마인더
  | "deadline" // 마감 24h 전
  | "missed_yesterday" // 어제 미인증 (POC 후)
  | "friend_action" // 친구 인증 완료
  | "penalty_added" // 벌금 누적
  | "kudos_received"; // 내 인증글에 응원 도착 (ADR-0017)

export interface StoredNotification {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body: string;
  targetUrl: string;
  receivedAt: string; // ISO 8601
  readAt: string | null;
}

export const DB_NAME = "with-key-notifications";
export const STORE = "notifications";
export const VERSION = 1;

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "id" });
        s.createIndex("byReceivedAt", "receivedAt");
        s.createIndex("byCategory", "category");
      }
    },
  });
}

export async function listNotifications(
  category?: NotificationCategory,
): Promise<StoredNotification[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await getDb();
  const all = (await db.getAllFromIndex(STORE, "byReceivedAt")).reverse() as StoredNotification[];
  if (!category) return all;
  return all.filter((n) => n.category === category);
}

export async function markAllRead(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await getDb();
  const tx = db.transaction(STORE, "readwrite");
  const all = (await tx.store.getAll()) as StoredNotification[];
  const now = new Date().toISOString();
  for (const n of all) {
    if (!n.readAt) await tx.store.put({ ...n, readAt: now });
  }
  await tx.done;
}

export async function markRead(id: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await getDb();
  const n = (await db.get(STORE, id)) as StoredNotification | undefined;
  if (n && !n.readAt) {
    await db.put(STORE, { ...n, readAt: new Date().toISOString() });
  }
}

export async function unreadCount(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  const db = await getDb();
  const all = (await db.getAll(STORE)) as StoredNotification[];
  return all.filter((n) => !n.readAt).length;
}
