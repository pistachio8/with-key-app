import { test, expect } from "@playwright/test";

// PR7 부터 /settings 는 /me 로 redirect — 푸시 설정은 /me NotificationCard 안에서 렌더.
// PushSettings 컴포넌트가 미지원 배너 또는 실 토글 둘 중 하나를 반드시 렌더한다
// (서버가 prefs/구독 상태를 성공적으로 페치해 client 로 넘긴 증거).
//
// 실제 구독 배선까지 검증하려면 Firefox/Chromium 별도로 notification permission
// 허용이 필요한데, Playwright 의 browser context 에서 SW 등록 + FCM 응답까지
// 검증하는 건 integration 에서 이미 다루므로 여기서는 UI 렌더 + 서버 fetch 경로만
// 본다.
test("me page renders push section for authenticated user", async ({ page }) => {
  // /settings 진입 → /me 로 redirect 되는 경로도 함께 검증.
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByRole("heading", { level: 1, name: "마이페이지" })).toBeVisible();

  // NotificationCard 헤더 + PushSettings 내부 헤더 (둘 다 보여야 함).
  await expect(page.getByRole("heading", { name: "알림 설정" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "푸시 알림" })).toBeVisible();

  const startSwitch = page.getByRole("switch", { name: "시작 알림" });
  const unsupportedBanner = page.getByText(/이 브라우저는 푸시 알림을 지원하지 않/);
  const detecting = page.getByText("지원 여부 확인 중…");
  await expect(startSwitch.or(unsupportedBanner).or(detecting)).toBeVisible({
    timeout: 10_000,
  });
});
