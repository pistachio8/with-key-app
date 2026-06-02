import { test, expect } from "@playwright/test";

// ADR-0002: /recap 별도 라우트 폐기, challenge sub-route 로 이동.
// 옛 /recap 진입 시 본인 최근 ended challenge 로 redirect; 없으면 /home.
// 테스트 fixture 에는 종료된 챌린지가 없어 /home 으로 redirect 되는 것을 검증.
test("legacy /recap redirects to /home when no ended challenges exist", async ({ page }) => {
  await page.goto("/recap");
  await expect(page).toHaveURL(/\/home$/, { timeout: 10_000 });
});
