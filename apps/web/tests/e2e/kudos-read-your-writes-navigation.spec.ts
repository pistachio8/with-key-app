import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";

// Phase 3 (SNS cache plan v4) §Phase 3 E2E #1 — read-your-writes navigation.
// 시나리오: B(viewer) 로그인 → 그룹원 A 의 글에 🔥 클릭 → /me 로 navigation → 브라우저 뒤로 → 🔥 pressed state 유지.
// 회귀 차단 대상: kudos toggle 후 navigation/back 시 본인 state 가 사라지던 회귀(Phase 0 hotfix 도 부분 차단).

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
);

test("kudos pressed state persists after navigation + back", async ({ page, groupId }) => {
  const viewerId = await page.evaluate(async () => {
    const res = await fetch("/api/me");
    return res.ok ? ((await res.json()) as { id: string }).id : null;
  });
  if (!viewerId) throw new Error("cannot resolve current user id");

  // 그룹원 A (작성자) 생성 + 그룹 가입.
  const shortSuffix = Math.random().toString(36).slice(2, 8);
  const { data: authorUser, error: userError } = await admin.auth.admin.createUser({
    email: `a-${shortSuffix}@test.local`,
    email_confirm: true,
  });
  if (userError) throw userError;
  if (!authorUser?.user) throw new Error("failed to create teammate");
  const authorId = authorUser.user.id;

  const memberInsert = await admin.from("group_members").insert({
    group_id: groupId,
    user_id: authorId,
    role: "member",
  });
  if (memberInsert.error) throw memberInsert.error;

  const { data: challenge, error: challengeError } = await admin
    .from("challenges")
    .insert({
      group_id: groupId,
      title: "rsw-nav-test",
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
    { challenge_id: challenge.id, user_id: viewerId, signed_at: new Date().toISOString() },
    { challenge_id: challenge.id, user_id: authorId, signed_at: new Date().toISOString() },
  ]);
  if (participantInsert.error) throw participantInsert.error;

  const { data: log, error: logError } = await admin
    .from("action_logs")
    .insert({
      challenge_id: challenge.id,
      user_id: authorId,
      activity_type: "gym",
      photo_path: null,
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

  // 🔥 클릭 → DB row 도착까지 대기.
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
          .eq("user_id", viewerId);
        if (error) throw error;
        return (data ?? []).map((row) => row.emoji);
      },
      { timeout: 10_000, intervals: [300, 600, 1000] },
    )
    .toEqual(["🔥"]);

  // aria-pressed=true 인지 직접 assert (button label 도 "내가 누름" 포함).
  await expect(page.getByRole("button", { name: /🔥.*내가 누름/ })).toBeVisible();

  // navigation → /me → 뒤로.
  await page.goto("/me");
  await page.goBack();

  // 뒤로 후에도 pressed state 유지 확인 — read-your-writes 보장.
  await expect(page.getByText("오늘도 해냈다.")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /🔥.*내가 누름/ })).toBeVisible();
});
