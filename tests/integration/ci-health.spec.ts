import { describe, expect, it } from "vitest";
import { admin } from "./setup";

describe("ci health", () => {
  it("RLS is ON for every application table", async () => {
    const { data, error } = await admin.rpc("audit_rls_status");
    if (error) throw error;
    const rows = (data ?? []) as { tablename: string; rowsecurity: boolean }[];
    const withoutRls = rows.filter((r) => !r.rowsecurity).map((r) => r.tablename);
    expect(withoutRls).toEqual([]);
    expect(rows.length).toBeGreaterThanOrEqual(10);
  });

  it("truncate_test_data RPC is reachable", async () => {
    const { error } = await admin.rpc("truncate_test_data");
    expect(error).toBeNull();
  });
});
