#!/usr/bin/env node
// pnpm harness:next [--json]
// 착수 가능 task 큐 출력 (spec orchestration-phase2 §C1). 판정 SoT 는 harness-lib resolveReadyTasks.
// --json: 오케스트레이터용 구조화 출력 { ready, unblockCandidates, humanGateBlocked, inProgress }.
// 기본: 사람용 요약 — waiting 까지 보여준다(JSON 은 spec 형태 고정, 사람 뷰는 진단용으로 더 넓게).
// unblockCandidates·humanGateBlocked 는 보고만 한다 — flip·게이트 해제는 사람 몫 (D6, 자동 아님).
import { loadMigrationTasks, resolveReadyTasks, resolveHumanGateBlocked } from "./harness-lib.mjs";

const tasks = loadMigrationTasks();
const { ready, waiting, inProgress, unblockCandidates } = resolveReadyTasks(tasks);
// humanGateBlocked: task 의존은 해소·비-task 게이트 잔존 (spec orchestration-phase3 §C1).
const humanGateBlocked = resolveHumanGateBlocked(tasks);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ ready, unblockCandidates, humanGateBlocked, inProgress }, null, 2));
  process.exit(0);
}

const depsLabel = (deps) =>
  deps.length === 0 ? "deps: none" : `deps: ${deps.map((d) => `${d.id}[${d.status}]`).join(" ")}`;

console.log(`# Harness Next

- Checked tasks: ${tasks.length}
- READY: ${ready.length} · WAITING: ${waiting.length} · in_progress: ${inProgress.length} · unblock candidates: ${unblockCandidates.length} · human-gate blocked: ${humanGateBlocked.length}
`);

if (ready.length > 0) {
  console.log("## READY — claim 가능 (pnpm harness:claim <ID>)\n");
  for (const entry of ready) {
    console.log(`- ${entry.id} (${depsLabel(entry.deps)}) → WP ${entry.wpBranch ?? "(미지정)"}`);
  }
  console.log("");
}

if (waiting.length > 0) {
  console.log("## WAITING — Depends-on 선행 미완\n");
  for (const entry of waiting) {
    console.log(`- ${entry.id} (${depsLabel(entry.deps)})`);
  }
  console.log("");
}

if (inProgress.length > 0) {
  console.log(`## in_progress\n\n${inProgress.map((id) => `- ${id}`).join("\n")}\n`);
}

if (unblockCandidates.length > 0) {
  console.log(
    `## Unblock candidates — task: blocker 전부 done (flip 은 사람 몫)\n\n${unblockCandidates
      .map((id) => `- ${id}`)
      .join("\n")}\n`,
  );
}

if (humanGateBlocked.length > 0) {
  console.log(
    `## Human-gate blocked — task 의존 해소·사람 게이트 잔존 (gate·spec·po·adr — 사람 몫)\n\n${humanGateBlocked
      .map((entry) => `- ${entry.id} (${entry.gates.join(" · ")})`)
      .join("\n")}\n`,
  );
}

if (
  ready.length +
    waiting.length +
    inProgress.length +
    unblockCandidates.length +
    humanGateBlocked.length ===
  0
) {
  console.log("open task 없음 — backlog 가 비어 있다.");
}
