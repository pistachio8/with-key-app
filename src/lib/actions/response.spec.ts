import { describe, it, expect } from "vitest";
import { z } from "zod";
import { validationFailure, success, failure, type ActionResult } from "./response";

describe("validationFailure", () => {
  const schema = z.object({
    title: z.string().min(1),
    count: z.number().int().min(1),
  });

  it("flattens fieldErrors and fixes error code", () => {
    const parsed = schema.safeParse({ title: "", count: 0 });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const res = validationFailure(parsed.error);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("invalid_input");
    expect(res.issues?.title?.length).toBeGreaterThan(0);
    expect(res.issues?.count?.length).toBeGreaterThan(0);
  });
});

describe("success / failure helpers", () => {
  it("success wraps payload", () => {
    expect(success({ id: "x" })).toEqual({ ok: true, data: { id: "x" } });
  });

  it("failure omits issues when none provided", () => {
    expect(failure("unauthorized")).toEqual({ ok: false, error: "unauthorized" });
  });

  it("failure attaches issues when provided", () => {
    expect(failure("invalid_input", { title: ["required"] })).toEqual({
      ok: false,
      error: "invalid_input",
      issues: { title: ["required"] },
    });
  });
});

describe("ActionResult type", () => {
  it("narrows on ok discriminator", () => {
    const ok: ActionResult<{ id: string }> = { ok: true, data: { id: "x" } };
    const fail: ActionResult<{ id: string }> = {
      ok: false,
      error: "invalid_input",
      issues: {},
    };
    expect(ok.ok).toBe(true);
    expect(fail.ok).toBe(false);
  });
});
