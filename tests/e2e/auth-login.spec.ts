import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("login form submits and surfaces a toast", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1, name: "윗키" })).toBeVisible();

  const emailInput = page.getByLabel("이메일");
  const submitBtn = page.getByRole("button", { name: "이메일로 로그인 링크 받기" });

  await expect(submitBtn).toBeDisabled(); // empty email
  await emailInput.focus();
  await emailInput.pressSequentially(`smoke+${Date.now()}@test.local`, { delay: 10 });
  await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
  await submitBtn.click();

  // Success, upstream_error, or rate_limited toast — all three prove the
  // form+Server Action round-trip works. Supabase may reject @test.local
  // domains (rate-limit or allowlist), which is independent of auth wiring.
  const successToast = page.getByText("로그인 링크를 이메일로 보냈어요");
  const errorToast = page.getByText("로그인 링크를 보내지 못했어요");
  const rateLimitedToast = page.getByText("요청이 너무 많아요");
  await expect(successToast.or(errorToast).or(rateLimitedToast)).toBeVisible({ timeout: 15_000 });
});
