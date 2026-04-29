import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

test("last signer transitions challenge to active", async ({ page, groupId }) => {
  // 1) Create a pending challenge with 2 participants: current user (unsigned)
  //    and a second user (already signed). The current user's sign via UI
  //    should fire sign_and_maybe_activate and flip the status to 'active'.
  const userId = await page.evaluate(async () => {
    const r = await fetch("/api/me");
    return r.ok ? ((await r.json()) as { id: string }).id : null;
  });
  if (!userId) throw new Error("cannot resolve current user id");

  const { data: ch, error: chErr } = await admin
    .from("challenges")
    .insert({
      group_id: groupId,
      title: "서명 전이 테스트",
      type: "fitness",
      goal_count: 3,
      duration_days: 7,
      penalty_amount: 3000,
      status: "pending",
    })
    .select("id")
    .single();
  if (chErr) throw chErr;

  // display_name is derived by trigger from split_part(email, '@', 1) and is
  // bounded by public.users.display_name (1..20 chars). Keep this local-part short.
  const shortSuffix = Math.random().toString(36).slice(2, 8);
  const otherEmail = `o-${shortSuffix}@test.local`;
  const { data: otherUser, error: userErr } = await admin.auth.admin.createUser({
    email: otherEmail,
    email_confirm: true,
  });
  if (userErr) throw userErr;
  if (!otherUser?.user) throw new Error("failed to create second user");

  await admin.from("group_members").insert({
    group_id: groupId,
    user_id: otherUser.user.id,
    role: "member",
  });
  await admin.from("challenge_participants").insert([
    { challenge_id: ch.id, user_id: userId, signed_at: null },
    {
      challenge_id: ch.id,
      user_id: otherUser.user.id,
      signed_at: new Date().toISOString(),
    },
  ]);

  // 2) Current user signs via UI.
  await page.goto("/pledge");
  await expect(page.getByText("서명 전이 테스트")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "서명하고 참여" }).click();

  // 3) Assert — poll status in DB (Server Action + redirect may race).
  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from("challenges")
          .select("status")
          .eq("id", ch.id)
          .single();
        if (error) throw error;
        return data?.status;
      },
      { timeout: 15_000, intervals: [500, 1000, 2000] },
    )
    .toBe("active");
});
