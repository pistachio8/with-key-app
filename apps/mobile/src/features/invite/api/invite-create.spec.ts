// RN invite 토큰 발급 단위 테스트 (EVAL-0018 · 00 §13.2 #18) — 토큰 스펙(32B base64url),
// invites INSERT payload, RLS 거부(42501) 매핑을 검증한다. 비owner INSERT 차단 자체는
// RLS invites_insert_owner(0002) 계약 — 클라이언트는 실패를 invite_failed 로 표면화한다.
const mockInsert = jest.fn();

jest.mock("@/services/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: jest.fn(() => ({ insert: (...args: unknown[]) => mockInsert(...args) })),
  }),
}));

// 테스트별 도메인 토글 — getter 로 lazy 평가해 미설정(url null) 케이스도 검증한다.
let mockUniversalLinkDomain: string | undefined = "dev.fromwith.app";

jest.mock("expo-constants", () => ({
  get expoConfig() {
    return { extra: { universalLinkDomain: mockUniversalLinkDomain } };
  },
}));

// eslint-disable-next-line import/first -- jest.mock 은 babel 이 hoist 하므로 모킹 선언을 위에 둔다
import { buildInviteShareUrl, createInvite } from "./invite-create";

const GROUP_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const USER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  mockUniversalLinkDomain = "dev.fromwith.app";
});

describe("createInvite", () => {
  it("32B base64url 토큰을 생성해 invites 에 owner INSERT 하고 공유 URL 을 돌려준다", async () => {
    mockInsert.mockResolvedValue({ error: null });

    const result = await createInvite(GROUP_ID, USER_ID);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const payload = mockInsert.mock.calls[0]![0] as {
      group_id: string;
      token: string;
      created_by: string;
    };
    expect(payload.group_id).toBe(GROUP_ID);
    expect(payload.created_by).toBe(USER_ID);
    // 32바이트 → base64url 43자, 패딩 없음 (web generateInviteToken 과 동일 스펙).
    expect(payload.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    expect(result).toEqual({
      ok: true,
      token: payload.token,
      url: `https://dev.fromwith.app/invite/${encodeURIComponent(payload.token)}`,
    });
  });

  it("토큰은 호출마다 다르다 — 고정/약한 토큰 회귀 방지", async () => {
    mockInsert.mockResolvedValue({ error: null });

    const first = await createInvite(GROUP_ID, USER_ID);
    const second = await createInvite(GROUP_ID, USER_ID);

    expect(first.ok && second.ok && first.token !== second.token).toBe(true);
  });

  it("universalLinkDomain 미설정이면 토큰은 발급하되 url 은 null 로 돌려준다", async () => {
    mockUniversalLinkDomain = undefined;
    mockInsert.mockResolvedValue({ error: null });

    expect(await createInvite(GROUP_ID, USER_ID)).toEqual({
      ok: true,
      token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      url: null,
    });
  });

  it("INSERT 실패(42501 — 비owner RLS 거부)는 invite_failed", async () => {
    mockInsert.mockResolvedValue({
      error: { code: "42501", message: "new row violates row-level security policy" },
    });

    expect(await createInvite(GROUP_ID, USER_ID)).toEqual({ ok: false, error: "invite_failed" });
  });
});

describe("buildInviteShareUrl", () => {
  it("universal link 도메인 기준 /invite/<token> URL 을 만든다", () => {
    expect(buildInviteShareUrl("tok-1")).toBe("https://dev.fromwith.app/invite/tok-1");
  });
});
