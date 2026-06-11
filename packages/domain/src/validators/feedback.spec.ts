import { describe, expect, it } from "vitest";
import { FEEDBACK_CATEGORIES, feedbackSchema } from "./feedback";

describe("feedbackSchema", () => {
  it("accepts a valid input", () => {
    const res = feedbackSchema.safeParse({ category: "bug", body: "버그가 있어요" });
    expect(res.success).toBe(true);
  });

  it("trims body and rejects empty-after-trim", () => {
    expect(feedbackSchema.safeParse({ category: "other", body: "   " }).success).toBe(false);
  });

  it("rejects an empty-string body (min(1) without trim path)", () => {
    expect(feedbackSchema.safeParse({ category: "bug", body: "" }).success).toBe(false);
  });

  it("accepts body of exactly 1 char (positive lower boundary)", () => {
    expect(feedbackSchema.safeParse({ category: "bug", body: "a" }).success).toBe(true);
  });

  it("rejects body over 1000 chars", () => {
    expect(feedbackSchema.safeParse({ category: "feature", body: "a".repeat(1001) }).success).toBe(
      false,
    );
  });

  it("accepts body of exactly 1000 chars", () => {
    expect(feedbackSchema.safeParse({ category: "feature", body: "a".repeat(1000) }).success).toBe(
      true,
    );
  });

  it("rejects unknown category", () => {
    expect(feedbackSchema.safeParse({ category: "spam", body: "hi" }).success).toBe(false);
  });

  it("FEEDBACK_CATEGORIES matches the DB check constraint set", () => {
    // migration 0047 의 check (category in ('bug','feature','other')) 와 1:1
    expect(FEEDBACK_CATEGORIES).toEqual(["bug", "feature", "other"]);
  });
});
