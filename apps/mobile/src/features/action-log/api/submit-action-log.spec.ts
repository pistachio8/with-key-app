// D-7 spec scenario 3 — RN boundary eval (= AC `action-log` 본체). feed-reads.spec.ts 1:1.
// bffPostFormData mock → 공유 fixture 주입 → ① 성공봉투 parse·ok 분기 ② 실패봉투 error 매핑
// ③ 계약위반 throw. web submitActionLog 코어가 만드는 봉투와 같은 zod 계약을 통과해야만
// UI .ok 분기에 닿는다.
const mockBffPostFormData = jest.fn();

jest.mock("@/services/api/bff-client", () => ({
  bffPostFormData: (...args: unknown[]) => mockBffPostFormData(...args),
}));

// eslint-disable-next-line import/first -- jest.mock 은 babel 이 hoist 하므로 모킹 선언을 위에 둔다
import {
  SUBMIT_SUCCESS_ENVELOPE,
  SUBMIT_FAILURE_ENVELOPE,
  SUBMIT_MALFORMED_ENVELOPE,
} from "../../../../../../evals/fixtures/write-contracts/action-log";
// eslint-disable-next-line import/first
import { submitActionLog, type SubmitActionLogInput } from "./submit-action-log";

const baseInput: SubmitActionLogInput = {
  challengeId: "22222222-2222-4222-8222-222222222222",
  activityType: "gym",
  selectedKeywords: ["펌핑"],
  shownKeywords: ["펌핑", "하체데이", "스쿼트"],
  rerollCount: 0,
  photo: { uri: "file:///tmp/photo.jpg", name: "photo.jpg", type: "image/jpeg" },
};

afterEach(() => {
  jest.clearAllMocks();
});

describe("submitActionLog (BFF POST /api/action-log)", () => {
  it("성공 봉투를 zod 계약으로 parse 해 ok 분기로 돌려준다", async () => {
    mockBffPostFormData.mockResolvedValue(SUBMIT_SUCCESS_ENVELOPE);

    const res = await submitActionLog(baseInput);

    expect(res).toEqual(SUBMIT_SUCCESS_ENVELOPE);
    expect(mockBffPostFormData).toHaveBeenCalledWith("/api/action-log", expect.any(FormData));
  });

  it("실패 봉투는 error 코드를 보존한다(web client 와 동일 shape)", async () => {
    mockBffPostFormData.mockResolvedValue(SUBMIT_FAILURE_ENVELOPE);

    const res = await submitActionLog(baseInput);

    expect(res).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("계약 위반 응답(data 누락)은 throw — 깨진 데이터가 UI 에 닿지 않는다", async () => {
    mockBffPostFormData.mockResolvedValue(SUBMIT_MALFORMED_ENVELOPE);

    await expect(submitActionLog(baseInput)).rejects.toThrow();
  });

  it("사진 없이도 FormData 를 구성해 같은 endpoint 로 보낸다", async () => {
    mockBffPostFormData.mockResolvedValue(SUBMIT_SUCCESS_ENVELOPE);

    await submitActionLog({ ...baseInput, photo: null });

    expect(mockBffPostFormData).toHaveBeenCalledWith("/api/action-log", expect.any(FormData));
  });
});
