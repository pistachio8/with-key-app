import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("login surfaces Kakao OAuth primary path (magic-link hidden by default)", async ({ page }) => {
  await page.goto("/login");

  // PR #55 브랜딩 변경: h1 텍스트 "윗키" → <Image alt="from.with"> 로 교체.
  // accessible name 은 이미지 alt 에서 오므로 새 브랜드명으로 매칭한다.
  await expect(page.getByRole("heading", { level: 1, name: "from.with" })).toBeVisible();

  // ADR-0008: 카카오 OAuth 가 1차 로그인 경로. default 상태에서 버튼 노출 + 클릭 가능해야 한다.
  // 실제 OAuth 리다이렉트는 외부 service 라 E2E 에서 mock 없이 검증 불가 — visible/enabled 만 검증.
  const kakaoBtn = page.getByRole("button", { name: "카카오로 시작하기" });
  await expect(kakaoBtn).toBeVisible();
  await expect(kakaoBtn).toBeEnabled();

  // ADR-0008: 매직링크 UI 는 NEXT_PUBLIC_ENABLE_MAGIC_LINK=true 토글 시에만 노출.
  // default(false) 환경에서는 DOM 에 아예 렌더되지 않는다 — 비상 fallback 코드는 살아 있음.
  await expect(page.getByLabel("이메일")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "이메일로 로그인 링크 받기" })).toHaveCount(0);

  // 동의 안내는 카카오/매직링크 토글과 무관하게 항상 노출.
  await expect(
    page.getByText("이용약관 및 개인정보 수집·이용에 동의한 것으로 간주돼요"),
  ).toBeVisible();
});
