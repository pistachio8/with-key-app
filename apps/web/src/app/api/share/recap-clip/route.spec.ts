import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/db/reads/recap", () => ({ fetchRecap: vi.fn() }));
vi.mock("@/lib/db/reads/challenge-photos", () => ({
  fetchChallengePhotos: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/share/og-fonts", () => ({ loadCardFonts: vi.fn().mockResolvedValue([]) }));
vi.mock("./encode", () => ({ encodeClip: vi.fn().mockResolvedValue(Buffer.from("mp4")) }));

// frames/templates 를 __kind 태그 객체로 대체해, 아래 next/og mock 이 beat 종류별로
// 렌더 동작(성공·실패·지연)을 제어할 수 있게 한다. intro 는 폴백 프레임에도 쓰이므로
// "photo" 만 실패시키면 폴백(intro) 은 항상 성공한다.
vi.mock("./frames", () => ({ renderIntroFrame: () => ({ __kind: "intro" }) }));
vi.mock("@/app/api/og/recap-card/templates", () => ({
  renderPhotoCard: () => ({ __kind: "photo" }),
}));

// next/og ImageResponse mock — element 의 __kind 와 호출 순번을 renderBehavior 에 넘긴다.
// 테스트가 renderBehavior 를 갈아끼워 타임아웃·실패·지연을 시뮬레이션한다.
const okPng = (): Promise<ArrayBuffer> => Promise.resolve(new Uint8Array([1, 2, 3]).buffer);
let renderBehavior: (kind: string, attempt: number) => Promise<ArrayBuffer> = () => okPng();
const renderCallsByKind: Record<string, number> = {};
let inFlight = 0;
let maxInFlight = 0;

function resetRender(): void {
  renderBehavior = () => okPng();
  for (const key of Object.keys(renderCallsByKind)) delete renderCallsByKind[key];
  inFlight = 0;
  maxInFlight = 0;
}

vi.mock("next/og", () => ({
  ImageResponse: class {
    #kind: string;
    constructor(element: unknown) {
      this.#kind = (element as { __kind?: string } | null)?.__kind ?? "unknown";
    }
    async arrayBuffer(): Promise<ArrayBuffer> {
      const kind = this.#kind;
      const n = (renderCallsByKind[kind] = (renderCallsByKind[kind] ?? 0) + 1);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        return await renderBehavior(kind, n);
      } finally {
        inFlight -= 1;
      }
    }
  },
}));

// route.ts 의 FRAME_TIMEOUT_MS(8s) 와 동기화 — export 하지 않으므로 테스트 상수로 둔다.
const FRAME_TIMEOUT_MS_TEST = 8_000;

const { GET } = await import("./route");
const { createClient } = await import("@/lib/supabase/server");
const { fetchRecap } = await import("@/lib/db/reads/recap");
const { fetchChallengePhotos } = await import("@/lib/db/reads/challenge-photos");
const { encodeClip } = await import("./encode");

function authed() {
  (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
  });
}

function req(qs = "challengeId=c1"): Request {
  return new Request(`http://localhost/api/share/recap-clip?${qs}`);
}

function photo(id: string, ownerId = "u1") {
  return { id, signedUrl: `s_${id}`, takenAt: "t", ownerDisplayName: "나", ownerId };
}

const RECAP = {
  challengeId: "c1",
  title: "주 3회 헬스장",
  goalCount: 12,
  status: "closed" as const,
  startAt: "2026-05-16T00:00:00+09:00",
  endAt: "2026-05-28T00:00:00+09:00",
  durationDays: 14,
  penaltyAmount: 1000,
  viewerId: "u1",
  viewerAchieved: true,
  viewerDoneCount: 12,
  viewerPerHeadPenalty: 0,
  anyoneAchieved: true,
  members: [{ id: "u1", achieved: true }],
  group: {
    id: "g1",
    name: "우리 헬스방",
    ownerId: "u1",
  },
};

let errorSpy: ReturnType<typeof vi.spyOn>;

describe("GET /api/share/recap-clip", () => {
  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    vi.useRealTimers();
    vi.clearAllMocks();
    resetRender();
  });

  it("challengeId 없으면 400", async () => {
    authed();
    const res = await GET(req(""));
    expect(res.status).toBe(400);
  });

  it("미인증 시 401", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("recap null 이면 404", async () => {
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(404);
  });

  it("recap 있으면 200 video/mp4", async () => {
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(RECAP);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
  });

  it("사진 있으면 몽타주 샘플로 200 video/mp4 (렌더 throw 없음)", async () => {
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(RECAP);
    (fetchChallengePhotos as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      photo("p1", "u1"),
      photo("p2", "u2"),
    ]);
    const res = await GET(req("challengeId=c1&seed=5"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
  });

  // AC-1: per-frame 타임아웃 → 재시도 → 폴백
  it("프레임이 타임아웃되면 재시도 후 폴백 프레임으로 200 유지", async () => {
    vi.useFakeTimers();
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(RECAP);
    (fetchChallengePhotos as ReturnType<typeof vi.fn>).mockResolvedValueOnce([photo("p1", "u1")]);
    // photo 렌더는 영원히 행 → withTimeout 이 끊음. 두 시도 모두 타임아웃 → intro 폴백(성공).
    renderBehavior = (kind) => (kind === "photo" ? new Promise<ArrayBuffer>(() => {}) : okPng());

    const pending = GET(req("challengeId=c1&seed=5"));
    await vi.advanceTimersByTimeAsync(FRAME_TIMEOUT_MS_TEST * 4);
    const res = await pending;

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
    expect(errorSpy).toHaveBeenCalledWith(
      "[recap-clip] frame fell back to static",
      expect.objectContaining({ beatKind: "photo", challengeId: "c1" }),
    );
  });

  // AC-1: 렌더가 1회 실패해도 재시도로 복구 → 폴백 없이 200
  it("프레임 렌더 1회 실패해도 재시도로 복구(폴백 없음) 200", async () => {
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(RECAP);
    (fetchChallengePhotos as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      photo("p1", "u1"),
      photo("p2", "u2"),
    ]);
    // n = photo kind 의 전체 호출 순번. 첫 호출(n===1)만 실패시키면 그 beat 는 재시도(다음 순번)로
    // 성공하고, 나머지 photo/endcard 는 첫 시도에 성공한다 → 실패 1회, 폴백 0회.
    renderBehavior = (kind, n) =>
      kind === "photo" && n === 1 ? Promise.reject(new Error("boom")) : okPng();

    const res = await GET(req("challengeId=c1&seed=5"));

    expect(res.status).toBe(200);
    expect(errorSpy).toHaveBeenCalledWith(
      "[recap-clip] frame render failed",
      expect.objectContaining({ attempt: 1, beatKind: "photo" }),
    );
    expect(errorSpy).not.toHaveBeenCalledWith(
      "[recap-clip] frame fell back to static",
      expect.anything(),
    );
  });

  // AC-1: 재시도 소진 → 폴백 프레임으로 mp4 정상 완료
  it("모든 재시도 실패 시 폴백 프레임으로 mp4 정상 완료 200", async () => {
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(RECAP);
    (fetchChallengePhotos as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      photo("p1", "u1"),
      photo("p2", "u2"),
    ]);
    // photo 렌더는 항상 실패 → 재시도 소진 → intro 폴백(성공)으로 모든 beat 가 프레임을 받는다.
    renderBehavior = (kind) => (kind === "photo" ? Promise.reject(new Error("always")) : okPng());

    const res = await GET(req("challengeId=c1&seed=5"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
    expect(errorSpy).toHaveBeenCalledWith(
      "[recap-clip] frame fell back to static",
      expect.objectContaining({ beatKind: "photo" }),
    );
    // photo beat 당 2회 실패(최초+재시도) 로그가 남는다.
    const failed = errorSpy.mock.calls.filter((c) => c[0] === "[recap-clip] frame render failed");
    expect(failed.length).toBeGreaterThanOrEqual(2);
  });

  // AC-1 floor: 폴백(텍스트 전용)마저 실패 = 렌더 파이프라인 전체 손상 → 500(catastrophic floor).
  it("폴백 프레임마저 실패하면 500 으로 떨어진다(내놓을 프레임 없음)", async () => {
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(RECAP);
    (fetchChallengePhotos as ReturnType<typeof vi.fn>).mockResolvedValueOnce([photo("p1", "u1")]);
    // intro(폴백)·photo 모두 실패 → 어떤 beat 도 프레임을 못 만든다.
    renderBehavior = () => Promise.reject(new Error("render pipeline down"));

    const res = await GET(req("challengeId=c1&seed=5"));

    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalledWith(
      "[recap-clip] static fallback frame also failed",
      expect.objectContaining({ challengeId: "c1" }),
    );
  });

  // AC-2: 동시성 cap ≤3
  it("동시 렌더 수가 cap(3) 을 넘지 않는다 (최대 8 beat)", async () => {
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(RECAP);
    (fetchChallengePhotos as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      photo("p1"),
      photo("p2"),
      photo("p3"),
      photo("p4"),
      photo("p5"),
      photo("p6"),
    ]);
    // 지연을 둬 모든 worker 가 cap 만큼 동시에 진입(inFlight 증가)한 뒤에야 resolve 되게 한다.
    // 8 beat > cap 3 이므로 maxInFlight 는 정확히 3 에서 멈춰야 한다.
    renderBehavior = () =>
      new Promise<ArrayBuffer>((resolve) =>
        setTimeout(() => resolve(new Uint8Array([1, 2, 3]).buffer), 20),
      );

    const res = await GET(req("challengeId=c1&seed=1"));

    expect(res.status).toBe(200);
    expect(maxInFlight).toBeLessThanOrEqual(3); // AC-2: cap 초과 금지
    expect(maxInFlight).toBe(3); // 8 beat 라 cap 이 실제 binding 됨(직렬화 아님)
  });

  // AC-2: beat 순서 + 렌더 호출 총 수 보존
  it("beat 순서(intro→photo→endcard)·렌더 호출 수가 보존된다", async () => {
    authed();
    (fetchRecap as ReturnType<typeof vi.fn>).mockResolvedValue(RECAP);
    (fetchChallengePhotos as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      photo("p1", "u1"),
      photo("p2", "u1"),
    ]);
    // intro 렌더만 코드 0, 나머지(photo/endcard) 코드 1 로 태깅해 png↔beat 정렬을 검증한다.
    renderBehavior = (kind) => Promise.resolve(new Uint8Array([kind === "intro" ? 0 : 1]).buffer);

    let captured: { beats: { kind: string }[]; pngs: Buffer[] } | null = null;
    (encodeClip as ReturnType<typeof vi.fn>).mockImplementationOnce((input) => {
      captured = { beats: input.beats, pngs: input.pngs };
      return Promise.resolve(Buffer.from("mp4"));
    });

    const res = await GET(req("challengeId=c1&seed=5"));
    expect(res.status).toBe(200);
    expect(captured).not.toBeNull();
    const { beats, pngs } = captured!;

    // storyboard 순서: intro → photo×N → endcard
    expect(beats[0].kind).toBe("intro");
    expect(beats[beats.length - 1].kind).toBe("endcard");
    expect(beats.slice(1, -1).every((b) => b.kind === "photo")).toBe(true);
    // png 개수 = beat 수 (렌더 호출 총 수 불변), intro png 가 index 0 에 그대로 위치
    expect(pngs.length).toBe(beats.length);
    expect(pngs[0][0]).toBe(0); // intro 가 동시 렌더에도 첫 칸 유지
    expect(pngs.slice(1).every((p) => p[0] === 1)).toBe(true);
  });
});
