// EVAL-0016 보존 eval — 피드 BFF 계약: 응답이 feedResponseSchema(zod)를 통과해야만
// 화면에 도달한다. web fetchChallengeFeed 가 만드는 shape(fixture)와 동일 계약.
const mockBffGetJson = jest.fn();

jest.mock("@/services/api/bff-client", () => ({
  bffGetJson: (...args: unknown[]) => mockBffGetJson(...args),
}));

// eslint-disable-next-line import/first -- jest.mock 은 babel 이 hoist 하므로 모킹 선언을 위에 둔다
import {
  FEED_CHALLENGE_ID,
  FEED_RESPONSE,
} from "../../../../../../evals/fixtures/read-contracts/feed";
// eslint-disable-next-line import/first
import { fetchChallengeFeed } from "./feed-reads";

afterEach(() => {
  jest.clearAllMocks();
});

describe("fetchChallengeFeed (BFF GET /api/feed)", () => {
  it("web FeedItemView fixture 를 zod 계약으로 parse 해 그대로 돌려준다", async () => {
    mockBffGetJson.mockResolvedValue(FEED_RESPONSE);

    const items = await fetchChallengeFeed(FEED_CHALLENGE_ID);
    expect(items).toEqual(FEED_RESPONSE);
    expect(mockBffGetJson).toHaveBeenCalledWith(`/api/feed?challengeId=${FEED_CHALLENGE_ID}`);
  });

  it("challengeId 는 URL 인코딩된다", async () => {
    mockBffGetJson.mockResolvedValue([]);
    await fetchChallengeFeed("a b");
    expect(mockBffGetJson).toHaveBeenCalledWith("/api/feed?challengeId=a%20b");
  });

  it("계약 위반 응답(필드 누락)은 throw — 깨진 데이터가 화면에 닿지 않는다", async () => {
    mockBffGetJson.mockResolvedValue([{ id: "log-1" }]);
    await expect(fetchChallengeFeed(FEED_CHALLENGE_ID)).rejects.toThrow();
  });
});
