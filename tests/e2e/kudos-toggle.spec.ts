import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

test("tapping 🔥 on a teammate's log creates a kudos row", async ({ page, groupId }) => {
  const userId = await page.evaluate(async () => {
    const res = await fetch("/api/me");
    return res.ok ? ((await res.json()) as { id: string }).id : null;
  });
  if (!userId) throw new Error("cannot resolve current user id");

  const shortSuffix = Math.random().toString(36).slice(2, 8);
  const { data: otherUser, error: userError } = await admin.auth.admin.createUser({
    email: `o-${shortSuffix}@test.local`,
    email_confirm: true,
  });
  if (userError) throw userError;
  if (!otherUser?.user) throw new Error("failed to create teammate");
  const otherId = otherUser.user.id;

  const memberInsert = await admin.from("group_members").insert({
    group_id: groupId,
    user_id: otherId,
    role: "member",
  });
  if (memberInsert.error) throw memberInsert.error;

  const { data: challenge, error: challengeError } = await admin
    .from("challenges")
    .insert({
      group_id: groupId,
      title: "kudos-test",
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
  if (challengeError) throw challengeError;

  const participantInsert = await admin.from("challenge_participants").insert([
    { challenge_id: challenge.id, user_id: userId, signed_at: new Date().toISOString() },
    { challenge_id: challenge.id, user_id: otherId, signed_at: new Date().toISOString() },
  ]);
  if (participantInsert.error) throw participantInsert.error;

  const { data: log, error: logError } = await admin
    .from("action_logs")
    .insert({
      challenge_id: challenge.id,
      user_id: otherId,
      activity_type: "gym",
      photo_url: "https://example.com/p.jpg",
      selected_keywords: ["펌핑"],
      shown_keywords: ["펌핑", "집중"],
      reroll_count: 0,
      ai_summary: "오늘도 해냈다.",
      prompt_version: "v1",
    })
    .select("id")
    .single();
  if (logError) throw logError;

  await page.goto(`/challenge/${challenge.id}`);
  await expect(page.getByText("오늘도 해냈다.")).toBeVisible({ timeout: 10_000 });

  const fireButton = page.getByRole("button", { name: /🔥/ }).first();
  await expect(fireButton).toBeEnabled();
  await fireButton.click();

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from("kudos")
          .select("emoji")
          .eq("action_log_id", log.id)
          .eq("user_id", userId);
        if (error) throw error;
        return (data ?? []).map((row) => row.emoji);
      },
      { timeout: 10_000, intervals: [300, 600, 1000] },
    )
    .toEqual(["🔥"]);
});
