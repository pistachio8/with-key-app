import { defineWorkspace } from "vitest/config";

// tests/integration/setup.ts hits a real Supabase → node env + serial.
// unit tests stay on jsdom (per-glob match).
export default defineWorkspace([
  {
    extends: "./vitest.config.ts",
    test: {
      name: "unit",
      environment: "jsdom",
      globals: true,
      environmentMatchGlobs: [
        ["**/*.spec.tsx", "jsdom"],
        ["**/_components/**", "jsdom"],
        ["**", "node"],
      ],
      include: ["src/**/*.{test,spec}.{ts,tsx}", "tests/unit/**/*.{test,spec}.{ts,tsx}"],
      exclude: ["tests/integration/**", "tests/e2e/**", "tests/a11y/**"],
      setupFiles: ["tests/unit/setup.ts"],
    },
  },
  {
    extends: "./vitest.config.ts",
    test: {
      name: "integration",
      environment: "node",
      globals: true,
      include: ["tests/integration/**/*.{test,spec}.ts"],
      pool: "forks",
      poolOptions: { forks: { singleFork: true } },
      hookTimeout: 30_000,
      testTimeout: 30_000,
      setupFiles: ["tests/integration/setup.ts"],
    },
  },
]);
