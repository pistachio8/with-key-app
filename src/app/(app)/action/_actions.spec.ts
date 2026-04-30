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

function stubDb() {
  const maybeSingleParticipant = vi.fn().mockResolvedValue({
    data: {
      user_id: mocks.user.id,
      challenges: {
        status: "active",
        start_at: new Date(Date.now() - 60_000).toISOString(),
        end_at: new Date(Date.now() + 86_400_000).toISOString(),
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
  const actionLogs = {
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
    expect(mocks.track).toHaveBeenCalledWith(
      expect.objectContaining({ name: "action_logged" }),
      { userId: mocks.user.id },
    );
    expect(mocks.track).toHaveBeenCalledWith(
      expect.objectContaining({ name: "ai_generated" }),
      { userId: mocks.user.id },
    );
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
});
