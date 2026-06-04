#!/usr/bin/env node
// scripts/harness-drift.mjs  →  pnpm harness:drift
// 7 drift 유형 점검 → evals/drift-reports/<date>.md (읽기전용 리포트).
// 계약: .agents/harness/DRIFT_CHECKLIST.md 의 7 유형 × Tier. 구현 예정(spec §8).
// 현재: SKELETON — 거짓 green 방지를 위해 배너 출력 후 0 종료.
console.error(
  "[harness:drift] SKELETON — 7 drift 점검 미구현 (spec §8 후속 코드 단계). 리포트 0건, exit 0.",
);
process.exit(0);
