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
  seedActiveChallenge: () => Promise<{ challengeId: string }>;
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

  seedActiveChallenge: async ({ page, groupId }, use) => {
    const challengeIds: string[] = [];

    await use(async () => {
      await page.goto("/home");
      const userId = await page.evaluate(async () => {
        const res = await fetch("/api/me");
        if (!res.ok) return null;
        const j = (await res.json()) as { id: string };
        return j.id;
      });
      if (!userId) throw new Error("cannot resolve authenticated user id via /api/me");

      const { data, error } = await admin
        .from("challenges")
        .insert({
          group_id: groupId,
          title: `photo-e2e-${Date.now()}`,
          type: "fitness",
          goal_count: 3,
          duration_days: 7,
          penalty_amount: 3000,
          status: "active",
          start_at: new Date(Date.now() - 60_000).toISOString(),
          end_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        })
        .select("id")
        .single();
      if (error) throw error;

      const participantInsert = await admin.from("challenge_participants").insert({
        challenge_id: data.id,
        user_id: userId,
        signed_at: new Date().toISOString(),
      });
      if (participantInsert.error) throw participantInsert.error;

      challengeIds.push(data.id);
      return { challengeId: data.id };
    });

    if (challengeIds.length > 0) {
      const { data: logs } = await admin
        .from("action_logs")
        .select("id, photo_path")
        .in("challenge_id", challengeIds);
      const photoPaths = (logs ?? [])
        .map((row) => row.photo_path)
        .filter((path): path is string => Boolean(path));
      if (photoPaths.length > 0) {
        await admin.storage.from("action-photos").remove(photoPaths);
      }
      await admin.from("action_logs").delete().in("challenge_id", challengeIds);
      await admin.from("challenge_participants").delete().in("challenge_id", challengeIds);
      await admin.from("challenges").delete().in("id", challengeIds);
    }
  },
});

export { expect } from "@playwright/test";
