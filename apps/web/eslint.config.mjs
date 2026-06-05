import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // 파일 길이 budget — soft warning (CI lint job 차단 안 함).
  // 운영 데이터 4~8주 축적 후 error 승격 검토 (2026-05-13 spec §"후속 작업").
  {
    rules: {
      "max-lines": ["warn", { max: 800, skipBlankLines: true, skipComments: true }],
    },
  },
  // 테스트 파일은 케이스 나열식이 자연스럽게 길어질 수 있어 max-lines 비활성.
  {
    files: ["**/*.spec.ts", "**/*.spec.tsx", "**/*.test.ts", "**/*.test.tsx"],
    rules: { "max-lines": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
