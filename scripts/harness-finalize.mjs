#!/usr/bin/env node
// pnpm harness:finalize EVAL-XXXX [--force]
// task 완료 처리 3단계(Status flip → runs[] skeleton append → harness:check)를 한 명령으로 묶는다.
// git 커밋·푸시는 하지 않는다 — 자동 커밋은 사용자 확인 후(AGENTS.md §8).
// spec: docs/superpowers/specs/2026-06-12-harness-finalize-blocked-by-tokens.md §C3
import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  loadMigrationTasks,
  loadAgentResults,
  agentResultsPath,
  parseBlockers,
  flipFrontmatterStatus,
} from "./harness-lib.mjs";

// runs[] skeleton — 내용(summary·verification)은 구현 세션만 쓸 수 있으므로 <<FILL>> 로 형태만 보장.
// verification 은 기존 runs 관례인 { "local": { "<명령>": "<결과>" } } object 로 교체해 채운다.
// notes 는 선택 — 불요 시 채우는 시점에 필드를 삭제한다(잔존 <<FILL>> 은 Tier 1-D 에러).
export function buildRunSkeleton(task, date) {
  return {
    taskId: task.frontmatter.Task,
    date,
    track: task.frontmatter.Track,
    kind: task.frontmatter.Kind,
    status: "done",
    // 시도 횟수 — 재시도 후 성공이면 채움 시점에 실제 값으로 갱신 (spec orchestration-phase2 §C3, oneShot 대체).
    attempts: 1,
    summary: "<<FILL>>",
    verification: "<<FILL>>",
    notes: "<<FILL>>",
  };
}

export function entryHasPlaceholder(entry) {
  return JSON.stringify(entry).includes("<<FILL>>");
}

// frontmatter Status → done. 전이 프리미티브는 harness-lib(flipFrontmatterStatus)와 공유 —
// claim(todo→in_progress)과 같은 코드 경로라 동작이 갈라지지 않는다.
export function flipStatusToDone(content) {
  return flipFrontmatterStatus(content, "done");
}

// Blocked-by 의 done 아닌 task: 선행 — --force 로도 우회 불가 (spec §C3).
// Depends-on 은 검사하지 않는다(soft 순서 의존 — blocked 의미가 아니므로).
// 활성 목록에 없는 id(archive 은퇴)는 resolved 취급 — 우회 불가 거부가 영구 차단이 되지 않게.
export function findUnresolvedTaskBlockers(task, statusById) {
  return parseBlockers(task.frontmatter["Blocked-by"] || "")
    .filter((token) => token.type === "task")
    .filter((token) => {
      const status = statusById.get(token.value.toUpperCase());
      return status !== undefined && status !== "done";
    })
    .map((token) => token.value);
}

// 전제 검사 (spec §C3 step 1):
// in_progress → proceed / done+<<FILL>> entry → resume(채움 검증 재실행, --force 불요)
// done+완전 entry → verify-only(멱등 — 변경 없이 검증만) / done+entry 없음·todo·blocked → --force 요구.
export function decideFinalize({ status, entry, force }) {
  if (status === "in_progress") {
    return { action: "proceed" };
  }
  if (status === "done") {
    if (!entry) {
      return force
        ? { action: "proceed" }
        : {
            action: "refuse",
            reason: "Status done 인데 runs[] entry 없음 — skeleton append 는 --force 필요",
          };
    }
    return entryHasPlaceholder(entry) ? { action: "resume" } : { action: "verify-only" };
  }
  return force
    ? { action: "proceed" }
    : { action: "refuse", reason: `Status '${status}' — in_progress 가 아니면 --force 필요` };
}

function findRunEntries(results, normalizedId) {
  return (results.runs ?? []).filter(
    (run) => typeof run.taskId === "string" && run.taskId.toUpperCase() === normalizedId,
  );
}

// finalize 오케스트레이션 본체 — IO(파일 쓰기·check 실행)를 주입받아 단위 테스트 가능.
// 반환값 = 프로세스 exit code. main() 이 실제 IO 를 배선한다.
export function runFinalize({
  id,
  force,
  tasks,
  results,
  writeTaskFile,
  writeResults,
  runCheck,
  today,
  log = () => {},
}) {
  const normalized = String(id).trim().toUpperCase();
  const task = tasks.find((t) => t.frontmatter.Task?.toUpperCase() === normalized);
  if (!task) {
    log(`[finalize] task not found in evals/tasks/: ${id}`);
    return 1;
  }

  const entries = findRunEntries(results, normalized);
  // 동일 taskId 복수 entry 면 placeholder 잔존 entry 우선 — resume 판정이 완전한 첫 entry 에 가려지지 않게.
  const entry = entries.find((item) => entryHasPlaceholder(item)) ?? entries[0];
  const decision = decideFinalize({ status: task.frontmatter.Status, entry, force });

  if (decision.action === "refuse") {
    log(`[finalize] 거부 — ${decision.reason}`);
    return 1;
  }

  let appended = null;
  if (decision.action === "proceed") {
    // 미해소 task: 선행 거부는 --force 로도 우회 불가 (--force 는 Status 검사만 우회).
    const statusById = new Map(
      tasks.map((t) => [t.frontmatter.Task?.toUpperCase(), t.frontmatter.Status]),
    );
    const unresolved = findUnresolvedTaskBlockers(task, statusById);
    if (unresolved.length > 0) {
      log(
        `[finalize] 거부 — Blocked-by 미해소 task: 선행 ${unresolved.join(", ")} (done 아님) — --force 로도 우회 불가`,
      );
      return 1;
    }
    if (task.frontmatter.Status !== "done") {
      const flipped = flipStatusToDone(task.content);
      if (flipped === task.content) {
        // 거짓 성공 방지 — flip 이 no-op 이면(frontmatter Status 줄 부재 등) 기록 없이 중단한다.
        log(`[finalize] Status flip 실패 — frontmatter 의 Status 줄을 찾지 못함: ${task.repoPath}`);
        return 1;
      }
      writeTaskFile(task.absolutePath, flipped);
      log(`[finalize] Status → done: ${task.repoPath}`);
    }
    if (entries.length === 0) {
      appended = buildRunSkeleton(task, today);
      writeResults({ ...results, runs: [...(results.runs ?? []), appended] });
      log(`[finalize] runs[] skeleton append: ${normalized} (summary·verification 은 <<FILL>>)`);
    } else {
      log(`[finalize] runs[] entry 기존재 — append skip`);
    }
  } else {
    log(`[finalize] ${decision.action} — 파일 변경 없음, 검증만 수행`);
  }

  // step 4 — 검증. 영속 게이트는 Tier 1-D(placeholder = check 에러)가 담당, 이 exit 1 은 채움 루프 유도.
  const checkStatus = runCheck();
  const finalEntries = appended ? [...entries, appended] : entries;
  if (finalEntries.some((item) => entryHasPlaceholder(item))) {
    log(
      `[finalize] runs[] entry 에 <<FILL>> 잔존 — evals/results/agent-results.json 의 summary·verification 을 채우고(notes 불요 시 필드 삭제) pnpm harness:finalize ${normalized} 를 재실행하라`,
    );
    return 1;
  }
  return checkStatus;
}

function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const rawId = args.find((arg) => !arg.startsWith("--"));
  if (!rawId) {
    console.error("usage: pnpm harness:finalize EVAL-XXXX [--force]");
    process.exit(1);
  }

  // 로컬 날짜 YYYY-MM-DD — toLocaleDateString 은 ICU 빌드에 따라 포맷이 흔들려 수동 포맷.
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");

  process.exit(
    runFinalize({
      id: rawId,
      force,
      tasks: loadMigrationTasks(),
      results: loadAgentResults(),
      writeTaskFile: (absolutePath, content) => writeFileSync(absolutePath, content),
      writeResults: (data) => writeFileSync(agentResultsPath, `${JSON.stringify(data, null, 2)}\n`),
      runCheck: () =>
        spawnSync(process.execPath, ["scripts/harness-check.mjs"], { stdio: "inherit" }).status ??
        1,
      today,
      log: console.error,
    }),
  );
}

// node --test 가 import 할 때 main 이 돌지 않게 직접 실행시에만 구동.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
