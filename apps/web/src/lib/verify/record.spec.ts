import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VerifySignals } from "./signals";

// recordVerifySignals 의 두 가드를 회귀 검증한다(EVAL-0021 리뷰 후속):
//   ① 신호 계산(sharp/exif) 실패 시 비파괴 skip — throw 안 함, UPDATE 미발행.
//   ② 정상 신호는 id + user_id AND 필터로만 UPDATE — service_role 과잉 범위 차단.
// adminClient·computeVerifySignals 를 mock 해 DB·sharp 없이 결정론 단위 테스트한다.

const updateArgs: unknown[] = [];
const eqCalls: Array<[string, unknown]> = [];
let updateError: unknown = null;

function updateChain() {
  const chain: Record<string, unknown> = {};
  chain.eq = (col: string, val: unknown) => {
    eqCalls.push([col, val]);
    return chain;
  };
  chain.then = (onFulfilled: (r: { error: unknown }) => unknown) =>
    onFulfilled({ error: updateError });
  return chain;
}

const from = vi.fn(() => ({
  update: (vals: unknown) => {
    updateArgs.push(vals);
    return updateChain();
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({ from }),
}));

vi.mock("./signals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./signals")>();
  return { ...actual, computeVerifySignals: vi.fn() };
});

import { computeVerifySignals } from "./signals";
import { recordVerifySignals } from "./record";

const cleanSignals: VerifySignals = {
  phash: "0".repeat(16),
  capturedAt: null,
  exifPresent: false,
  cameraExifPresent: false,
  screenshot: { suspected: false, reasons: [] },
  captureToSubmitMs: null,
  modelVersion: "verify-signals-phash-dct64-v1",
};

describe("recordVerifySignals", () => {
  beforeEach(() => {
    updateArgs.length = 0;
    eqCalls.length = 0;
    updateError = null;
    vi.mocked(computeVerifySignals).mockReset();
    from.mockClear();
  });

  it("신호 계산 실패(손상 이미지) 시 비파괴 skip — throw 안 하고 UPDATE 미발행", async () => {
    vi.mocked(computeVerifySignals).mockRejectedValue(
      new Error("Input buffer contains unsupported image format"),
    );

    await expect(
      recordVerifySignals({ actionLogId: "log-1", userId: "u-1", photo: Buffer.from([]) }),
    ).resolves.toBeNull();

    expect(updateArgs).toHaveLength(0);
    expect(from).not.toHaveBeenCalled();
  });

  it("정상 신호 → id 와 user_id AND 필터로 UPDATE 후 신호 반환(판정 단계 재사용)", async () => {
    vi.mocked(computeVerifySignals).mockResolvedValue(cleanSignals);

    const signals = await recordVerifySignals({
      actionLogId: "log-1",
      userId: "u-1",
      photo: Buffer.from([1]),
    });

    expect(signals).toEqual(cleanSignals);
    expect(updateArgs).toHaveLength(1);
    expect(eqCalls).toContainEqual(["id", "log-1"]);
    expect(eqCalls).toContainEqual(["user_id", "u-1"]);
  });

  it("UPDATE 에러는 호출자에게 전파(throw)", async () => {
    vi.mocked(computeVerifySignals).mockResolvedValue(cleanSignals);
    updateError = { message: "db down" };

    await expect(
      recordVerifySignals({ actionLogId: "log-1", userId: "u-1", photo: Buffer.from([1]) }),
    ).rejects.toEqual({ message: "db down" });
  });
});
