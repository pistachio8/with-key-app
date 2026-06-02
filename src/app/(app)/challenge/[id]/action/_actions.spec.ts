// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "owner@test.local",
  },
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
  uploadPhoto: vi.fn(),
  deletePhoto: vi.fn(),
  track: vi.fn().mockResolvedValue(undefined),
  generateDiary: vi.fn(),
  userProfile: vi.fn(),
  dispatchActionCompletedNotification: vi.fn().mockResolvedValue({
    recipientCount: 1,
    quietHours: false,
  }),
}));

vi.mock("@/lib/auth/with-user", () => ({
  withUser:
    <TInput, TData>(handler: (user: typeof mocks.user, input: TInput) => Promise<TData>) =>
    (input: TInput) =>
      handler(mocks.user, input),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mocks.supabase),
}));

vi.mock("@/lib/ai/diary", () => ({
  generateDiary: (input: unknown, opts: unknown) => mocks.generateDiary(input, opts),
}));

vi.mock("@/lib/storage/action-photos", () => ({
  uploadPhoto: (...args: unknown[]) => mocks.uploadPhoto(...args),
  deletePhoto: (...args: unknown[]) => mocks.deletePhoto(...args),
}));

vi.mock("@/lib/analytics/track", () => ({
  track: (...args: unknown[]) => mocks.track(...args),
}));

// revalidatePath / updateTag 는 Next.js runtime store 에 의존 — unit test 에서는 no-op mock.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

// after(cb) 는 request 컨텍스트 의존 — 테스트에서는 콜백을 즉시 실행.
vi.mock("next/server", () => ({
  after: (cb: () => unknown) => {
    void cb();
  },
}));

vi.mock("@/lib/push/dispatch", () => ({
  dispatchActionCompletedNotification: (...args: unknown[]) =>
    mocks.dispatchActionCompletedNotification(...args),
}));

import { submitActionLog } from "./_actions";

const challengeId = "22222222-2222-4222-8222-222222222222";
const actionLogId = "33333333-3333-4333-8333-333333333333";

function makeFormData(file?: File): FormData {
  const formData = new FormData();
  formData.append("challengeId", challengeId);
  formData.append("activityType", "gym");
  formData.append("selectedKeywords", JSON.stringify(["펌핑"]));
  formData.append("shownKeywords", JSON.stringify(["펌핑", "하체데이", "스쿼트"]));
  formData.append("rerollCount", "0");
  if (file) formData.append("photo", file);
  return formData;
}

// 직접 입력 일기 (spec 2026-05-28-action-manual-diary): memo 가 채워진 제출.
// 키워드를 함께 보내도 직접 모드에서는 무시되어야 한다.
function makeDirectFormData(memo: string): FormData {
  const formData = makeFormData();
  formData.set("memo", memo);
  return formData;
}

function stubDb(
  opts: {
    startAt?: string;
    durationDays?: number;
    goalCount?: number;
    priorLogs?: string[]; // 본 insert 이전 로그의 created_at ISO 목록
  } = {},
) {
  const startAt = opts.startAt ?? new Date(Date.now() - 60_000).toISOString();
  const durationDays = opts.durationDays ?? 30;
  const goalCount = opts.goalCount ?? 7;
  const priorRows = (opts.priorLogs ?? []).map((created_at) => ({ created_at }));

  const maybeSingleParticipant = vi.fn().mockResolvedValue({
    data: {
      user_id: mocks.user.id,
      challenges: {
        status: "active",
        start_at: startAt,
        end_at: new Date(Date.now() + 86_400_000 * durationDays).toISOString(),
        duration_days: durationDays,
        goal_count: goalCount,
      },
    },
    error: null,
  });
  const challengeParticipants = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: maybeSingleParticipant }),
      }),
    }),
  };
  const users = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: mocks.userProfile }),
    }),
  };
  // action_logs: (a) created_at 목록 select(.eq.eq await) + (b) insert.select.single.
  const priorSelect = Promise.resolve({ data: priorRows, error: null });
  const actionLogs = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue(priorSelect),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: actionLogId }, error: null }),
      }),
    }),
  };

  mocks.supabase.from.mockImplementation((table: string) => {
    if (table === "challenge_participants") return challengeParticipants;
    if (table === "users") return users;
    if (table === "action_logs") return actionLogs;
    throw new Error(`unexpected table ${table}`);
  });
  mocks.supabase.rpc.mockResolvedValue({ error: null });
}

describe("submitActionLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.track.mockResolvedValue(undefined);
    mocks.generateDiary.mockResolvedValue({
      summary: "오늘도 해냈다.",
      fallback: false,
      keywordCoverage: 1,
      latencyMs: 100,
      promptVersion: "v3",
    });
    mocks.userProfile.mockResolvedValue({ data: { display_name: "지우" }, error: null });
    mocks.dispatchActionCompletedNotification.mockResolvedValue({
      recipientCount: 1,
      quietHours: false,
    });
    stubDb();
  });

  it("passes users.display_name into generateDiary (D-017)", async () => {
    await submitActionLog(makeFormData());
    expect(mocks.generateDiary).toHaveBeenCalledWith(
      expect.objectContaining({ activityType: "gym", keywords: ["펌핑"] }),
      expect.objectContaining({ displayName: "지우" }),
    );
  });

  it("passes undefined displayName when profile is missing", async () => {
    mocks.userProfile.mockResolvedValueOnce({ data: null, error: null });
    await submitActionLog(makeFormData());
    expect(mocks.generateDiary).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ displayName: undefined }),
    );
  });

  it("tracks events with userId (D-017)", async () => {
    await submitActionLog(makeFormData());
    expect(mocks.track).toHaveBeenCalledWith(expect.objectContaining({ name: "action_logged" }), {
      userId: mocks.user.id,
    });
    expect(mocks.track).toHaveBeenCalledWith(expect.objectContaining({ name: "ai_generated" }), {
      userId: mocks.user.id,
    });
  });

  it("succeeds without a photo and tracks photoAttached=false", async () => {
    const result = await submitActionLog(makeFormData());
    expect(result).toMatchObject({
      ok: true,
      data: { id: actionLogId, photoAttached: false },
    });
    expect(mocks.uploadPhoto).not.toHaveBeenCalled();
    expect(mocks.supabase.rpc).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "action_logged",
        props: expect.objectContaining({ photoAttached: false, photoSize: 0 }),
      }),
      { userId: mocks.user.id },
    );
  });

  it("uploads a photo and stores the path via RPC", async () => {
    const path = `${mocks.user.id}/${challengeId}/${actionLogId}-abcd.jpg`;
    mocks.uploadPhoto.mockResolvedValue({ ok: true, path });
    const file = new File([new Uint8Array(1000)], "photo.jpg", { type: "image/jpeg" });

    const result = await submitActionLog(makeFormData(file));

    expect(result).toMatchObject({
      ok: true,
      data: { id: actionLogId, photoAttached: true },
    });
    expect(mocks.uploadPhoto).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: mocks.user.id,
        challengeId,
        actionLogId,
        file,
      }),
    );
    expect(mocks.supabase.rpc).toHaveBeenCalledWith("update_action_log_photo_path", {
      p_log_id: actionLogId,
      p_photo_path: path,
    });
    expect(mocks.track).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "action_logged",
        props: expect.objectContaining({ photoAttached: true, photoSize: 1000 }),
      }),
      { userId: mocks.user.id },
    );
  });

  it("keeps the submission when upload fails", async () => {
    mocks.uploadPhoto.mockResolvedValue({ ok: false, reason: "upload_failed" });
    const file = new File([new Uint8Array(1000)], "photo.jpg", { type: "image/jpeg" });

    const result = await submitActionLog(makeFormData(file));

    expect(result).toMatchObject({
      ok: true,
      data: { id: actionLogId, photoAttached: false },
    });
    expect(mocks.supabase.rpc).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "action_logged",
        props: expect.objectContaining({ photoAttached: false, photoSize: 0 }),
      }),
      { userId: mocks.user.id },
    );
  });

  it("updateTag('user-${uid}-home-feed') after successful action_log INSERT (Phase 5-1)", async () => {
    const { updateTag } = await import("next/cache");
    await submitActionLog(makeFormData());
    expect(updateTag).toHaveBeenCalledWith(`user-${mocks.user.id}-home-feed`);
  });

  it("deletes the uploaded object if the RPC update fails", async () => {
    const path = `${mocks.user.id}/${challengeId}/${actionLogId}-abcd.jpg`;
    mocks.uploadPhoto.mockResolvedValue({ ok: true, path });
    mocks.supabase.rpc.mockResolvedValue({ error: { code: "42501", message: "blocked" } });
    const file = new File([new Uint8Array(1000)], "photo.jpg", { type: "image/jpeg" });

    const result = await submitActionLog(makeFormData(file));

    expect(result).toMatchObject({
      ok: true,
      data: { id: actionLogId, photoAttached: false },
    });
    expect(mocks.deletePhoto).toHaveBeenCalledWith(mocks.user.id, path, mocks.supabase);
  });

  // 직접 입력 일기 (spec 2026-05-28-action-manual-diary)
  describe("direct manual diary", () => {
    const memo = "오늘 헬스 다녀왔어요. 직접 쓴 일기예요.";

    it("skips generateDiary and stores the memo as ai_summary", async () => {
      const result = await submitActionLog(makeDirectFormData(memo));

      expect(mocks.generateDiary).not.toHaveBeenCalled();
      expect(result).toMatchObject({ ok: true, data: { id: actionLogId, summary: memo } });

      const actionLogs = mocks.supabase.from("action_logs");
      expect(actionLogs.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          ai_summary: memo,
          template_fallback: false,
          prompt_version: "manual",
          selected_keywords: [],
          memo: null,
        }),
      );
    });

    it("does not track ai_generated and reports keywordCount=0", async () => {
      await submitActionLog(makeDirectFormData(memo));

      expect(mocks.track).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: "ai_generated" }),
        expect.anything(),
      );
      expect(mocks.track).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "action_logged",
          props: expect.objectContaining({ keywordCount: 0, hasMemo: true, selectedKeywords: [] }),
        }),
        { userId: mocks.user.id },
      );
    });
  });

  describe("verifiedDays & goalReached", () => {
    it("오늘 첫 인증은 verifiedDays=[1], goalReached=false (goal 7)", async () => {
      const result = await submitActionLog(makeFormData());
      expect(result).toMatchObject({
        ok: true,
        data: { verifiedDays: [1], goalCount: 7, goalReached: false },
      });
    });

    it("goalCount=1 이면 첫 인증에서 goalReached=true", async () => {
      stubDb({ goalCount: 1 });
      const result = await submitActionLog(makeFormData());
      expect(result).toMatchObject({ ok: true, data: { goalReached: true } });
    });

    it("이전 2일 + 오늘(신규일) 으로 goalCount=3 에 도달하면 goalReached=true", async () => {
      // 시작 9일 전, 이전 인증 2개의 distinct 일자 + 오늘 → 누적 3일 = goal.
      const start = new Date(Date.now() - 86_400_000 * 9);
      stubDb({
        startAt: start.toISOString(),
        durationDays: 30,
        goalCount: 3,
        priorLogs: [
          new Date(Date.now() - 86_400_000 * 5).toISOString(),
          new Date(Date.now() - 86_400_000 * 2).toISOString(),
        ],
      });
      const result = await submitActionLog(makeFormData());
      expect(result).toMatchObject({ ok: true, data: { goalReached: true, currentDay: 10 } });
    });

    it("이미 달성된(goal=2, 이전 distinct 2일) 뒤 재인증은 goalReached=false", async () => {
      const start = new Date(Date.now() - 86_400_000 * 9);
      stubDb({
        startAt: start.toISOString(),
        durationDays: 30,
        goalCount: 2,
        priorLogs: [
          new Date(Date.now() - 86_400_000 * 5).toISOString(),
          new Date(Date.now() - 86_400_000 * 2).toISOString(),
        ],
      });
      const result = await submitActionLog(makeFormData());
      expect(result).toMatchObject({ ok: true, data: { goalReached: false } });
    });
  });

  describe("완료 푸시 (friend_action)", () => {
    it("제출 성공 후 dispatchActionCompletedNotification을 actor·activityType·isFirstOfDay로 호출", async () => {
      await submitActionLog(makeFormData());
      expect(mocks.dispatchActionCompletedNotification).toHaveBeenCalledWith(
        challengeId,
        { userId: mocks.user.id, displayName: "지우" },
        { activityType: "gym", isFirstOfDay: true },
      );
    });

    it("같은 날 재제출(priorLogs에 오늘 포함)이면 isFirstOfDay=false", async () => {
      stubDb({ priorLogs: [new Date().toISOString()] });
      await submitActionLog(makeFormData());
      expect(mocks.dispatchActionCompletedNotification).toHaveBeenCalledWith(
        challengeId,
        expect.anything(),
        expect.objectContaining({ isFirstOfDay: false }),
      );
    });

    it("display_name이 없으면 '친구'로 폴백", async () => {
      mocks.userProfile.mockResolvedValue({ data: null, error: null });
      await submitActionLog(makeFormData());
      expect(mocks.dispatchActionCompletedNotification).toHaveBeenCalledWith(
        challengeId,
        { userId: mocks.user.id, displayName: "친구" },
        expect.anything(),
      );
    });

    it("직접 입력 모드(memo)에서도 완료 푸시를 보낸다", async () => {
      await submitActionLog(makeDirectFormData("오늘 직접 쓴 일기"));
      expect(mocks.dispatchActionCompletedNotification).toHaveBeenCalledWith(
        challengeId,
        { userId: mocks.user.id, displayName: "지우" },
        { activityType: "gym", isFirstOfDay: true },
      );
    });
  });
});
