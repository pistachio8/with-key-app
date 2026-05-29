import { describe, expect, it } from "vitest";
import { buildStoryboard } from "./storyboard";

describe("buildStoryboard", () => {
  it("사진 3장 → 인트로+사진3+엔드카드", () => {
    const storyboard = buildStoryboard({ photoCount: 3, fps: 30 });
    expect(storyboard.beats.map((beat) => beat.kind)).toEqual([
      "intro",
      "photo",
      "photo",
      "photo",
      "endcard",
    ]);
    expect(storyboard.totalFrames).toBe(
      storyboard.beats.reduce((sum, beat) => sum + beat.frames, 0),
    );
  });

  it("총 길이 2~3.2초", () => {
    const storyboard = buildStoryboard({ photoCount: 4, fps: 30 });
    expect(storyboard.totalSeconds).toBeGreaterThanOrEqual(2);
    expect(storyboard.totalSeconds).toBeLessThanOrEqual(3.2);
  });

  it("사진 0장 → 인트로+엔드카드", () => {
    const storyboard = buildStoryboard({ photoCount: 0, fps: 30 });
    expect(storyboard.beats.map((beat) => beat.kind)).toEqual(["intro", "endcard"]);
  });

  it("사진 과다 → 몽타주 상한 6장", () => {
    const storyboard = buildStoryboard({ photoCount: 20, fps: 30 });
    expect(storyboard.beats.filter((beat) => beat.kind === "photo")).toHaveLength(6);
  });
});
