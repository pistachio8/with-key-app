import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { withUser } from "./with-user";
import { createClient } from "@/lib/supabase/server";

describe("withUser", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it("returns unauthorized when no session", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never);

    const action = withUser(async (_user, input: { x: number }) => ({
      ok: true as const,
      data: input,
    }));
    const res = await action({ x: 1 });

    expect(res).toEqual({ ok: false, error: "unauthorized" });
  });

  it("passes authed user to the wrapped handler", async () => {
    const user = { id: "u-1", email: "a@b.c" };
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    } as never);

    const handler = vi.fn(async (u: { id: string }, input: { x: number }) => ({
      ok: true as const,
      data: { user: u.id, x: input.x },
    }));
    const action = withUser(handler);
    const res = await action({ x: 2 });

    expect(handler).toHaveBeenCalledWith({ id: "u-1", email: "a@b.c" }, { x: 2 });
    expect(res).toEqual({ ok: true, data: { user: "u-1", x: 2 } });
  });
});
