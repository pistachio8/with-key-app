import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

test("author sees unread badge + home dot, both clear after /feed visit", async ({
  page,
  groupId,
}) => {
  const userId = await page.evaluate(async () => {
    const res = await fetch("/api/me");
    return res.ok ? ((await res.json()) as { id: string }).id : null;
  });
  if (!userId) throw new Error("cannot resolve current user id");

  // 2nd user (kudos giver)
  const shortSuffix = Math.random().toString(36).slice(2, 8);
  const { data: giver, error: giverErr } = await admin.auth.admin.createUser({
    email: `g-${shortSuffix}@test.local`,
    email_confirm: true,
  });
  if (giverErr) throw giverErr;
  if (!giver?.user) throw new Error("failed to create giver");
  const giverId = giver.user.id;

  await admin
    .from("group_members")
    .insert({ group_id: groupId, user_id: giverId, role: "member" });

  const { data: ch, error: chErr } = await admin
    .from("challenges")
    .insert({
      group_id: groupId,
      title: "badge-test",
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
  if (chErr) throw chErr;

  await admin.from("challenge_participants").insert([
    { challenge_id: ch.id, user_id: userId, signed_at: new Date().toISOString() },
    { challenge_id: ch.id, user_id: giverId, signed_at: new Date().toISOString() },
  ]);

  const { data: log, error: logErr } = await admin
    .from("action_logs")
    .insert({
      challenge_id: ch.id,
      user_id: userId,
      activity_type: "gym",
      photo_path: null,
      selected_keywords: ["펌핑"],
      shown_keywords: ["펌핑", "하체데이"],
      reroll_count: 0,
      ai_summary: "오늘 기록 남겨요",
      template_fallback: false,
      prompt_version: "v3",
    })
    .select("id")
    .single();
  if (logErr) throw logErr;

  // 배지 테스트의 baseline: 이 테스트가 돌기 전에 뷰어가 어딘가에서 markFeedSeen 을 쳤을 수도 있으므로
  // 명시적으로 last_feed_seen_at = null 로 재설정한 뒤 giver 가 kudos 를 남긴다.
  await admin.from("users").update({ last_feed_seen_at: null }).eq("id", userId);
  await admin.from("kudos").insert({
    action_log_id: log.id,
    user_id: giverId,
    emoji: "🔥",
  });

  // --- /home 진입 시 홈 탭 dot 보임 ---
  await page.goto("/home");
  await expect(page.getByTestId("home-unread-dot")).toBeVisible();

  // --- /feed 진입 시 '새 응원 1건' 배지 ---
  await page.goto("/feed");
  await expect(page.getByText(/새 응원 1건/)).toBeVisible();

  // --- /home 재진입 시 dot 사라짐 ---
  await page.goto("/home");
  await expect(page.getByTestId("home-unread-dot")).toHaveCount(0);

  // Cleanup — fixture 가 groups/challenges 는 지우지만 이 테스트가 생성한 challenge·log·kudos 는 별도 관리.
  await admin.from("kudos").delete().eq("action_log_id", log.id);
  await admin.from("action_logs").delete().eq("id", log.id);
  await admin.from("challenge_participants").delete().eq("challenge_id", ch.id);
  await admin.from("challenges").delete().eq("id", ch.id);
});
