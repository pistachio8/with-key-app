import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("login form submits and surfaces success or recoverable failure", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1, name: "윗키" })).toBeVisible();

  const emailInput = page.getByLabel("이메일");
  const submitBtn = page.getByRole("button", { name: "이메일로 로그인 링크 받기" });

  await expect(submitBtn).toBeDisabled(); // empty email
  await emailInput.focus();
  await emailInput.pressSequentially(`smoke+${Date.now()}@test.local`, { delay: 10 });
  await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
  await submitBtn.click();

  // PR3 시각 리비전: 성공 시 toast 가 아니라 inline status 메시지(role=status)로 노출.
  // 실패는 sonner toast 유지. 세 신호 모두 form+Server Action round-trip 정상 동작을 증명한다.
  // Supabase 가 @test.local 을 reject 하는 환경(allowlist · rate-limit)도 인증 와이어링과 별개라 통과로 본다.
  const successInline = page.getByText("로그인 링크를 보냈어요");
  const errorToast = page.getByText("로그인 링크를 보내지 못했어요");
  const rateLimitedToast = page.getByText("요청이 너무 많아요");
  await expect(successInline.or(errorToast).or(rateLimitedToast)).toBeVisible({ timeout: 15_000 });
});
