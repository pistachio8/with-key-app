#!/usr/bin/env node
import { loadMigrationTasks, validateTask } from "./harness-lib.mjs";

const tasks = loadMigrationTasks();
const violations = tasks.flatMap((task) => {
  return validateTask(task).map((message) => ({
    task: task.frontmatter.Task || task.repoPath,
    message,
  }));
});

const status = violations.length === 0 ? "PASS" : "FAIL";

console.log(`# Harness Drift Report

- Status: ${status}
- Scope: Tier 1 deterministic traceability
- Checked tasks: ${tasks.length}
- Violations: ${violations.length}

## Checks

- 0004+ eval task frontmatter required fields
- Track / Kind / Status enum validity
- blocked task Blocked-by presence
- Parent path existence
- Source Files path existence
- Target Files path existence

## Findings
`);

if (violations.length === 0) {
  console.log("No Tier 1 traceability drift found.");
  process.exit(0);
}

for (const violation of violations) {
  console.log(`- [${violation.task}] ${violation.message}`);
}

process.exit(1);
