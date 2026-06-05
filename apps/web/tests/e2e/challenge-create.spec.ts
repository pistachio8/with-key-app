import { test, expect } from "./fixtures";

// PR5 wizard: step1 챌린지 정보 + step2 서약서/서명 + step3 완료 시트.
// 캔버스 서명 자동화가 까다로워 step1 로딩 + step2 진입만 검증.
test("user can advance from step 1 to step 2 of the new-challenge wizard", async ({
  page,
  groupId,
}) => {
  await page.goto(`/challenge/new?groupId=${groupId}`);

  // step 1: 모킹업 §3-A 헤더 + step indicator
  await expect(page.getByRole("heading", { name: /어떤 약속을/ })).toBeVisible();
  await expect(page.getByText("1/2")).toBeVisible();

  // step 1 → step 2
  await page.getByRole("button", { name: "다음: 서약서 쓰기" }).click();

  // step 2: 서약서 확인 화면
  await expect(page.getByRole("heading", { name: "서약서를 확인해주세요" })).toBeVisible();
  await expect(page.getByText("2/2")).toBeVisible();
  await expect(page.getByRole("img", { name: "전자 서명 캔버스" })).toBeVisible();
});
