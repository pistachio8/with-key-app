#!/usr/bin/env node
import {
  describeFile,
  findTask,
  formatPathList,
  loadMigrationTasks,
  validateTask,
} from "./harness-lib.mjs";

const taskId = process.argv[2];

if (!taskId) {
  const available = loadMigrationTasks()
    .map((task) => task.frontmatter.Task)
    .filter(Boolean)
    .join(", ");
  console.error("[harness:context] Usage: pnpm harness:context <task-id>");
  console.error(`[harness:context] Available migration tasks: ${available || "none"}`);
  process.exit(1);
}

const task = findTask(taskId);
if (!task) {
  console.error(`[harness:context] Task not found: ${taskId}`);
  process.exit(1);
}

const errors = validateTask(task);
if (errors.length > 0) {
  console.error(`[harness:context] Task is invalid: ${task.frontmatter.Task}`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

const inspected = uniquePaths([...task.parentPaths, ...task.sourcePaths, ...task.targetPaths])
  .map((item) => `- ${item.display} — ${describeFile(item)}`)
  .join("\n");

console.log(`# Harness Context: ${task.frontmatter.Task}

Task file: ${task.repoPath}
Track: ${task.frontmatter.Track}
Kind: ${task.frontmatter.Kind}
Status: ${task.frontmatter.Status}

## Parent Paths
${formatPathList(task.parentPaths)}

## Source Files to Inspect
${formatPathList(task.sourcePaths)}

## Target Files
${formatPathList(task.targetPaths)}

## Verification Commands
${task.verificationCommands || "(none listed)"}

## Read First
${inspected}
`);

function uniquePaths(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    if (seen.has(item.absolutePath)) {
      continue;
    }
    seen.add(item.absolutePath);
    output.push(item);
  }
  return output;
}
