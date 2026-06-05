import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth/with-user", () => ({
  withUser:
    <I, O>(fn: (u: { id: string }, i: I) => Promise<O>) =>
    (i: I) =>
      fn({ id: "u-viewer" }, i),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { markFeedSeen } from "./_actions";

describe("markFeedSeen", () => {
  beforeEach(() => vi.clearAllMocks());

  it("users.last_feed_seen_at 를 now() 기준으로 업데이트하고 홈 revalidate", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: () => ({ update }),
    });

    const result = await markFeedSeen();
    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    const payload = update.mock.calls[0][0] as { last_feed_seen_at: string };
    expect(typeof payload.last_feed_seen_at).toBe("string");
    expect(Number.isFinite(new Date(payload.last_feed_seen_at).getTime())).toBe(true);
    expect(eq).toHaveBeenCalledWith("id", "u-viewer");
    expect(revalidatePath).toHaveBeenCalledWith("/home");
  });

  it("DB 에러 시 failure 반환", async () => {
    const eq = vi.fn().mockResolvedValue({ error: { message: "boom", code: "XX000" } });
    const update = vi.fn().mockReturnValue({ eq });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: () => ({ update }),
    });
    const result = await markFeedSeen();
    expect(result.ok).toBe(false);
  });
});
