#!/usr/bin/env node
import {
  loadMigrationTasks,
  loadKnownTaskIds,
  validateTask,
  validateGoalPromptLength,
  loadAcIndex,
  loadCitationFiles,
  validateAcTraceability,
  loadAgentResults,
  validateDoneRunParity,
} from "./harness-lib.mjs";

// Tier 1-A: Agent Task frontmatter·경로 추적성 + Blocked-by/Depends-on 토큰 문법.
const tasks = loadMigrationTasks();
const knownTaskIds = loadKnownTaskIds();
const taskErrors = tasks.flatMap((task) => validateTask(task, { knownTaskIds }));

// Tier 1-B: 상류 AC 추적성 — spine 인용이 PRD AC 로 resolve 되나(05 §7).
const acIndex = loadAcIndex();
const citationFiles = loadCitationFiles();
const acErrors = validateAcTraceability(acIndex, citationFiles);

// Tier 1-C: open task 의 /goal 프롬프트 길이 — 4000자 초과는 /goal 이 실행을 거부한다.
// frontmatter·경로가 깨진 task 는 렌더 자체가 무의미하므로 Tier 1-A 통과분만 잰다.
const goalErrors =
  taskErrors.length > 0 ? [] : tasks.flatMap((task) => validateGoalPromptLength(task));

// Tier 1-D: done↔runs 정합 — Status done 인 task 는 agent-results.json runs[] 기록이 있어야 한다.
// 무기록 done(가짜 완료)이 회귀 baseline 을 비우는 것을 차단한다. 도입 이전 done 은 GRANDFATHERED_DONE.
const runParityErrors = validateDoneRunParity(tasks, loadAgentResults());

const errors = [...taskErrors, ...acErrors, ...goalErrors, ...runParityErrors];

if (errors.length > 0) {
  console.error(`[harness:check] FAIL — ${errors.length} violation(s).`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.error(
  `[harness:check] PASS — ${tasks.length} migration task(s), ` +
    `${citationFiles.length} citation file(s) vs ${acIndex.ids.size} PRD AC id(s), 0 violation(s).`,
);
