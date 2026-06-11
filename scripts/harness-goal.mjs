#!/usr/bin/env node
// scripts/harness-goal.mjs
// Agent Task 에서 /goal 실행 프롬프트를 파생 렌더한다 (harness:context 의 형제).
// SoT 는 task 파일 — 프롬프트는 저장하지 않는 파생 뷰가 기본이고, --write 로 로컬
// evals/tasks/<id>.goal.md (gitignored) 를 만들 수 있다.
//
// CLI (둘 다):
//   pnpm harness:goal <task-id> [<task-id> ...] [--write]   지정 task 렌더 (여러 개 가능, 기본 stdout)
//   pnpm harness:goal [--write]                              인자 없음 → *.goal.md 미생성 task 일괄 생성
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  findTask,
  GOAL_PROMPT_CHAR_LIMIT,
  loadMigrationTasks,
  renderGoalPrompt,
  repoRoot,
  validateTask,
} from "./harness-lib.mjs";

const args = process.argv.slice(2);
const write = args.includes("--write");
const taskIds = args.filter((arg) => !arg.startsWith("--"));

function goalPath(task) {
  return task.absolutePath.replace(/\.md$/, ".goal.md");
}

// task 1개 검증 후 렌더. 위반이 있으면 stderr 로 보고 + false 반환(배치에서 skip 신호).
function emitGoal(task, { toFile }) {
  const errors = validateTask(task);
  if (errors.length > 0) {
    console.error(`[harness:goal] Task is invalid: ${task.frontmatter.Task}`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    return false;
  }
  const prompt = renderGoalPrompt(task);
  // /goal 의 goal condition 하드 리밋 — 초과 프롬프트는 어차피 실행이 거부되므로 emit 하지 않는다.
  if (prompt.length > GOAL_PROMPT_CHAR_LIMIT) {
    console.error(
      `[harness:goal] ${task.frontmatter.Task}: prompt ${prompt.length} chars > ${GOAL_PROMPT_CHAR_LIMIT} (/goal 하드 리밋) — task 를 분할하거나 본문을 줄여라 (05 §9.4)`,
    );
    return false;
  }
  if (toFile) {
    const outPath = goalPath(task);
    writeFileSync(outPath, `${prompt}\n`);
    console.error(`[harness:goal] wrote ${path.relative(repoRoot, outPath)} (gitignored 파생 뷰)`);
  } else {
    console.log(prompt);
  }
  return true;
}

// ── 모드 1: 지정 task ID(들) 렌더 — --write 면 각 .goal.md, 아니면 stdout ──
if (taskIds.length > 0) {
  let ok = true;
  for (const taskId of taskIds) {
    const task = findTask(taskId);
    if (!task) {
      console.error(`[harness:goal] Task not found: ${taskId}`);
      ok = false;
      continue;
    }
    ok = emitGoal(task, { toFile: write }) && ok;
  }
  process.exit(ok ? 0 : 1);
}

// ── 모드 2: 인자 없음 → goal 미생성(*.goal.md 부재) task 일괄 생성 ──
// '없는 태스크들 채우기' 가 목적이라 배치는 stdout 으로 N개를 쏟지 않고 항상 파일로 쓴다.
const tasks = loadMigrationTasks();
if (tasks.length === 0) {
  console.error("[harness:goal] evals/tasks 에 task 가 없습니다.");
  process.exit(1);
}

const missing = tasks.filter((task) => !existsSync(goalPath(task)));
if (missing.length === 0) {
  console.error(
    `[harness:goal] 모든 task(${tasks.length}개)에 *.goal.md 가 이미 있습니다. 특정 task 재생성: pnpm harness:goal <task-id> --write`,
  );
  process.exit(0);
}

console.error(`[harness:goal] goal 미생성 ${missing.length}/${tasks.length}개 → 일괄 생성`);
let invalid = 0;
for (const task of missing) {
  if (!emitGoal(task, { toFile: true })) {
    invalid += 1;
  }
}
console.error(
  `[harness:goal] 완료 — 생성 ${missing.length - invalid}개${invalid ? `, skip(invalid) ${invalid}개` : ""}`,
);
process.exit(invalid > 0 ? 1 : 0);
