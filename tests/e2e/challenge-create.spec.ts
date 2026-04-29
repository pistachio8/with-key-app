import { test, expect } from "./fixtures";

test("user creates a challenge and lands on the detail page", async ({ page, groupId }) => {
  await page.goto(`/challenge/new?groupId=${groupId}`);
  await expect(page.getByRole("heading", { name: "새로운 서약서 만들기" })).toBeVisible();

  await page.getByRole("button", { name: "다음: 서약서 쓰기" }).click();

  await page.waitForURL(/\/challenge\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page).toHaveURL(/\/challenge\/[0-9a-f-]{36}$/);
});
