import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
// 회복 불가 스캔 — running 챌린지 SELECT(.gt/.not) 결과 + 참가자 + 로그.
const runningPlan: { rows: Array<Record<string, unknown>>; error?: unknown } = { rows: [] };
const participantsPlan: { rows: Array<{ user_id: string }>; error?: unknown } = { rows: [] };
const actionLogsPlan: {
  rows: Array<{ user_id: string; created_at: string; auto_verify_status?: string | null }>;
  error?: unknown;
} = {
  rows: [],
};
const dispatchedMap: Record<string, boolean> = {};
let lastUpdatePayload: Record<string, unknown> | null = null;

function challengesChain() {
  // 한 challengesChain 인스턴스는 SELECT(deadline 스캔) 또는 UPDATE(auto-close) 중 하나.
  // .update() 호출 여부로 분기해 서로 다른 plan 을 resolve 한다.
  const chain: Record<string, unknown> = { __isUpdate: false };
  chain.select = () => chain;
  chain.update = (payload: Record<string, unknown>) => {
    chain.__isUpdate = true;
    lastUpdatePayload = payload;
    return chain;
  };
  chain.eq = () => chain;
  chain.gte = () => chain;
  chain.lte = () => chain;
  // 회복 불가 스캔 SELECT 만 .gt/.not 를 쓴다 — 이 플래그로 deadline SELECT 와 구분.
  chain.gt = () => {
    chain.__isRunningScan = true;
    return chain;
  };
  chain.not = () => {
    chain.__isRunningScan = true;
    return chain;
  };
  chain.then = (onFulfilled: (r: AdminResponse) => unknown) => {
    if (chain.__isUpdate) {
      return onFulfilled({ data: closePlan.rows, error: closePlan.error ?? null });
    }
    if (chain.__isRunningScan) {
      return onFulfilled({ data: runningPlan.rows, error: runningPlan.error ?? null });
    }
    return onFulfilled({ data: challengesPlan.rows, error: challengesPlan.error ?? null });
  };
  return chain;
}

function simpleSelectChain(plan: { rows: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.then = (onFulfilled: (r: AdminResponse) => unknown) =>
    onFulfilled({ data: plan.rows, error: plan.error ?? null });
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
  if (table === "challenge_participants") return simpleSelectChain(participantsPlan);
  if (table === "action_logs") return simpleSelectChain(actionLogsPlan);
  throw new Error(`unexpected table: ${table}`);
});

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({ from }),
}));

const dispatchDeadlineNotification = vi.fn();
const dispatchGoalUnreachableNotification = vi.fn();
const dispatchVerifyAnomalyNotification = vi.fn();
vi.mock("@/lib/push/dispatch", () => ({
  dispatchDeadlineNotification: (...args: unknown[]) => dispatchDeadlineNotification(...args),
  dispatchGoalUnreachableNotification: (...args: unknown[]) =>
    dispatchGoalUnreachableNotification(...args),
  dispatchVerifyAnomalyNotification: (...args: unknown[]) =>
    dispatchVerifyAnomalyNotification(...args),
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
  runningPlan.rows = [];
  runningPlan.error = undefined;
  participantsPlan.rows = [];
  participantsPlan.error = undefined;
  actionLogsPlan.rows = [];
  actionLogsPlan.error = undefined;
  lastUpdatePayload = null;
  for (const k of Object.keys(dispatchedMap)) delete dispatchedMap[k];
  dispatchDeadlineNotification.mockReset();
  dispatchDeadlineNotification.mockResolvedValue(undefined);
  dispatchGoalUnreachableNotification.mockReset();
  dispatchGoalUnreachableNotification.mockResolvedValue({ recipientCount: 1, quietHours: false });
  dispatchVerifyAnomalyNotification.mockReset();
  dispatchVerifyAnomalyNotification.mockResolvedValue({ recipientCount: 1, quietHours: false });
  from.mockClear();
  process.env.CRON_SECRET = "supersecret";
});

// verify_anomaly 테스트가 process.env 를 직접 읽으므로(@/lib/verify 미mock) 누수 방지 —
// VERIFY_ENFORCE 뿐 아니라 VERIFY_OPS_* 도 정리해 다른 테스트의 기본값 가정을 보호한다.
afterEach(() => {
  delete process.env.VERIFY_ENFORCE;
  delete process.env.VERIFY_OPS_FAILED_RATE;
  delete process.env.VERIFY_OPS_REJECT_RATE;
  delete process.env.VERIFY_OPS_MIN_SAMPLE;
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

  it("auto-close 시 closed_at 을 함께 set (ADR-0030)", async () => {
    closePlan.rows = [{ id: "expired-1" }];
    await POST(req("Bearer supersecret"));
    expect(lastUpdatePayload).toMatchObject({ status: "closed" });
    expect(typeof lastUpdatePayload?.closed_at).toBe("string");
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

describe("POST /api/cron/deadline-push — 회복 불가 스캔", () => {
  it("running 챌린지의 회복 불가 참가자에게 통지하고 unreachableNotified 집계", async () => {
    // 약 day3 시작(7일·주7회) → 0 인증 참가자는 shortfall 7 > 남은일 → 회복 불가.
    const startAt = new Date(Date.now() - 2 * 86_400_000).toISOString();
    runningPlan.rows = [
      { id: "c-run", goal_count: 7, duration_days: 7, penalty_amount: 3000, start_at: startAt },
    ];
    participantsPlan.rows = [{ user_id: "u1" }];
    actionLogsPlan.rows = []; // 0 인증 → 회복 불가

    const res = await POST(req("Bearer supersecret"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.unreachableNotified).toBe(1);
    expect(dispatchGoalUnreachableNotification).toHaveBeenCalledWith(
      expect.objectContaining({ challengeId: "c-run", userId: "u1", week: 1, atRiskAmount: 3000 }),
    );
  });

  it("running 챌린지가 없으면 통지 0 (기존 경로 무영향)", async () => {
    runningPlan.rows = [];
    const res = await POST(req("Bearer supersecret"));
    const body = await res.json();
    expect(body.unreachableNotified).toBe(0);
    expect(dispatchGoalUnreachableNotification).not.toHaveBeenCalled();
  });
});

describe("POST /api/cron/deadline-push — 검증 이상 신호 (verify_anomaly · AC-owner-load-3)", () => {
  // start 2일 전 → today=day3, week1. 로그 created_at=now 면 모두 현재 주차 표본.
  function anomalyChallenge(): Record<string, unknown> {
    return {
      id: "c-anom",
      goal_count: 7,
      duration_days: 7,
      penalty_amount: 3000,
      start_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      groups: { owner_id: "owner-x" },
    };
  }
  function logsWithStatus(statuses: string[]) {
    const nowIso = new Date().toISOString();
    return statuses.map((s, i) => ({
      user_id: `u${i}`,
      created_at: nowIso,
      auto_verify_status: s,
    }));
  }

  it("reject_rate 임계 초과 → reject_rate 알림 1회, failed_rate 는 shadow(enforce=false) 라 미호출", async () => {
    runningPlan.rows = [anomalyChallenge()];
    participantsPlan.rows = [
      { user_id: "u0" },
      { user_id: "u1" },
      { user_id: "u2" },
      { user_id: "u3" },
    ];
    // 표본 4건: peer_rejected 2 (0.5>0.3) · failed 2 (0.5>0.3 이나 enforce=false 라 shadow).
    actionLogsPlan.rows = logsWithStatus(["peer_rejected", "peer_rejected", "failed", "failed"]);

    const res = await POST(req("Bearer supersecret"));
    expect(res.status).toBe(200);

    expect(dispatchVerifyAnomalyNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        challengeId: "c-anom",
        ownerUserId: "owner-x",
        anomalyReason: "reject_rate",
        week: 1,
      }),
    );
    expect(dispatchVerifyAnomalyNotification).not.toHaveBeenCalledWith(
      expect.objectContaining({ anomalyReason: "failed_rate" }),
    );
  });

  it("enforce=true 면 failed_rate 도 발사 (shadow 게이트 해제)", async () => {
    process.env.VERIFY_ENFORCE = "true";
    runningPlan.rows = [anomalyChallenge()];
    participantsPlan.rows = [
      { user_id: "u0" },
      { user_id: "u1" },
      { user_id: "u2" },
      { user_id: "u3" },
    ];
    actionLogsPlan.rows = logsWithStatus(["failed", "failed", "passed", "passed"]);

    await POST(req("Bearer supersecret"));

    expect(dispatchVerifyAnomalyNotification).toHaveBeenCalledWith(
      expect.objectContaining({ anomalyReason: "failed_rate", week: 1 }),
    );
  });

  it("표본 < minSample(3) 면 임계 100% 라도 알림 없음 (노이즈 방지)", async () => {
    runningPlan.rows = [anomalyChallenge()];
    participantsPlan.rows = [{ user_id: "u0" }, { user_id: "u1" }];
    // 2건 모두 peer_rejected (rate 1.0) 지만 sample 2 < 3 → 미발사.
    actionLogsPlan.rows = logsWithStatus(["peer_rejected", "peer_rejected"]);

    await POST(req("Bearer supersecret"));

    expect(dispatchVerifyAnomalyNotification).not.toHaveBeenCalled();
  });

  it("이전 주차 peer_rejected 로그는 현재 주차 rate 분모/분자에서 제외 (주차 필터 회귀 방어)", async () => {
    // start 9일 전 → today=day10, 현재 주차=week2(14일 챌린지). weekIndexOf: 1~7=주1, 8~14=주2.
    const start = new Date(Date.now() - 9 * 86_400_000).toISOString();
    const thisWeek = new Date().toISOString(); // day10 → week2
    const lastWeek = new Date(Date.now() - 7 * 86_400_000).toISOString(); // day3 → week1
    runningPlan.rows = [
      {
        id: "c-anom",
        goal_count: 14,
        duration_days: 14,
        penalty_amount: 3000,
        start_at: start,
        groups: { owner_id: "owner-x" },
      },
    ];
    participantsPlan.rows = [{ user_id: "u0" }, { user_id: "u1" }, { user_id: "u2" }];
    actionLogsPlan.rows = [
      // 현재 주차(week2) 3건 전부 passed → reject_rate 0.
      { user_id: "u0", created_at: thisWeek, auto_verify_status: "passed" },
      { user_id: "u1", created_at: thisWeek, auto_verify_status: "passed" },
      { user_id: "u2", created_at: thisWeek, auto_verify_status: "passed" },
      // 이전 주차(week1) 3건 전부 peer_rejected — 주차 필터가 없으면 새어들어 3/6=0.5>0.3 오발사.
      { user_id: "u0", created_at: lastWeek, auto_verify_status: "peer_rejected" },
      { user_id: "u1", created_at: lastWeek, auto_verify_status: "peer_rejected" },
      { user_id: "u2", created_at: lastWeek, auto_verify_status: "peer_rejected" },
    ];

    await POST(req("Bearer supersecret"));

    // 현재 주차만 집계 → sample=3·rejected=0 → 미발사. 필터 누락 시 prior-week 가 새어 오발사 → 이 테스트가 잡는다.
    expect(dispatchVerifyAnomalyNotification).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/deadline-push", () => {
  it("delegates to POST (Vercel Cron 은 GET 으로도 호출)", async () => {
    challengesPlan.rows = [];
    const res = await GET(req("Bearer supersecret"));
    expect(res.status).toBe(200);
  });
});
