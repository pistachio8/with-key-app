// EVAL-0016 보존 eval — 그룹 상세/내 그룹 read 계약 스냅샷.
const mockGetSupabaseClient = jest.fn();

jest.mock("@/services/supabase/client", () => ({
  getSupabaseClient: (...args: unknown[]) => mockGetSupabaseClient(...args),
}));

// eslint-disable-next-line import/first -- jest.mock 은 babel 이 hoist 하므로 모킹 선언을 위에 둔다
import {
  GROUP_ID,
  GROUP_TABLES,
  GROUP_EXPECTED,
} from "../../../../../../evals/fixtures/read-contracts/group";
// eslint-disable-next-line import/first
import { makeMockSupabase, type MockTables } from "@/shared/testing/mock-supabase";
// eslint-disable-next-line import/first
import { fetchGroupDetail, fetchMyGroups } from "./group-reads";

afterEach(() => {
  jest.clearAllMocks();
});

describe("read 계약 보존 스냅샷 — fetchGroupDetail == GROUP_EXPECTED", () => {
  it("group: 멤버·챌린지 목록을 계약 shape 로 조립한다", async () => {
    mockGetSupabaseClient.mockReturnValue(makeMockSupabase(GROUP_TABLES as MockTables));

    const view = await fetchGroupDetail(GROUP_ID);
    expect(view).toEqual(GROUP_EXPECTED);
  });

  it("RLS 차단/부재 그룹은 null", async () => {
    mockGetSupabaseClient.mockReturnValue(makeMockSupabase({}));
    await expect(fetchGroupDetail("missing")).resolves.toBeNull();
  });
});

describe("fetchMyGroups", () => {
  it("활성 그룹 요약 목록을 돌려준다", async () => {
    mockGetSupabaseClient.mockReturnValue(
      makeMockSupabase({ groups: [{ id: "g1", name: "운동 그룹" }] }),
    );
    await expect(fetchMyGroups()).resolves.toEqual([{ id: "g1", name: "운동 그룹" }]);
  });
});
