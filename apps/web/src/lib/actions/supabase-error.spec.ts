import { describe, it, expect } from "vitest";
import { mapSupabaseError } from "./supabase-error";

describe("mapSupabaseError", () => {
  it("maps RLS denial (42501) to forbidden", () => {
    expect(mapSupabaseError({ code: "42501", message: "RLS" })).toBe("forbidden");
  });

  it("maps PGRST116 (no rows) to not_found", () => {
    expect(mapSupabaseError({ code: "PGRST116", message: "no rows" })).toBe("not_found");
  });

  it("maps unique violation (23505) to conflict", () => {
    expect(mapSupabaseError({ code: "23505", message: "dup" })).toBe("conflict");
  });

  it("maps FK (23503), check (23514), not-null (23502) to invalid_input", () => {
    expect(mapSupabaseError({ code: "23503", message: "fk" })).toBe("invalid_input");
    expect(mapSupabaseError({ code: "23514", message: "check" })).toBe("invalid_input");
    expect(mapSupabaseError({ code: "23502", message: "null" })).toBe("invalid_input");
  });

  it("falls back to upstream_error for unknown / null", () => {
    expect(mapSupabaseError({ code: "99999", message: "?" })).toBe("upstream_error");
    expect(mapSupabaseError(null)).toBe("upstream_error");
  });
});
