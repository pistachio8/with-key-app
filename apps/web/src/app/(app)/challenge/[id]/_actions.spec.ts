import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const maybeSingle = vi.fn();
const eq = vi.fn((): { maybeSingle: typeof maybeSingle } => ({ maybeSingle }));
const select = vi.fn((): { eq: typeof eq } => ({ eq }));
const from = vi.fn((): { select: typeof select } => ({ select }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({
        data: {
          claims: { sub: "11111111-1111-1111-1111-111111111111", email: "u@test.local" },
        },
        error: null,
      }),
    },
    from: () => from(),
  }),
}));

const trackCalls: Array<{ event: unknown; options: unknown }> = [];
vi.mock("@/lib/analytics/track", () => ({
  track: async (event: unknown, options: unknown) => {
    trackCalls.push({ event, options });
  },
}));

vi.mock("@/lib/crypto/account-cipher", () => ({
  decryptAccountNumber: (buf: Buffer) => {
    // Simulate decrypt: strip our test marker.
    const s = buf.toString("utf8");
    if (s.startsWith("ENC:")) return s.slice(4);
    throw new Error("decryption failed");
  },
}));

import { revealAccountNumber } from "./_actions";

const VALID_GROUP = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  from.mockClear();
  select.mockClear();
  eq.mockClear();
  maybeSingle.mockReset();
  trackCalls.length = 0;
});

describe("revealAccountNumber", () => {
  it("rejects invalid groupId uuid", async () => {
    const res = await revealAccountNumber({ groupId: "not-a-uuid" });
    expect(res.ok).toBe(false);
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it("returns not_found when RLS filters the row out (non-member)", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await revealAccountNumber({ groupId: VALID_GROUP });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("not_found");
    expect(trackCalls).toHaveLength(0);
  });

  it("returns not_found when account column is null (no account registered)", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { account_number_encrypted: null },
      error: null,
    });
    const res = await revealAccountNumber({ groupId: VALID_GROUP });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("not_found");
  });

  it("decrypts and returns plaintext; tracks account_copied", async () => {
    // Supabase returns bytea as hex string '\x...' by default. Mock the same.
    const plain = "11012345678";
    const bytea = "\\x" + Buffer.from(`ENC:${plain}`, "utf8").toString("hex");
    maybeSingle.mockResolvedValueOnce({
      data: { account_number_encrypted: bytea },
      error: null,
    });

    const res = await revealAccountNumber({ groupId: VALID_GROUP });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.accountNumber).toBe(plain);
    expect(trackCalls).toHaveLength(1);
    const ev = trackCalls[0]!.event as { name: string; props: { groupId: string } };
    expect(ev.name).toBe("account_copied");
    expect(ev.props.groupId).toBe(VALID_GROUP);
    // Plaintext must not be in analytics props.
    expect(JSON.stringify(ev.props)).not.toContain(plain);
  });

  it("maps decryption failure to upstream_error (no plaintext leak)", async () => {
    // cipher marker mismatch → decrypt stub throws.
    const bytea = "\\x" + Buffer.from("BAD:xxxx", "utf8").toString("hex");
    maybeSingle.mockResolvedValueOnce({
      data: { account_number_encrypted: bytea },
      error: null,
    });
    const res = await revealAccountNumber({ groupId: VALID_GROUP });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("upstream_error");
  });
});
