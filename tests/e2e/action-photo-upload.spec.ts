import { resolve } from "node:path";
import { expect, test } from "./fixtures";

// Playwright runs each spec from the project root, so resolve against cwd
// rather than import.meta.url — this file loads under ts-node's CJS mode
// where import.meta is unavailable.
const PIXEL = resolve(process.cwd(), "tests/fixtures/pixel.jpg");

test("user uploads a photo and sees it in the challenge feed", async ({
  page,
  seedActiveChallenge,
}) => {
  const { challengeId } = await seedActiveChallenge();

  await page.goto("/action");
  await expect(page.getByRole("heading", { name: "키워드" })).toBeVisible();

  await page.getByRole("group", { name: "키워드 선택" }).getByRole("button").first().click();
  await page.locator('input[type="file"]').setInputFiles(PIXEL);
  await expect(page.getByAltText("사진 미리보기")).toBeVisible();

  await page.getByRole("button", { name: "인증하기" }).click();
  await expect(page).toHaveURL(/\/home/);

  await page.goto(`/challenge/${challengeId}`);
  const card = page.locator("article").first();
  await expect(card).toBeVisible();
  const image = card.getByRole("img", { name: /인증 사진/ });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", /^https?:\/\//);
});
