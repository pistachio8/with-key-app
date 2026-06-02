import { resolve } from "node:path";
import { expect, test } from "./fixtures";

// Playwright runs each spec from the project root, so resolve against cwd
// rather than import.meta.url — this file loads under ts-node's CJS mode
// where import.meta is unavailable.
const PIXEL = resolve(process.cwd(), "tests/fixtures/pixel.jpg");
const HEIC = resolve(process.cwd(), "tests/fixtures/iphone.heic");

test("user uploads a photo and sees it in the challenge feed", async ({
  page,
  seedActiveChallenge,
}) => {
  const { challengeId } = await seedActiveChallenge();

  // /action 은 redirect → /challenge/<id>/action 으로 도착.
  await page.goto("/action");
  await expect(page).toHaveURL(/\/challenge\/.+\/action$/);
  await expect(page.getByRole("heading", { name: "AI 일기" })).toBeVisible();

  // dual entry empty state — hidden inputs 2개. 첫 번째(camera) 또는 두 번째(library) 어디든 setInputFiles 로 직접 주입 가능.
  await page.locator('input[type="file"]').first().setInputFiles(PIXEL);
  await expect(page.getByAltText("사진 미리보기")).toBeVisible();

  await page.getByRole("group", { name: "키워드 선택" }).getByRole("button").first().click();
  await page.getByRole("button", { name: "등록하기" }).click();

  // 결과 모달 — "확인" 클릭 후 챌린지 상세로 replace.
  await page.getByRole("button", { name: "확인" }).click();
  await expect(page).toHaveURL(new RegExp(`/challenge/${challengeId}$`));

  const card = page.locator("article").first();
  await expect(card).toBeVisible();
  const image = card.getByRole("img", { name: /인증 사진/ });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", /^https?:\/\//);
});

test("HEIC uploads are transcoded client-side and render on Chrome", async ({
  page,
  seedActiveChallenge,
}) => {
  const { challengeId } = await seedActiveChallenge();

  await page.goto("/action");
  await expect(page).toHaveURL(/\/challenge\/.+\/action$/);
  await expect(page.getByRole("heading", { name: "AI 일기" })).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles(HEIC);

  // Preview must appear — confirms the HEIC got transcoded client-side
  // before setting the blob URL. Chrome can't decode raw HEIC.
  const preview = page.getByAltText("사진 미리보기");
  await expect(preview).toBeVisible({ timeout: 10_000 });

  await page.getByRole("group", { name: "키워드 선택" }).getByRole("button").first().click();
  await page.getByRole("button", { name: "등록하기" }).click();
  await page.getByRole("button", { name: "확인" }).click();
  await expect(page).toHaveURL(new RegExp(`/challenge/${challengeId}$`));

  const card = page.locator("article").first();
  const image = card.getByRole("img", { name: /인증 사진/ });
  await expect(image).toBeVisible();

  // Storage path must end in .jpg — bucket policy now refuses HEIC.
  const src = await image.getAttribute("src");
  expect(src).toMatch(/\.jpg/i);
});
