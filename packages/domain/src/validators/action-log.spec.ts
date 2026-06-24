import { describe, expect, it } from "vitest";
import {
  actionLogInputSchema,
  actionVideoMetaSchema,
  ALLOWED_VIDEO_MIME,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_DURATION_SECONDS,
  VIDEO_AUTO_VERIFY_STATUS,
} from "./action-log";

describe("actionLogInputSchema", () => {
  const base = {
    challengeId: "00000000-0000-4000-8000-000000000001",
    activityType: "gym" as const,
    selectedKeywords: ["펌핑"],
    shownKeywords: ["펌핑", "하체데이", "스쿼트"],
    rerollCount: 0,
  };

  it("accepts action log input without photoUrl", () => {
    expect(actionLogInputSchema.safeParse(base).success).toBe(true);
  });

  it("rejects legacy photoUrl payloads", () => {
    const parsed = actionLogInputSchema.safeParse({
      ...base,
      photoUrl: "https://example.com/x.jpg",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects selected keywords outside the activity pool", () => {
    const parsed = actionLogInputSchema.safeParse({
      ...base,
      selectedKeywords: ["명상"],
    });
    expect(parsed.success).toBe(false);
  });

  // 직접 입력 일기 (spec 2026-05-28-action-manual-diary)
  it("accepts 0 keywords when a memo (direct diary) is provided", () => {
    const parsed = actionLogInputSchema.safeParse({
      ...base,
      selectedKeywords: [],
      memo: "오늘 헬스 다녀왔어요. 직접 쓴 일기예요.",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects 0 keywords when there is no memo (AI mode)", () => {
    const parsed = actionLogInputSchema.safeParse({
      ...base,
      selectedKeywords: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("treats a whitespace-only memo as no memo (still requires a keyword)", () => {
    const parsed = actionLogInputSchema.safeParse({
      ...base,
      selectedKeywords: [],
      memo: "   ",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a 150-char memo and rejects 151", () => {
    expect(
      actionLogInputSchema.safeParse({ ...base, selectedKeywords: [], memo: "가".repeat(150) })
        .success,
    ).toBe(true);
    expect(
      actionLogInputSchema.safeParse({ ...base, selectedKeywords: [], memo: "가".repeat(151) })
        .success,
    ).toBe(false);
  });
});

// 영상 인증 메타 검증(spec §C2 / EVAL-0043) — MIME·크기·길이.
describe("actionVideoMetaSchema", () => {
  const base = { mime: "video/mp4" as const, sizeBytes: 1_000_000, durationSeconds: 3 };

  it("accepts a valid 3-second mp4/webm clip", () => {
    expect(actionVideoMetaSchema.safeParse(base).success).toBe(true);
    expect(actionVideoMetaSchema.safeParse({ ...base, mime: "video/webm" }).success).toBe(true);
  });

  it("rejects a non-allowlisted MIME (e.g. image or quicktime)", () => {
    expect(actionVideoMetaSchema.safeParse({ ...base, mime: "video/quicktime" }).success).toBe(
      false,
    );
    expect(actionVideoMetaSchema.safeParse({ ...base, mime: "image/jpeg" }).success).toBe(false);
  });

  it("rejects clips over the size cap", () => {
    expect(actionVideoMetaSchema.safeParse({ ...base, sizeBytes: MAX_VIDEO_BYTES }).success).toBe(
      true,
    );
    expect(
      actionVideoMetaSchema.safeParse({ ...base, sizeBytes: MAX_VIDEO_BYTES + 1 }).success,
    ).toBe(false);
  });

  it("rejects clips longer than the 3.5s buffer (갤러리 우회·위조 신호)", () => {
    expect(
      actionVideoMetaSchema.safeParse({ ...base, durationSeconds: MAX_VIDEO_DURATION_SECONDS })
        .success,
    ).toBe(true);
    expect(
      actionVideoMetaSchema.safeParse({
        ...base,
        durationSeconds: MAX_VIDEO_DURATION_SECONDS + 0.6,
      }).success,
    ).toBe(false);
  });

  it("documents the video default verification status as 'passed' (캡처 수용, not AI 통과)", () => {
    // 영상엔 AI 검증이 없다 — passed=캡처 수용. doneByWeek 산정이 사진과 동일(passed=done).
    expect(VIDEO_AUTO_VERIFY_STATUS).toBe("passed");
    expect(ALLOWED_VIDEO_MIME).toContain("video/mp4");
  });
});
