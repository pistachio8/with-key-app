#!/usr/bin/env node
// scripts/harness-goal.mjs
// Agent Task 1개에서 /goal 실행 프롬프트를 파생 렌더한다 (harness:context 의 형제).
// SoT 는 task 파일 — 프롬프트는 저장하지 않는 파생 뷰가 기본이고, --write 로 로컬
// evals/tasks/<id>.goal.md (gitignored) 를 만들 수 있다.
// CLI: pnpm harness:goal <task-id> [--write]
import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  findTask,
  loadMigrationTasks,
  renderGoalPrompt,
  repoRoot,
  validateTask,
} from "./harness-lib.mjs";

const args = process.argv.slice(2);
const write = args.includes("--write");
const taskId = args.find((arg) => !arg.startsWith("--"));

if (!taskId) {
  const available = loadMigrationTasks()
    .map((task) => task.frontmatter.Task)
    .filter(Boolean)
    .join(", ");
  console.error("[harness:goal] Usage: pnpm harness:goal <task-id> [--write]");
  console.error(`[harness:goal] Available migration tasks: ${available || "none"}`);
  process.exit(1);
}

const task = findTask(taskId);
if (!task) {
  console.error(`[harness:goal] Task not found: ${taskId}`);
  process.exit(1);
}

const errors = validateTask(task);
if (errors.length > 0) {
  console.error(`[harness:goal] Task is invalid: ${task.frontmatter.Task}`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

const prompt = renderGoalPrompt(task);

if (write) {
  const outPath = task.absolutePath.replace(/\.md$/, ".goal.md");
  writeFileSync(outPath, `${prompt}\n`);
  console.error(`[harness:goal] wrote ${path.relative(repoRoot, outPath)} (gitignored 파생 뷰)`);
} else {
  console.log(prompt);
}
