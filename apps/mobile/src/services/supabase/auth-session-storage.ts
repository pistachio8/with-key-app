// Supabase Auth storage adapter — expo-secure-store 기반 chunked 저장 (ADR-0034 결정 3).
// SecureStore 는 Android 에서 항목당 2048 bytes 를 넘으면 저장이 실패할 수 있어
// 세션 JSON(JWT 포함, 수 KB) 을 청크로 분할 저장한다.
import * as SecureStore from "expo-secure-store";

// SecureStore 키 허용 문자: 영숫자 · "." · "-" · "_". supabase 기본 storageKey
// (`sb-<ref>-auth-token`) 와 청크 접미사(`.0`, `.1` …)는 모두 이 범위 안이다.
const CHUNK_SIZE = 1800;
const CHUNK_META_PREFIX = "__chunked__:";

// 백그라운드 token refresh 가 기기 잠금 중에도 동작하도록 AFTER_FIRST_UNLOCK.
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

function parseChunkCount(meta: string): number | null {
  if (!meta.startsWith(CHUNK_META_PREFIX)) return null;
  const count = Number(meta.slice(CHUNK_META_PREFIX.length));
  return Number.isInteger(count) && count > 0 ? count : null;
}

async function removeChunks(key: string, fromIndex: number): Promise<void> {
  // 청크 수를 모를 때(메타 유실/축소)는 빈 슬롯을 만날 때까지 순방향 삭제.
  for (let i = fromIndex; ; i += 1) {
    const existing = await SecureStore.getItemAsync(chunkKey(key, i), options);
    if (existing === null) return;
    await SecureStore.deleteItemAsync(chunkKey(key, i), options);
  }
}

export type AuthSessionStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export function createAuthSessionStorage(): AuthSessionStorage {
  return {
    async getItem(key) {
      const meta = await SecureStore.getItemAsync(key, options);
      if (meta === null) return null;

      const count = parseChunkCount(meta);
      if (count === null) return meta; // 비분할 소형 값 (하위 호환)

      const chunks: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const chunk = await SecureStore.getItemAsync(chunkKey(key, i), options);
        if (chunk === null) return null; // 청크 유실 = 세션 파손 → 미인증 취급
        chunks.push(chunk);
      }
      return chunks.join("");
    },

    async setItem(key, value) {
      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value, options);
        await removeChunks(key, 0); // 큰 값 → 작은 값 전환 시 잔여 청크 정리
        return;
      }

      const count = Math.ceil(value.length / CHUNK_SIZE);
      for (let i = 0; i < count; i += 1) {
        await SecureStore.setItemAsync(
          chunkKey(key, i),
          value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
          options,
        );
      }
      await SecureStore.setItemAsync(key, `${CHUNK_META_PREFIX}${count}`, options);
      await removeChunks(key, count); // 세션이 줄었을 때 이전 잔여 청크 정리
    },

    async removeItem(key) {
      await SecureStore.deleteItemAsync(key, options);
      await removeChunks(key, 0);
    },
  };
}
