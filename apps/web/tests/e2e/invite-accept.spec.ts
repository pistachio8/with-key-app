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
  // PR5: 초대 링크는 챌린지 상세의 "정보" 탭 안.
  await page.getByRole("tab", { name: "정보" }).click();
  await page.getByRole("button", { name: "친구 초대 링크 공유" }).click();

  // Wait for toast, then read clipboard.
  await expect(page.getByText("초대 링크를 복사했어요")).toBeVisible({ timeout: 10_000 });
  // Clipboard payload is "<메시지>\n\n<URL>" (카톡 등에 줄바꿈을 강제하기 위해 묶어서 복사).
  // 본 E2E 는 URL 자체만 필요하므로 정규식으로 추출.
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  const urlMatch = clipboardText.match(/https?:\/\/\S+\/invite\/\S+/);
  if (!urlMatch) throw new Error(`invite URL not found in clipboard: ${clipboardText}`);
  const inviteUrl = urlMatch[0];

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
      await expect(joinerPage.getByRole("button", { name: "참여하기" })).toBeVisible({
        timeout: 15_000,
      });
      await joinerPage.getByRole("button", { name: "참여하기" }).click();

      // ADR-0002: pledge 는 /challenge/[id]/pledge sub-route.
      // accept-form 이 /pledge 로 push → /pledge 가 본인의 pending pledge 로 redirect.
      await expect(joinerPage).toHaveURL(/\/challenge\/[0-9a-f-]{36}\/pledge$/, {
        timeout: 10_000,
      });
      // 모킹업 §3-C — pledge 페이지의 PledgePreviewCard 는 챌린지 제목을 <h3.t-h3>에 렌더.
      // cacheComponents Activity 가 직전 /invite/[token] 의 ShareCard 를 hidden DOM 으로
      // 보존해 getByText 가 2개 매치 (strict mode violation). heading role + level=3 으로
      // 좁혀 pledge 페이지의 현재 가시 요소만 매칭.
      await expect(joinerPage.getByRole("heading", { name: "e2e-invite", level: 3 })).toBeVisible({
        timeout: 10_000,
      });

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
