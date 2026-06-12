#!/usr/bin/env node
// pnpm harness:claim EVAL-XXXX
// Status todo → in_progress 원자 전이. finalize 의 done flip 과 대칭 (spec orchestration-phase2 §C2).
// claim 가능 집합 = harness:next 의 ready 집합 — 오케스트레이터가 두 명령을 교차 검증 없이 쓴다.
// --force 없음: 우회가 필요한 정상 시나리오가 없다. 정말 필요하면 task 파일 직접 수정(파일이 SoT).
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadMigrationTasks, resolveReadyTasks, flipFrontmatterStatus } from "./harness-lib.mjs";

// claim 오케스트레이션 본체 — IO(파일 쓰기)를 주입받아 단위 테스트 가능 (runFinalize 패턴).
// 반환값 = 프로세스 exit code.
export function runClaim({ id, tasks, writeTaskFile, log = () => {} }) {
  const normalized = String(id).trim().toUpperCase();
  const task = tasks.find((t) => t.frontmatter.Task?.toUpperCase() === normalized);
  if (!task) {
    log(`[claim] task not found in evals/tasks/: ${id}`);
    return 1;
  }

  const status = task.frontmatter.Status;
  if (status === "in_progress") {
    log(`[claim] 거부 — 이미 in_progress (다른 세션이 claim 했을 수 있음): ${task.repoPath}`);
    return 1;
  }
  if (status === "blocked") {
    log(`[claim] 거부 — blocked. todo flip(해제)은 사람 몫 (D6): ${task.repoPath}`);
    return 1;
  }
  if (status !== "todo") {
    log(`[claim] 거부 — Status '${status}' 는 claim 대상이 아님: ${task.repoPath}`);
    return 1;
  }

  // todo 라도 Depends-on 선행 미완(WAITING)이면 거부 — ready 집합과 정확히 일치 (spec §C2 결정).
  const { ready, waiting } = resolveReadyTasks(tasks);
  if (!ready.some((entry) => entry.id?.toUpperCase() === normalized)) {
    const entry = waiting.find((item) => item.id?.toUpperCase() === normalized);
    const open = (entry?.deps ?? [])
      .filter((dep) => dep.status !== "done")
      .map((dep) => `${dep.id}[${dep.status}]`)
      .join(" ");
    log(`[claim] 거부 — WAITING: Depends-on 선행 미완 ${open || "(해석 불가)"}: ${task.repoPath}`);
    return 1;
  }

  const flipped = flipFrontmatterStatus(task.content, "in_progress");
  if (flipped === task.content) {
    // 거짓 성공 방지 — flip 이 no-op 이면(frontmatter Status 줄 부재 등) 기록 없이 중단한다.
    log(`[claim] Status flip 실패 — frontmatter 의 Status 줄을 찾지 못함: ${task.repoPath}`);
    return 1;
  }
  writeTaskFile(task.absolutePath, flipped);
  log(`[claim] Status todo → in_progress: ${task.repoPath}`);
  return 0;
}

function main() {
  const rawId = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  if (!rawId) {
    console.error("usage: pnpm harness:claim EVAL-XXXX");
    process.exit(1);
  }
  process.exit(
    runClaim({
      id: rawId,
      tasks: loadMigrationTasks(),
      writeTaskFile: (absolutePath, content) => writeFileSync(absolutePath, content),
      log: console.error,
    }),
  );
}

// node --test 가 import 할 때 main 이 돌지 않게 직접 실행시에만 구동.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
