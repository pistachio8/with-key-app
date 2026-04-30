import { describe, expect, it } from "vitest";
import { admin } from "../setup";

describe("add_ai_cost RPC", () => {
  it("accumulates micros atomically per (month, scope)", async () => {
    const a = await admin.rpc("add_ai_cost", { p_micros: 10_000, p_scope: "test" });
    expect(a.error).toBeNull();
    const b = await admin.rpc("add_ai_cost", { p_micros: 15_000, p_scope: "test" });
    expect(b.error).toBeNull();
    expect(Number(b.data)).toBeGreaterThanOrEqual(25_000);
  });

  it("keeps prod and test scopes isolated", async () => {
    await admin.rpc("add_ai_cost", { p_micros: 5_000, p_scope: "test" });
    const { data: rows } = await admin
      .from("ai_cost_log")
      .select("scope, total_micros")
      .eq("month", new Date().toISOString().slice(0, 7) + "-01");
    const test = rows?.find((r) => r.scope === "test");
    expect(Number(test?.total_micros)).toBeGreaterThan(0);
  });

  it("rejects negative micros", async () => {
    const { error } = await admin.rpc("add_ai_cost", { p_micros: -1, p_scope: "test" });
    expect(error).not.toBeNull();
  });

  it("rejects invalid scope", async () => {
    const { error } = await admin.rpc("add_ai_cost", { p_micros: 1, p_scope: "staging" });
    expect(error).not.toBeNull();
  });
});
