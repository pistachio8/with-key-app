// invite token stash 단위 테스트 (EVAL-0013) — 1회성(take 시 삭제) 계약과
// keystore 예외 흡수를 expo-secure-store in-memory 모킹으로 검증한다.
const mockStore = new Map<string, string>();
const mockGetItemAsync = jest.fn(async (key: string) => mockStore.get(key) ?? null);

jest.mock("expo-secure-store", () => ({
  getItemAsync: (key: string) => mockGetItemAsync(key),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

// eslint-disable-next-line import/first -- jest.mock 은 babel 이 hoist 하므로 모킹 선언을 위에 둔다
import { stashPendingInviteToken, takePendingInviteToken } from "./invite-token-stash";

describe("invite token stash", () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
    mockGetItemAsync.mockImplementation(async (key: string) => mockStore.get(key) ?? null);
  });

  it("stash 한 token 을 take 가 그대로 돌려준다", async () => {
    await stashPendingInviteToken("invite-token-abc");
    expect(await takePendingInviteToken()).toBe("invite-token-abc");
  });

  it("take 는 1회성 — 두 번째 호출은 null (실패 token 재시도 루프 방지)", async () => {
    await stashPendingInviteToken("invite-token-abc");
    await takePendingInviteToken();
    expect(await takePendingInviteToken()).toBeNull();
  });

  it("보관된 token 이 없으면 null", async () => {
    expect(await takePendingInviteToken()).toBeNull();
  });

  it("keystore 읽기 예외는 null 로 흡수한다 (백업 복원 등)", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockGetItemAsync.mockRejectedValueOnce(new Error("keystore invalidated"));

    expect(await takePendingInviteToken()).toBeNull();

    warnSpy.mockRestore();
  });
});
