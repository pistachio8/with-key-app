import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildMontageRequest, montageOutputPath } from "./types";
import { signMontageRequest, triggerMontage, type TriggerDeps } from "./trigger";

const CHALLENGE = "11111111-1111-1111-1111-111111111111";
const SECRET = "test-montage-secret";
const WORKER = "https://montage.example.com/encode";

function okResponse(): Response {
  return { ok: true, status: 200 } as Response;
}

// 기본 deps — 각 테스트가 필요한 부분만 override.
function deps(over: Partial<TriggerDeps> = {}): TriggerDeps {
  return {
    workerUrl: WORKER,
    workerSecret: SECRET,
    montageExists: async () => false,
    listClipPaths: async () => [`u/${CHALLENGE}/log-abc.mp4`],
    fetchImpl: vi.fn(async () => okResponse()),
    ...over,
  };
}

describe("montage path/shape", () => {
  it("montageOutputPath = {challengeId}/montage.mp4", () => {
    expect(montageOutputPath(CHALLENGE)).toBe(`${CHALLENGE}/montage.mp4`);
  });

  it("buildMontageRequest 는 challengeId·clipPaths·outputPath 를 담는다", () => {
    const req = buildMontageRequest(CHALLENGE, ["a.mp4", "b.mp4"]);
    expect(req).toEqual({
      challengeId: CHALLENGE,
      clipPaths: ["a.mp4", "b.mp4"],
      outputPath: `${CHALLENGE}/montage.mp4`,
    });
  });
});

describe("signMontageRequest", () => {
  it("HMAC-SHA256(body, secret) hex 와 일치 — 워커가 재계산 가능", () => {
    const body = JSON.stringify({ challengeId: CHALLENGE });
    const expected = createHmac("sha256", SECRET).update(body).digest("hex");
    expect(signMontageRequest(body, SECRET)).toBe(expected);
  });

  it("시크릿이 다르면 서명이 다르다", () => {
    const body = "x";
    expect(signMontageRequest(body, "a")).not.toBe(signMontageRequest(body, "b"));
  });
});

describe("triggerMontage", () => {
  it("env(URL/SECRET) 미설정이면 not_configured 로 skip (fetch 미호출)", async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const r1 = await triggerMontage(CHALLENGE, deps({ workerUrl: undefined, fetchImpl }));
    const r2 = await triggerMontage(CHALLENGE, deps({ workerSecret: undefined, fetchImpl }));
    expect(r1).toEqual({ ok: true, status: "skipped", reason: "not_configured" });
    expect(r2).toEqual({ ok: true, status: "skipped", reason: "not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("클립이 없으면 no_clips 로 skip (fetch 미호출)", async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const r = await triggerMontage(CHALLENGE, deps({ listClipPaths: async () => [], fetchImpl }));
    expect(r).toEqual({ ok: true, status: "skipped", reason: "no_clips" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("클립이 있고 결과 mp4 가 없으면 서명 POST → triggered", async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const r = await triggerMontage(CHALLENGE, deps({ fetchImpl }));
    expect(r).toEqual({ ok: true, status: "triggered" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // 무인자 mock 이라 calls[0] 가 빈 튜플로 추론됨 — 실제 fetch(url, init) 인자를 cast 로 꺼낸다.
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(WORKER);
    const headers = init.headers as Record<string, string>;
    const body = init.body as string;
    // 서명 헤더가 body 의 HMAC 과 일치해야 워커가 검증을 통과한다.
    expect(headers["x-montage-signature"]).toBe(signMontageRequest(body, SECRET));
    expect(JSON.parse(body).outputPath).toBe(`${CHALLENGE}/montage.mp4`);
  });

  it("멱등: 결과 mp4 가 이미 존재하면 exists 로 skip (재인코딩 안 함)", async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const r = await triggerMontage(CHALLENGE, deps({ montageExists: async () => true, fetchImpl }));
    expect(r).toEqual({ ok: true, status: "skipped", reason: "exists" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("멱등 시나리오: 2회 트리거 → 인코딩 1건 (첫 회는 trigger, 둘째 회는 결과 존재 → skip)", async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    // 첫 호출 후 결과물이 생겼다고 가정 — montageExists 가 false→true 로 전환.
    let encoded = false;
    const d = deps({
      montageExists: async () => encoded,
      fetchImpl,
    });
    const first = await triggerMontage(CHALLENGE, d);
    encoded = true; // 워커가 결과 mp4 를 push 한 상태.
    const second = await triggerMontage(CHALLENGE, d);

    expect(first).toEqual({ ok: true, status: "triggered" });
    expect(second).toEqual({ ok: true, status: "skipped", reason: "exists" });
    expect(fetchImpl).toHaveBeenCalledTimes(1); // 인코딩은 정확히 1건.
  });

  it("워커가 non-ok 응답이면 worker_error", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 }) as Response);
    const r = await triggerMontage(CHALLENGE, deps({ fetchImpl }));
    expect(r).toEqual({ ok: false, reason: "worker_error" });
  });

  it("워커 호출이 throw 하면 worker_error (네트워크 실패 흡수)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const r = await triggerMontage(CHALLENGE, deps({ fetchImpl }));
    expect(r).toEqual({ ok: false, reason: "worker_error" });
  });

  it("워커가 타임아웃을 넘기면 abort → worker_error (serverless 블록 방지)", async () => {
    // signal.abort 에 반응해 reject 하는 fetch — 그 외엔 영원히 pending.
    const fetchImpl = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          void input;
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const r = await triggerMontage(CHALLENGE, deps({ fetchImpl, timeoutMs: 5 }));
    expect(r).toEqual({ ok: false, reason: "worker_error" });
  });
});
