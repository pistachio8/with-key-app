import { describe, expect, it } from "vitest";
import { analyticsEventSchema } from "./schema";

describe("analyticsEventSchema", () => {
  it("accepts ai_generated with required props", () => {
    const r = analyticsEventSchema.safeParse({
      name: "ai_generated",
      props: {
        actionLogId: "11111111-1111-4111-8111-111111111111",
        latencyMs: 1234,
        fallback: false,
        keywordCoverage: 1,
        promptVersion: "v1",
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown event names (matches DB CHECK)", () => {
    const r = analyticsEventSchema.safeParse({ name: "nonsense", props: {} });
    expect(r.success).toBe(false);
  });

  it("rejects ai_generated when keywordCoverage is not numeric", () => {
    const r = analyticsEventSchema.safeParse({
      name: "ai_generated",
      props: {
        actionLogId: "11111111-1111-4111-8111-111111111111",
        latencyMs: 1234,
        fallback: false,
        keywordCoverage: "high",
        promptVersion: "v1",
      },
    });
    expect(r.success).toBe(false);
  });
});
