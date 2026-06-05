#!/usr/bin/env node
import { loadMigrationTasks, validateTask } from "./harness-lib.mjs";

const tasks = loadMigrationTasks();
const errors = tasks.flatMap((task) => validateTask(task));

if (errors.length > 0) {
  console.error(`[harness:check] FAIL — ${errors.length} violation(s).`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.error(
  `[harness:check] PASS — checked ${tasks.length} migration task(s), ${errors.length} violation(s).`,
);
