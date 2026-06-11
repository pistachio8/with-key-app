// Supabase Auth storage adapter — expo-secure-store 기반 chunked 저장 (ADR-0034 결정 3).
// SecureStore 는 Android 에서 항목당 2048 bytes 를 넘으면 저장이 실패할 수 있어
// 세션 JSON(JWT 포함, 수 KB) 을 청크로 분할 저장한다.
//
// 알려진 한계(PoC 수용): 청크 쓰기 도중 프로세스가 죽으면 신·구 청크가 섞인
// torn-state 가 남을 수 있다 — getItem 의 JSON 파싱 실패는 auth-js 가 미인증으로
// 흡수하며, 완전한 원자성(세대 키 스왑)은 실측 문제 발생 시 후속으로 도입한다.
import * as SecureStore from "expo-secure-store";

// SecureStore 키 허용 문자: 영숫자 · "." · "-" · "_". supabase 기본 storageKey
// (`sb-<ref>-auth-token`) 와 청크 접미사(`.0`, `.1` …)는 모두 이 범위 안이다.
// 제한은 "바이트" 기준이라 분할도 UTF-8 바이트 예산으로 계산한다(한글 3B·이모지 4B).
const CHUNK_MAX_BYTES = 1800;
const CHUNK_META_PREFIX = "__chunked__:";

// 백그라운드 token refresh 가 기기 잠금 중에도 동작하도록 AFTER_FIRST_UNLOCK.
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

function utf8ByteLength(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

// code point 단위로 잘라 surrogate pair(이모지)가 청크 경계에서 쪼개지지 않게 한다 —
// lone surrogate 는 native UTF-8 인코딩에서 치환되어 복원값이 원본과 달라질 수 있다.
function splitIntoChunks(value: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;

  for (const char of value) {
    const charBytes = utf8ByteLength(char.codePointAt(0) ?? 0);
    if (currentBytes + charBytes > maxBytes && current.length > 0) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += charBytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
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

async function readValue(key: string): Promise<string | null> {
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
}

export type AuthSessionStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export function createAuthSessionStorage(): AuthSessionStorage {
  return {
    async getItem(key) {
      // Android keystore 무효화(백업 복원 등)는 getItemAsync throw 로 나타난다.
      // auth-js 가 reject 를 안 감싸므로 여기서 미인증(null) 으로 흡수해
      // 부팅이 영구 로딩에 갇히지 않게 한다. 깨진 항목은 best-effort 정리.
      try {
        return await readValue(key);
      } catch (error) {
        console.warn(
          "[auth-storage] getItem failed — treating as signed out:",
          error instanceof Error ? error.message : String(error),
        );
        await this.removeItem(key).catch(() => undefined);
        return null;
      }
    },

    async setItem(key, value) {
      const chunks = splitIntoChunks(value, CHUNK_MAX_BYTES);

      if (chunks.length <= 1) {
        await SecureStore.setItemAsync(key, value, options);
        await removeChunks(key, 0); // 큰 값 → 작은 값 전환 시 잔여 청크 정리
        return;
      }

      for (let i = 0; i < chunks.length; i += 1) {
        await SecureStore.setItemAsync(chunkKey(key, i), chunks[i], options);
      }
      await SecureStore.setItemAsync(key, `${CHUNK_META_PREFIX}${chunks.length}`, options);
      await removeChunks(key, chunks.length); // 세션이 줄었을 때 이전 잔여 청크 정리
    },

    async removeItem(key) {
      await SecureStore.deleteItemAsync(key, options);
      await removeChunks(key, 0);
    },
  };
}
