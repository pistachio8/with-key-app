// Playwright fixtures receive a `use` callback (fixture value passthrough);
// the react-hooks rule misreads it as the React `use()` hook.
/* eslint-disable react-hooks/rules-of-hooks */
import { test as base } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SECRET_KEY!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type MyFixtures = {
  groupId: string;
};

export const test = base.extend<MyFixtures>({
  groupId: async ({ page }, use) => {
    await page.goto("/home");
    const userId = await page.evaluate(async () => {
      const res = await fetch("/api/me");
      if (!res.ok) return null;
      const j = (await res.json()) as { id: string };
      return j.id;
    });
    if (!userId) throw new Error("cannot resolve authenticated user id via /api/me");

    const { data, error } = await admin
      .from("groups")
      .insert({ name: `e2e-group-${Date.now()}`, owner_id: userId })
      .select("id")
      .single();
    if (error) throw error;

    const memberInsert = await admin
      .from("group_members")
      .insert({ group_id: data.id, user_id: userId, role: "owner" });
    if (memberInsert.error) throw memberInsert.error;

    await use(data.id);

    await admin.from("groups").delete().eq("id", data.id);
  },
});

export { expect } from "@playwright/test";
