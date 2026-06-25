import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AdminResponse<T = unknown> = { data: T; error: unknown };

// 스캔 대상 영상 챌린지 plan — challenges SELECT(.eq/.gte/.or) 결과.
const challengesPlan: { rows: Array<{ id: string }>; error?: unknown } = { rows: [] };

function challengesChain() {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.gte = () => chain;
  chain.or = () => chain;
  chain.then = (onFulfilled: (r: AdminResponse) => unknown) =>
    onFulfilled({ data: challengesPlan.rows, error: challengesPlan.error ?? null });
  return chain;
}

const from = vi.fn((table: string) => {
  if (table === "challenges") return challengesChain();
  throw new Error(`unexpected table: ${table}`);
});

// storage 는 triggerMontage 가 mock 되어 실제로 닿지 않음 — 안전 stub.
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({
    from,
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: "noop" }) }) },
  }),
}));

// 결정 로직(멱등·서명)은 trigger.spec 가 커버 — route 는 wiring(인증·스캔·집계)만 검증.
const triggerMontage = vi.fn();
vi.mock("@/lib/media/montage/trigger", () => ({
  triggerMontage: (...args: unknown[]) => triggerMontage(...args),
}));

import { POST, GET } from "./route";

function req(auth?: string): Request {
  const headers = new Headers();
  if (auth !== undefined) headers.set("authorization", auth);
  return new Request("https://app.example/api/cron/montage", { method: "POST", headers });
}

const ORIGINAL_SECRET = process.env.CRON_SECRET;
beforeEach(() => {
  challengesPlan.rows = [];
  challengesPlan.error = undefined;
  triggerMontage.mockReset();
  process.env.CRON_SECRET = "secret";
});
afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
});

describe("GET/POST /api/cron/montage", () => {
  it("CRON_SECRET 미설정이면 401", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req("Bearer secret"));
    expect(res.status).toBe(401);
    expect(triggerMontage).not.toHaveBeenCalled();
  });

  it("authorization 불일치면 401 (triggerMontage 미호출)", async () => {
    const res = await POST(req("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(triggerMontage).not.toHaveBeenCalled();
  });

  it("스캔된 영상 챌린지마다 triggerMontage 호출하고 triggered/skipped/failed 를 집계", async () => {
    challengesPlan.rows = [{ id: "c1" }, { id: "c2" }, { id: "c3" }];
    triggerMontage
      .mockResolvedValueOnce({ ok: true, status: "triggered" })
      .mockResolvedValueOnce({ ok: true, status: "skipped", reason: "exists" })
      .mockResolvedValueOnce({ ok: false, reason: "worker_error" });

    const res = await POST(req("Bearer secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      scanned: 3,
      triggered: 1,
      skipped: 1,
      failed: 1,
    });
    expect(triggerMontage).toHaveBeenCalledTimes(3);
  });

  it("challenges 쿼리 에러면 500", async () => {
    challengesPlan.error = { message: "boom" };
    const res = await POST(req("Bearer secret"));
    expect(res.status).toBe(500);
  });

  it("GET 은 POST 에 위임한다", async () => {
    const res = await GET(req("Bearer secret"));
    expect(res.status).toBe(200);
  });
});
