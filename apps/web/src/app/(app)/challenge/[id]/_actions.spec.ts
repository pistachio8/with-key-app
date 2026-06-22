import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

const maybeSingle = vi.fn();
const eq = vi.fn((): { maybeSingle: typeof maybeSingle } => ({ maybeSingle }));
const select = vi.fn((): { eq: typeof eq } => ({ eq }));
const from = vi.fn((): { select: typeof select } => ({ select }));
const rpcMock = vi.fn();

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
    rpc: (...args: unknown[]) => rpcMock(...args),
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

import { updateTag, revalidateTag } from "next/cache";
import { revealAccountNumber, togglePeerRejection } from "./_actions";

const VALID_GROUP = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  from.mockClear();
  select.mockClear();
  eq.mockClear();
  maybeSingle.mockReset();
  rpcMock.mockReset();
  trackCalls.length = 0;
  vi.mocked(updateTag).mockClear();
  vi.mocked(revalidateTag).mockClear();
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

// EVAL-0026 C2 — 익명 피어 반려 토글 이벤트. RPC 반환을 그대로 싣고, options.userId 를
// 넘기지 않아 events.user_id=null(반려자 비식별)임을 검증한다.
describe("togglePeerRejection — 익명 peer_reject emit", () => {
  const VALID_LOG = "33333333-3333-4333-8333-333333333333";
  const VALID_CHALLENGE = "44444444-4444-4444-8444-444444444444";
  const AUTHOR = "99999999-9999-4999-8999-999999999999";

  function stubRpc(row: { peer_reject_count: number; viewer_rejected: boolean; status: string }) {
    rpcMock.mockResolvedValueOnce({ data: [row], error: null });
    maybeSingle.mockResolvedValueOnce({
      data: { user_id: AUTHOR, challenge_id: VALID_CHALLENGE },
      error: null,
    });
  }

  it("rejects invalid actionLogId uuid (RPC 미호출)", async () => {
    const res = await togglePeerRejection({ actionLogId: "not-a-uuid" });
    expect(res.ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(trackCalls).toHaveLength(0);
  });

  it("viewer_rejected=true → action=add 로 익명 emit (options 미전달)", async () => {
    stubRpc({ peer_reject_count: 1, viewer_rejected: true, status: "passed" });

    const res = await togglePeerRejection({ actionLogId: VALID_LOG });
    expect(res.ok).toBe(true);

    expect(trackCalls).toHaveLength(1);
    const { event, options } = trackCalls[0]!;
    expect(event).toMatchObject({
      name: "peer_reject",
      props: {
        actionLogId: VALID_LOG,
        challengeId: VALID_CHALLENGE,
        rejectCount: 1,
        status: "passed",
        action: "add",
      },
    });
    // 익명: track 두 번째 인자(options) 미전달 → user_id=null.
    expect(options).toBeUndefined();
    // 본문 미로깅: props 에 사진 URL·phash 문자열 없음(id·count·status·action 만).
    expect(JSON.stringify((event as { props: unknown }).props)).not.toMatch(/photo|phash|http/i);
  });

  it("viewer_rejected=false → action=remove (과반 미달 복원)", async () => {
    stubRpc({ peer_reject_count: 0, viewer_rejected: false, status: "passed" });

    const res = await togglePeerRejection({ actionLogId: VALID_LOG });
    expect(res.ok).toBe(true);
    expect(trackCalls[0]!.event).toMatchObject({
      name: "peer_reject",
      props: { action: "remove", rejectCount: 0 },
    });
  });

  it("RPC status=peer_rejected(과반 도달) 를 raw 로 싣는다", async () => {
    stubRpc({ peer_reject_count: 3, viewer_rejected: true, status: "peer_rejected" });

    await togglePeerRejection({ actionLogId: VALID_LOG });
    expect(trackCalls[0]!.event).toMatchObject({
      name: "peer_reject",
      props: { status: "peer_rejected", action: "add" },
    });
  });

  // 과반 전이(passed↔peer_rejected)가 피드에 반영되려면 hydrate(actionlog-${id} 태그) 캐시를
  // 무효화해야 한다. 이 단언이 없으면 무효화 라인이 제거돼도 테스트가 통과한다(회귀 가드).
  it("성공 시 actionlog hydrate 캐시를 무효화한다 (과반 전이 반영)", async () => {
    stubRpc({ peer_reject_count: 3, viewer_rejected: true, status: "peer_rejected" });

    await togglePeerRejection({ actionLogId: VALID_LOG });

    expect(updateTag).toHaveBeenCalledWith(`actionlog-${VALID_LOG}`);
    expect(revalidateTag).toHaveBeenCalledWith(`actionlog-${VALID_LOG}`, "max");
  });
});
