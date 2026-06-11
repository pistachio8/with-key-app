import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

// @withkey/domain — 순수 TS 도메인 패키지(React · Next · Supabase · native 의존 0).
// apps/web 는 eslint-config-next 로 린트하지만 이 패키지는 프레임워크가 없으므로
// typescript-eslint recommended(비-type-aware)만 적용한다. 타입 게이트는 tsc(typecheck)가,
// 동작 게이트는 vitest(test)가 담당하고, eslint 는 any 금지·미사용 변수 등 코드 위생만 본다.
// 왜 비-type-aware: type-aware(parserOptions.project)는 tsc 와 검사가 겹치고 느리다 — 순수 로직
// 패키지에서 추가 가치가 작아 recommended 로 범위를 좁힌다.
export default defineConfig([
  globalIgnores(["dist/**", "node_modules/**", "*.tsbuildinfo"]),
  {
    files: ["src/**/*.ts"],
    extends: [...tseslint.configs.recommended],
    // 파일 길이 budget — apps/web 과 동일 컨벤션(soft warn, CI lint job 비차단).
    rules: {
      "max-lines": ["warn", { max: 800, skipBlankLines: true, skipComments: true }],
    },
  },
  // 테스트 파일은 케이스 나열식이 자연스럽게 길어질 수 있어 max-lines 비활성(apps/web 동일).
  {
    files: ["src/**/*.spec.ts"],
    rules: { "max-lines": "off" },
  },
]);
