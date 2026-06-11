import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-1111-1111-111111111111";

const insert = vi.fn<(row: object) => Promise<{ error: unknown }>>();
const uploadFeedbackPhoto = vi.fn();
const deleteFeedbackPhoto = vi.fn();
const getFeedbackPhotoSignedUrl = vi.fn();
const notifyFeedbackToSlack = vi.fn();

vi.mock("next/server", () => ({
  // after() 콜백을 즉시 실행 — Slack 경로를 동기 검증하기 위함.
  after: (fn: () => unknown) => fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({
        data: { claims: { sub: USER_ID, email: "u@test.local" } },
        error: null,
      }),
    },
    from: (table: string) => {
      if (table === "feedback") return { insert: (row: object) => insert(row) };
      throw new Error(`unexpected table: ${table}`);
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({}) }));

vi.mock("@/lib/storage/feedback-photos", () => ({
  uploadFeedbackPhoto: (...a: unknown[]) => uploadFeedbackPhoto(...a),
  deleteFeedbackPhoto: (...a: unknown[]) => deleteFeedbackPhoto(...a),
  getFeedbackPhotoSignedUrl: (...a: unknown[]) => getFeedbackPhotoSignedUrl(...a),
}));

vi.mock("@/lib/slack/notify", () => ({
  notifyFeedbackToSlack: (...a: unknown[]) => notifyFeedbackToSlack(...a),
}));

import { submitFeedback } from "./_actions";

function makeFormData(over: Partial<Record<"category" | "body", string>> = {}, photo?: File) {
  const fd = new FormData();
  fd.append("category", over.category ?? "bug");
  fd.append("body", over.body ?? "버그 신고");
  if (photo) fd.append("photo", photo);
  return fd;
}

beforeEach(() => {
  insert.mockReset().mockResolvedValue({ error: null });
  uploadFeedbackPhoto.mockReset();
  deleteFeedbackPhoto.mockReset();
  getFeedbackPhotoSignedUrl.mockReset().mockResolvedValue(null);
  notifyFeedbackToSlack.mockReset().mockResolvedValue(undefined);
});

describe("submitFeedback", () => {
  it("inserts feedback and notifies Slack on success", async () => {
    const res = await submitFeedback(makeFormData());
    expect(res.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        category: "bug",
        body: "버그 신고",
        photo_path: null,
        id: expect.any(String),
      }),
    );
    expect(notifyFeedbackToSlack).toHaveBeenCalledOnce();
  });

  it("rejects invalid input without touching DB", async () => {
    const res = await submitFeedback(makeFormData({ body: "   " }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_input");
    expect(insert).not.toHaveBeenCalled();
  });

  it("falls back to body-only when photo upload fails (non-destructive)", async () => {
    uploadFeedbackPhoto.mockResolvedValue({ ok: false, reason: "mime" });
    const photo = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const res = await submitFeedback(makeFormData({}, photo));
    expect(res.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ photo_path: null }));
  });

  it("stores photo_path when upload succeeds", async () => {
    uploadFeedbackPhoto.mockResolvedValue({ ok: true, path: `${USER_ID}/fb-abc.jpg` });
    const photo = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const res = await submitFeedback(makeFormData({}, photo));
    expect(res.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ photo_path: `${USER_ID}/fb-abc.jpg` }),
    );
  });

  it("removes the orphan object when insert fails after upload", async () => {
    uploadFeedbackPhoto.mockResolvedValue({ ok: true, path: `${USER_ID}/fb-abc.jpg` });
    insert.mockResolvedValue({ error: { code: "23514" } });
    const photo = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const res = await submitFeedback(makeFormData({}, photo));
    expect(res.ok).toBe(false);
    expect(deleteFeedbackPhoto).toHaveBeenCalledWith(
      USER_ID,
      `${USER_ID}/fb-abc.jpg`,
      expect.anything(),
    );
    expect(notifyFeedbackToSlack).not.toHaveBeenCalled();
  });

  it("keeps success when Slack notify rejects", async () => {
    notifyFeedbackToSlack.mockRejectedValue(new Error("slack down"));
    const res = await submitFeedback(makeFormData());
    expect(res.ok).toBe(true);
  });
});
