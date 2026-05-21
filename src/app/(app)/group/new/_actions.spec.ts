import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
const usersMaybeSingle = vi.fn();
const ownerGroupsSelect = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: { id: "11111111-1111-1111-1111-111111111111", email: "u@test.local" },
        },
        error: null,
      }),
    },
    rpc: (name: string, args: unknown) => rpc(name, args),
    from: (table: string) => {
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: usersMaybeSingle }),
          }),
        };
      }
      if (table === "groups") {
        return {
          select: () => ({
            eq: () => ({ is: () => ownerGroupsSelect() }),
          }),
        };
      }
      throw new Error(`unexpected from(${table})`);
    },
  }),
}));

const trackCalls: Array<{ event: unknown; options: unknown }> = [];
vi.mock("@/lib/analytics/track", () => ({
  track: async (event: unknown, options: unknown) => {
    trackCalls.push({ event, options });
  },
}));

// Deterministic cipher stub so the test asserts against a known bytea string.
vi.mock("@/lib/crypto/account-cipher", () => ({
  encryptAccountNumber: (plain: string) => {
    // 12B iv + 'CIPHER:' + plain + 16B tag — length probably wrong but serialization
    // (Buffer → hex) is what we assert. Produces varied plaintext-dependent output.
    const tag = Buffer.alloc(16, 0xaa);
    const iv = Buffer.alloc(12, 0xbb);
    return Buffer.concat([iv, Buffer.from(`CIPHER:${plain}`), tag]);
  },
}));

import { createGroup } from "./_actions";

const VALID = {
  bankCode: "088",
  accountHolder: "홍길동",
  accountNumber: "11012345678",
} as const;

beforeEach(() => {
  rpc.mockReset();
  usersMaybeSingle.mockReset();
  ownerGroupsSelect.mockReset();
  trackCalls.length = 0;
});

describe("createGroup", () => {
  it("rejects name over 30 chars without hitting Supabase", async () => {
    const res = await createGroup({ name: "x".repeat(31) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_input");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects partial account triple (only 1 of 3)", async () => {
    const res = await createGroup({
      name: "민지네",
      accountNumber: VALID.accountNumber,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_input");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects non-digit account number", async () => {
    const res = await createGroup({
      name: "민지네",
      bankCode: VALID.bankCode,
      accountHolder: VALID.accountHolder,
      accountNumber: "1101-2345-678",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_input");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls RPC with null account fields when triple absent; hasAccount=false", async () => {
    const groupId = "22222222-2222-4222-8222-222222222222";
    rpc.mockResolvedValueOnce({ data: groupId, error: null });

    const res = await createGroup({ name: "민지네" });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.id).toBe(groupId);
    expect(rpc).toHaveBeenCalledWith("create_group_with_owner", {
      p_name: "민지네",
      p_bank_code: null,
      p_account_holder: null,
      p_account_number_encrypted: null,
      p_account_number_last4: null,
    });
    const ev = trackCalls[0]!.event as { props: { hasAccount: boolean } };
    expect(ev.props.hasAccount).toBe(false);
  });

  it("name 생략 + owner default 그룹 0개 → 기본 이름으로 RPC 호출", async () => {
    const groupId = "44444444-4444-4444-8444-444444444444";
    usersMaybeSingle.mockResolvedValueOnce({ data: { display_name: "민지" }, error: null });
    ownerGroupsSelect.mockResolvedValueOnce({ data: [], error: null });
    rpc.mockResolvedValueOnce({ data: groupId, error: null });

    const res = await createGroup({});

    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      "create_group_with_owner",
      expect.objectContaining({ p_name: "민지님과 친구들" }),
    );
  });

  it("name 생략 + owner default 그룹 1개 → #2 suffix를 붙인다", async () => {
    usersMaybeSingle.mockResolvedValueOnce({ data: { display_name: "민지" }, error: null });
    ownerGroupsSelect.mockResolvedValueOnce({
      data: [{ name: "민지님과 친구들" }],
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: "55555555-5555-4555-8555-555555555555", error: null });

    const res = await createGroup({ name: "   " });

    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      "create_group_with_owner",
      expect.objectContaining({ p_name: "민지님과 친구들 #2" }),
    );
  });

  it("name 생략 + owner default 그룹 2개 → #3 suffix를 붙인다", async () => {
    usersMaybeSingle.mockResolvedValueOnce({ data: { display_name: "민지" }, error: null });
    ownerGroupsSelect.mockResolvedValueOnce({
      data: [{ name: "민지님과 친구들" }, { name: "민지님과 친구들 #2" }],
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: "66666666-6666-4666-8666-666666666666", error: null });

    const res = await createGroup({});

    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      "create_group_with_owner",
      expect.objectContaining({ p_name: "민지님과 친구들 #3" }),
    );
  });

  it("encrypts accountNumber and sends bytea + last4 to RPC; hasAccount=true", async () => {
    const groupId = "33333333-3333-4333-8333-333333333333";
    rpc.mockResolvedValueOnce({ data: groupId, error: null });

    const res = await createGroup({ name: "민지네", ...VALID });
    expect(res.ok).toBe(true);

    const call = rpc.mock.calls[0]!;
    expect(call[0]).toBe("create_group_with_owner");
    const args = call[1] as {
      p_name: string;
      p_bank_code: string | null;
      p_account_holder: string | null;
      p_account_number_encrypted: string | null;
      p_account_number_last4: string | null;
    };
    expect(args.p_bank_code).toBe(VALID.bankCode);
    expect(args.p_account_holder).toBe(VALID.accountHolder);
    expect(args.p_account_number_last4).toBe("5678");
    // bytea must be serialized as Postgres \x hex string.
    expect(args.p_account_number_encrypted).toMatch(/^\\x[0-9a-f]+$/i);
    // Plaintext 11012345678 must NOT appear in the RPC args at all.
    expect(JSON.stringify(args)).not.toContain(VALID.accountNumber);

    const ev = trackCalls[0]!.event as { props: { hasAccount: boolean; groupId: string } };
    expect(ev.props.hasAccount).toBe(true);
    expect(ev.props.groupId).toBe(groupId);
  });

  it("maps RPC 42501 to forbidden", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "auth required" } });
    const res = await createGroup({ name: "민지네" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("forbidden");
  });

  it("maps unknown RPC error to upstream_error", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom" } });
    const res = await createGroup({ name: "민지네" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("upstream_error");
  });
});
