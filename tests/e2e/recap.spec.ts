import { test, expect } from "@playwright/test";

// 로그인 상태에서 /recap 이 200 으로 응답하고 "주간 정산" 헤더가 렌더된다.
// 종료된 챌린지가 있든 없든 페이지는 크래시 없이 빈 상태 또는 결과 뷰를 보여준다.
test("recap page renders for authenticated user", async ({ page }) => {
  await page.goto("/recap");
  await expect(page.getByRole("heading", { name: "주간 정산" })).toBeVisible();
});
