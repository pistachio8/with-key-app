import { chromium } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { seedSessionCookie } from "./helpers/auth-cookie";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

export default async function globalSetup() {
  const email = `e2e+${Date.now()}@test.local`;
  const baseURL = `http://127.0.0.1:${process.env.E2E_PORT ?? 3000}`;

  // Boot a browser, seed the cookie via the shared helper, verify /home loads.
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await seedSessionCookie(context, { email });

  const page = await context.newPage();
  await page.goto(baseURL + "/home");
  await page.waitForURL((u) => u.pathname === "/home", { timeout: 15_000 });

  await context.storageState({ path: "tests/e2e/.auth/user.json" });
  await browser.close();
}
