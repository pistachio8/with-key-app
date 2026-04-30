import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({ from: () => ({ insert: insertMock }) }),
}));

import { track } from "./track";

describe("track", () => {
  beforeEach(() => {
    insertMock.mockReset();
    insertMock.mockResolvedValue({ error: null });
  });

  it("inserts into events with normalized payload", async () => {
    await track({
      name: "kudos_given",
      props: { emoji: "🔥", actionLogId: "11111111-1111-4111-8111-111111111111" },
    });
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith({
      name: "kudos_given",
      props: { emoji: "🔥", actionLogId: "11111111-1111-4111-8111-111111111111" },
      user_id: null,
    });
  });

  it("passes userId when provided", async () => {
    await track(
      {
        name: "ai_generated",
        props: {
          actionLogId: "11111111-1111-4111-8111-111111111111",
          latencyMs: 1500,
          fallback: false,
          keywordCoverage: 1,
          promptVersion: "v1",
        },
      },
      { userId: "22222222-2222-4222-8222-222222222222" },
    );
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "22222222-2222-4222-8222-222222222222" }),
    );
  });

  it("swallows insert errors (does not throw)", async () => {
    insertMock.mockResolvedValue({ error: { message: "boom" } });
    await expect(track({ name: "memo_fallback_opened", props: {} })).resolves.toBeUndefined();
  });

  it("swallows schema validation errors without hitting DB", async () => {
    const bad = { name: "ai_generated", props: {} } as never;
    await expect(track(bad)).resolves.toBeUndefined();
    expect(insertMock).not.toHaveBeenCalled();
  });
});
