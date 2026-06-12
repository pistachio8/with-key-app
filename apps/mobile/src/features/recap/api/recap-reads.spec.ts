// EVAL-0016 보존 eval — 정산(recap) read 계약 스냅샷 + 사진 그리드 signed URL 경로.
const mockGetSupabaseClient = jest.fn();

jest.mock("@/services/supabase/client", () => ({
  getSupabaseClient: (...args: unknown[]) => mockGetSupabaseClient(...args),
}));

// eslint-disable-next-line import/first -- jest.mock 은 babel 이 hoist 하므로 모킹 선언을 위에 둔다
import {
  RECAP_NOW,
  RECAP_TABLES,
  RECAP_VIEWER,
  RECAP_EXPECTED,
} from "../../../../../../evals/fixtures/read-contracts/recap";
// eslint-disable-next-line import/first
import { makeMockSupabase, type MockTables } from "@/shared/testing/mock-supabase";
// eslint-disable-next-line import/first
import { fetchChallengePhotos, fetchRecap } from "./recap-reads";

afterEach(() => {
  jest.clearAllMocks();
});

describe("read 계약 보존 스냅샷 — fetchRecap == RECAP_EXPECTED", () => {
  it("recap: web fetchRecap 과 동일 fixture·동일 EXPECTED", async () => {
    mockGetSupabaseClient.mockReturnValue(makeMockSupabase(RECAP_TABLES as MockTables));

    const view = await fetchRecap(RECAP_VIEWER, { now: new Date(RECAP_NOW) });
    expect(view).toEqual(RECAP_EXPECTED);
  });

  it("종료/만기 챌린지가 없으면 null", async () => {
    mockGetSupabaseClient.mockReturnValue(makeMockSupabase({}));
    await expect(fetchRecap(RECAP_VIEWER)).resolves.toBeNull();
  });
});

describe("fetchChallengePhotos", () => {
  it("photo_path 가 유효한 행만 viewer 토큰 signed URL 로 매핑한다", async () => {
    mockGetSupabaseClient.mockReturnValue(
      makeMockSupabase(
        {
          action_logs: [
            {
              id: "log-1",
              user_id: "u1",
              photo_path: "u1/c1/log-1-abc.jpg",
              created_at: "2026-05-01T03:00:00Z",
              users: { display_name: "민지" },
            },
            {
              // URL 형태(이상값) — looksLikePhotoPath 정책상 제외.
              id: "log-2",
              user_id: "u2",
              photo_path: "https://evil.example.com/x.jpg",
              created_at: "2026-05-02T03:00:00Z",
              users: { display_name: "제이" },
            },
          ],
        },
        { "u1/c1/log-1-abc.jpg": "https://signed.example.com/log-1" },
      ),
    );

    const photos = await fetchChallengePhotos("c1");
    expect(photos).toEqual([
      {
        id: "log-1",
        signedUrl: "https://signed.example.com/log-1",
        takenAt: "2026-05-01T03:00:00Z",
        ownerDisplayName: "민지",
        ownerId: "u1",
      },
    ]);
  });
});
