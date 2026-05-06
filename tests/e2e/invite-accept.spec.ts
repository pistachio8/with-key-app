// tests/e2e/invite-accept.spec.ts
import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";
import { seedSessionCookie } from "./helpers/auth-cookie";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SECRET_KEY!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

test("owner creates invite, second user accepts and lands on /pledge", async ({
  page,
  groupId,
  browser,
}) => {
  // Owner view: navigate to their challenge page, click "친구 초대 링크 공유".
  // The trigger uses navigator.clipboard — read it back via page.evaluate.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  // Create a pending challenge under the seeded group so the invite flow has
  // a destination to wire participants into.
  const { data: challenge } = await admin
    .from("challenges")
    .insert({
      group_id: groupId,
      title: "e2e-invite",
      goal_count: 3,
      duration_days: 7,
      penalty_amount: 3000,
      status: "pending",
    })
    .select("id")
    .single();
  if (!challenge) throw new Error("failed to seed challenge");

  await page.goto(`/challenge/${challenge.id}`);
  await page.getByRole("button", { name: "친구 초대 링크 공유" }).click();

  // Wait for toast, then read clipboard.
  await expect(page.getByText("초대 링크를 복사했어요")).toBeVisible({ timeout: 10_000 });
  const inviteUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(inviteUrl).toMatch(/\/invite\//);

  // Second user: seed a fresh @supabase/ssr cookie onto a new context. The
  // dev-login route is disabled in production (playwright uses `pnpm start`),
  // so we mirror the cookie-injection path from global-setup.
  const joinerEmail = `joiner-${Date.now()}@test.local`;
  const joinerContext = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  try {
    const { userId: joinerId, cleanup } = await seedSessionCookie(joinerContext, {
      email: joinerEmail,
    });
    try {
      const joinerPage = await joinerContext.newPage();
      // Session cookie already set — direct navigation lands on the authed page.
      await joinerPage.goto(inviteUrl);
      await expect(joinerPage.getByRole("button", { name: "참여하고 서명하러 가기" })).toBeVisible({
        timeout: 15_000,
      });
      await joinerPage.getByRole("button", { name: "참여하고 서명하러 가기" }).click();

      // Joiner should land on /pledge and see the pending pledge for signing.
      await expect(joinerPage).toHaveURL(/\/pledge$/, { timeout: 10_000 });
      await expect(joinerPage.getByText("e2e-invite")).toBeVisible({ timeout: 10_000 });

      // Direct DB check: joiner is group_members row AND participant of pending challenge.
      const { count: memberCount } = await admin
        .from("group_members")
        .select("*", { count: "exact", head: true })
        .eq("group_id", groupId)
        .eq("user_id", joinerId);
      expect(memberCount).toBe(1);

      const { count: partCount } = await admin
        .from("challenge_participants")
        .select("*", { count: "exact", head: true })
        .eq("challenge_id", challenge.id)
        .eq("user_id", joinerId);
      expect(partCount).toBe(1);
    } finally {
      await cleanup();
    }
  } finally {
    await joinerContext.close();
  }
});
