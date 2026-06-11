import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildFeedbackPayload, notifyFeedbackToSlack } from "./notify";

const BASE = {
  category: "bug" as const,
  body: "제출 버튼이 안 눌려요",
  userId: "11111111-1111-1111-1111-111111111111",
  email: "u@test.local",
  photoUrl: null,
};

describe("buildFeedbackPayload", () => {
  it("includes category label, body, and submitter", () => {
    const payload = buildFeedbackPayload(BASE);
    const text = JSON.stringify(payload);
    expect(text).toContain("버그");
    expect(text).toContain("제출 버튼이 안 눌려요");
    expect(text).toContain("u@test.local");
  });

  it("includes the photo link only when photoUrl is set", () => {
    expect(JSON.stringify(buildFeedbackPayload(BASE))).not.toContain("사진");
    expect(
      JSON.stringify(buildFeedbackPayload({ ...BASE, photoUrl: "https://signed.example/x" })),
    ).toContain("https://signed.example/x");
  });
});

describe("notifyFeedbackToSlack", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("skips silently when env is unset", async () => {
    vi.stubEnv("SLACK_FEEDBACK_WEBHOOK_URL", "");
    await notifyFeedbackToSlack(BASE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs to the webhook when env is set", async () => {
    vi.stubEnv("SLACK_FEEDBACK_WEBHOOK_URL", "https://hooks.slack.test/abc");
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
    await notifyFeedbackToSlack(BASE);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("https://hooks.slack.test/abc");
  });

  it("never throws on fetch failure", async () => {
    vi.stubEnv("SLACK_FEEDBACK_WEBHOOK_URL", "https://hooks.slack.test/abc");
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(notifyFeedbackToSlack(BASE)).resolves.toBeUndefined();
  });
});
