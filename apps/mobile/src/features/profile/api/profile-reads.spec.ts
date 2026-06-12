// EVAL-0016 — 프로필(me) read service: RLS self-row read + prefs 폴백 정책(OFF) 검증.
const mockGetSupabaseClient = jest.fn();

jest.mock("@/services/supabase/client", () => ({
  getSupabaseClient: (...args: unknown[]) => mockGetSupabaseClient(...args),
}));

// eslint-disable-next-line import/first -- jest.mock 은 babel 이 hoist 하므로 모킹 선언을 위에 둔다
import { makeMockSupabase, type MockTables } from "@/shared/testing/mock-supabase";
// eslint-disable-next-line import/first
import {
  fetchMyDisplayName,
  fetchNotificationPrefs,
  hasEverCreatedChallenge,
} from "./profile-reads";

afterEach(() => {
  jest.clearAllMocks();
});

describe("fetchMyDisplayName", () => {
  it("users self-row 의 display_name 을 돌려준다", async () => {
    mockGetSupabaseClient.mockReturnValue(makeMockSupabase({ users: [{ display_name: "민지" }] }));
    await expect(fetchMyDisplayName("u1")).resolves.toBe("민지");
  });

  it("row 없음 → null", async () => {
    mockGetSupabaseClient.mockReturnValue(makeMockSupabase({}));
    await expect(fetchMyDisplayName("u1")).resolves.toBeNull();
  });
});

describe("fetchNotificationPrefs", () => {
  it("prefs 를 zod 계약(notificationPrefsSchema)으로 검증해 돌려준다", async () => {
    mockGetSupabaseClient.mockReturnValue(
      makeMockSupabase({
        users: [{ notification_prefs: { start: true, deadline: false, kudos: true } }],
      }),
    );
    await expect(fetchNotificationPrefs("u1")).resolves.toEqual({
      start: true,
      deadline: false,
      kudos: true,
    });
  });

  it("parse 실패는 전부 OFF 폴백 (web 과 동일 정책)", async () => {
    mockGetSupabaseClient.mockReturnValue(
      makeMockSupabase({ users: [{ notification_prefs: { bogus: 1 } }] }),
    );
    await expect(fetchNotificationPrefs("u1")).resolves.toEqual({
      start: false,
      deadline: false,
      kudos: false,
    });
  });
});

describe("hasEverCreatedChallenge", () => {
  it("owner 그룹에 챌린지가 있으면 true", async () => {
    mockGetSupabaseClient.mockReturnValue(
      makeMockSupabase({
        groups: [{ id: "g1" }],
        challenges: [{ id: "c1" }],
      } as MockTables),
    );
    await expect(hasEverCreatedChallenge("u1")).resolves.toBe(true);
  });

  it("owner 그룹이 없으면 false", async () => {
    mockGetSupabaseClient.mockReturnValue(makeMockSupabase({}));
    await expect(hasEverCreatedChallenge("u1")).resolves.toBe(false);
  });
});
