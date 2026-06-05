#!/usr/bin/env node
import {
  loadMigrationTasks,
  validateTask,
  loadAcIndex,
  loadCitationFiles,
  validateAcTraceability,
} from "./harness-lib.mjs";

// Tier 1-A: Agent Task frontmatter·경로 추적성.
const tasks = loadMigrationTasks();
const taskErrors = tasks.flatMap((task) => validateTask(task));

// Tier 1-B: 상류 AC 추적성 — spine 인용이 PRD AC 로 resolve 되나(05 §7).
const acIndex = loadAcIndex();
const citationFiles = loadCitationFiles();
const acErrors = validateAcTraceability(acIndex, citationFiles);

const errors = [...taskErrors, ...acErrors];

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
