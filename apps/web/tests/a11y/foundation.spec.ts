import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("foundation accessibility — mockup palette", () => {
  test("login page has no AA violations", async ({ page }) => {
    await page.goto("/login");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    if (results.violations.length > 0) {
      console.log(JSON.stringify(results.violations, null, 2));
    }
    expect(results.violations).toEqual([]);
  });
});
