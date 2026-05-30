import { beforeEach, describe, expect, it, vi } from "vitest";

type AdminResponse<T = unknown> = { data: T; error: unknown };

// -----------------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------------

const challengesPlan: { rows: Array<{ id: string }>; error?: unknown } = {
  rows: [],
};
// ADR-0027 — auto-close UPDATE 경로의 결과(닫힌 행).
const closePlan: { rows: Array<{ id: string }>; error?: unknown } = {
  rows: [],
};
const dispatchedMap: Record<string, boolean> = {};

function challengesChain() {
  // 한 challengesChain 인스턴스는 SELECT(deadline 스캔) 또는 UPDATE(auto-close) 중 하나.
  // .update() 호출 여부로 분기해 서로 다른 plan 을 resolve 한다.
  const chain: Record<string, unknown> = { __isUpdate: false };
  chain.select = () => chain;
  chain.update = () => {
    chain.__isUpdate = true;
    return chain;
  };
  chain.eq = () => chain;
  chain.gte = () => chain;
  chain.lte = () => chain;
  chain.then = (onFulfilled: (r: AdminResponse) => unknown) => {
    if (chain.__isUpdate) {
      return onFulfilled({ data: closePlan.rows, error: closePlan.error ?? null });
    }
    return onFulfilled({ data: challengesPlan.rows, error: challengesPlan.error ?? null });
  };
  return chain;
}

function eventsChain() {
  // events 조회는 "이 challenge 에 대해 이미 deadline notification 이 기록됐는가?"
  // dispatchedMap 기반으로 답한다.
  const chain: Record<string, unknown> = { __challengeId: null as string | null };
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.contains = (_col: string, value: { challengeId?: string }) => {
    chain.__challengeId = value?.challengeId ?? null;
    return chain;
  };
  chain.limit = () => chain;
  chain.then = (onFulfilled: (r: AdminResponse) => unknown) => {
    const id = chain.__challengeId as string | null;
    const rows = id && dispatchedMap[id] ? [{ id: "ev" }] : [];
    return onFulfilled({ data: rows, error: null });
  };
  return chain;
}

const from = vi.fn((table: string) => {
  if (table === "challenges") return challengesChain();
  if (table === "events") return eventsChain();
  throw new Error(`unexpected table: ${table}`);
});

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({ from }),
}));

const dispatchDeadlineNotification = vi.fn();
vi.mock("@/lib/push/dispatch", () => ({
  dispatchDeadlineNotification: (...args: unknown[]) => dispatchDeadlineNotification(...args),
}));

import { POST, GET } from "./route";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function req(auth?: string): Request {
  const headers = new Headers();
  if (auth !== undefined) headers.set("authorization", auth);
  return new Request("https://app.example/api/cron/deadline-push", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  challengesPlan.rows = [];
  challengesPlan.error = undefined;
  closePlan.rows = [];
  closePlan.error = undefined;
  for (const k of Object.keys(dispatchedMap)) delete dispatchedMap[k];
  dispatchDeadlineNotification.mockReset();
  dispatchDeadlineNotification.mockResolvedValue(undefined);
  from.mockClear();
  process.env.CRON_SECRET = "supersecret";
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("POST /api/cron/deadline-push — auth", () => {
  it("rejects without an Authorization header", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(dispatchDeadlineNotification).not.toHaveBeenCalled();
  });

  it("rejects when the Bearer secret does not match", async () => {
    const res = await POST(req("Bearer nope"));
    expect(res.status).toBe(401);
    expect(dispatchDeadlineNotification).not.toHaveBeenCalled();
  });

  it("rejects when CRON_SECRET is unset on the server", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req("Bearer anything"));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/cron/deadline-push — dispatch", () => {
  it("returns dispatched=0 when no challenges match the window", async () => {
    challengesPlan.rows = [];
    const res = await POST(req("Bearer supersecret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, scanned: 0, dispatched: 0 });
  });

  it("dispatches once per eligible challenge and skips ones already dispatched", async () => {
    challengesPlan.rows = [{ id: "c-already" }, { id: "c-fresh" }];
    dispatchedMap["c-already"] = true;

    const res = await POST(req("Bearer supersecret"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, scanned: 2, dispatched: 1 });
    expect(dispatchDeadlineNotification).toHaveBeenCalledTimes(1);
    expect(dispatchDeadlineNotification).toHaveBeenCalledWith("c-fresh");
  });

  it("returns 500 when the challenges query errors", async () => {
    challengesPlan.error = { code: "XX000", message: "db down" };
    const res = await POST(req("Bearer supersecret"));
    expect(res.status).toBe(500);
  });
});

describe("POST /api/cron/deadline-push — auto-close (ADR-0027)", () => {
  it("closes expired active challenges and reports the closed count", async () => {
    challengesPlan.rows = []; // 마감 push 대상 없음
    closePlan.rows = [{ id: "expired-1" }, { id: "expired-2" }];

    const res = await POST(req("Bearer supersecret"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, closed: 2 });
  });

  it("reports closed=0 when nothing is expired", async () => {
    closePlan.rows = [];
    const res = await POST(req("Bearer supersecret"));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, closed: 0 });
  });

  it("does not fail the cron when auto-close errors — closed=0, still 200", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    closePlan.error = { code: "XX000", message: "update blocked" };

    const res = await POST(req("Bearer supersecret"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, closed: 0 });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("GET /api/cron/deadline-push", () => {
  it("delegates to POST (Vercel Cron 은 GET 으로도 호출)", async () => {
    challengesPlan.rows = [];
    const res = await GET(req("Bearer supersecret"));
    expect(res.status).toBe(200);
  });
});
