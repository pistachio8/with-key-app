#!/usr/bin/env node
// scripts/harness-check.mjs  →  pnpm harness:check
// 결정론 Tier 1 하네스 검증 (drift 아님 — 구조·추적성 lint).
// 계약(구현 예정 — spec 2026-06-04-harness-mvp-file-structure-design §8):
//   1. .agents/harness/config/harness.config.json 로드
//   2. evals/tasks/*.md frontmatter 파싱 → Track·Parent 존재 검사
//   3. Parent 인용(PRD AC / Story 파일) 경로 resolve (hallucinated-path = Traceability drift)
//   4. 위반 모으기 → stderr 출력 + process.exit(위반 ? 1 : 0)
// 현재: SKELETON — 아직 검사 없음. 거짓 green 방지를 위해 명시 배너 출력 후 0 종료.
console.error(
  "[harness:check] SKELETON — 추적성·구조 lint 미구현 (spec §8 후속 코드 단계). 검사 0건, exit 0.",
);
process.exit(0);
