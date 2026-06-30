// 벌칙 창2 read service 계약 테스트 (spec 2026-06-29 §C2 · ADR-0036/0037).
// fetchPenaltyStatus 는 BFF(Bearer) round-trip, fetchPenaltyWaiting 은 RLS-direct 조립.
// EVAL-0065 보존 fixture 를 공유해 web↔RN 패리티를 강제한다.
const mockBffGetJson = jest.fn();
const mockGetSupabaseClient = jest.fn();

jest.mock("@/services/api/bff-client", () => {
  class BffRequestError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { bffGetJson: (...a: unknown[]) => mockBffGetJson(...a), BffRequestError };
});
jest.mock("@/services/supabase/client", () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
}));

// eslint-disable-next-line import/first
import { BffRequestError } from "@/services/api/bff-client";
// eslint-disable-next-line import/first
import { makeMockSupabase, type MockTables } from "@/shared/testing/mock-supabase";
// eslint-disable-next-line import/first
import {
  PENALTY_STATUS_EXPECTED,
  PENALTY_STATUS_CHALLENGE,
} from "../../../../../../evals/fixtures/read-contracts/penalty-status";
// eslint-disable-next-line import/first
import {
  PENALTY_WAITING_NOW,
  PENALTY_WAITING_TABLES,
  PENALTY_WAITING_VIEWER,
  PENALTY_WAITING_EXPECTED,
} from "../../../../../../evals/fixtures/read-contracts/penalty-waiting";
// eslint-disable-next-line import/first
import { fetchPenaltyStatus, fetchPenaltyWaiting } from "./penalty-reads";

beforeEach(() => jest.clearAllMocks());

describe("fetchPenaltyStatus (BFF)", () => {
  it("BFF 응답을 zod parse 해 PenaltyStatusView 반환", async () => {
    mockBffGetJson.mockResolvedValue(PENALTY_STATUS_EXPECTED);
    const view = await fetchPenaltyStatus(PENALTY_STATUS_CHALLENGE);
    expect(view).toEqual(PENALTY_STATUS_EXPECTED);
    expect(mockBffGetJson).toHaveBeenCalledWith(
      `/api/penalty-status?challengeId=${PENALTY_STATUS_CHALLENGE}`,
    );
  });

  it("404(벌칙 미션 없음/접근 불가)는 null", async () => {
    mockBffGetJson.mockRejectedValue(new BffRequestError(404, "not found"));
    expect(await fetchPenaltyStatus("c-x")).toBeNull();
  });

  it("404 외 에러는 throw", async () => {
    mockBffGetJson.mockRejectedValue(new BffRequestError(500, "boom"));
    await expect(fetchPenaltyStatus("c-x")).rejects.toBeInstanceOf(BffRequestError);
  });
});

describe("fetchPenaltyWaiting (RLS-direct, web penalty-waiting 미러)", () => {
  it("창2 open + viewer 서약 챌린지만 (== PENALTY_WAITING_EXPECTED)", async () => {
    mockGetSupabaseClient.mockReturnValue(makeMockSupabase(PENALTY_WAITING_TABLES as MockTables));
    const view = await fetchPenaltyWaiting(PENALTY_WAITING_VIEWER, {
      now: new Date(PENALTY_WAITING_NOW),
    });
    expect(view).toEqual(PENALTY_WAITING_EXPECTED);
  });
});
