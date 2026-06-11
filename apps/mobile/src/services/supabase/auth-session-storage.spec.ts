// chunked SecureStore adapter 단위 테스트 (ADR-0034 결정 3).
// expo-secure-store 를 in-memory map 으로 모킹해 분할/복원/삭제 계약을 검증한다.
const mockStore = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK: "AFTER_FIRST_UNLOCK",
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

// eslint-disable-next-line import/first -- jest.mock 은 babel 이 hoist 하므로 모킹 선언을 위에 둔다
import { createAuthSessionStorage } from "./auth-session-storage";

const KEY = "sb-test-auth-token";

describe("createAuthSessionStorage", () => {
  beforeEach(() => {
    mockStore.clear();
  });

  it("작은 값은 단일 항목으로 저장하고 그대로 복원한다", async () => {
    const storage = createAuthSessionStorage();
    await storage.setItem(KEY, "small-session");

    expect(mockStore.get(KEY)).toBe("small-session");
    expect(await storage.getItem(KEY)).toBe("small-session");
  });

  it("없는 키는 null 을 돌려준다", async () => {
    const storage = createAuthSessionStorage();
    expect(await storage.getItem(KEY)).toBeNull();
  });

  it("2KB 초과 값은 청크로 분할 저장하고 원본을 복원한다", async () => {
    const storage = createAuthSessionStorage();
    const value = "x".repeat(5000); // SecureStore 2048 bytes 제한 초과 시나리오

    await storage.setItem(KEY, value);

    expect(mockStore.get(KEY)).toBe("__chunked__:3");
    expect(mockStore.get(`${KEY}.0`)).toHaveLength(1800);
    expect(mockStore.get(`${KEY}.2`)).toHaveLength(5000 - 1800 * 2);
    expect(await storage.getItem(KEY)).toBe(value);
  });

  it("세션이 줄어들면 잔여 청크를 정리한다", async () => {
    const storage = createAuthSessionStorage();
    await storage.setItem(KEY, "y".repeat(5400)); // 3 청크
    await storage.setItem(KEY, "z".repeat(2000)); // 2 청크

    expect(mockStore.get(KEY)).toBe("__chunked__:2");
    expect(mockStore.has(`${KEY}.2`)).toBe(false);
    expect(await storage.getItem(KEY)).toBe("z".repeat(2000));
  });

  it("청크 → 소형 값 전환 시 모든 청크를 정리한다", async () => {
    const storage = createAuthSessionStorage();
    await storage.setItem(KEY, "y".repeat(4000));
    await storage.setItem(KEY, "tiny");

    expect(mockStore.get(KEY)).toBe("tiny");
    expect(mockStore.has(`${KEY}.0`)).toBe(false);
    expect(mockStore.has(`${KEY}.1`)).toBe(false);
  });

  it("청크가 유실되면 null (미인증) 으로 취급한다", async () => {
    const storage = createAuthSessionStorage();
    await storage.setItem(KEY, "y".repeat(4000));
    mockStore.delete(`${KEY}.1`);

    expect(await storage.getItem(KEY)).toBeNull();
  });

  it("removeItem 은 메타와 청크 전부를 삭제한다 (logout AC)", async () => {
    const storage = createAuthSessionStorage();
    await storage.setItem(KEY, "y".repeat(5400));

    await storage.removeItem(KEY);

    expect(mockStore.size).toBe(0);
  });
});
