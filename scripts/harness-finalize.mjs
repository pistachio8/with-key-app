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
    summary: "<<FILL>>",
    verification: "<<FILL>>",
    notes: "<<FILL>>",
  };
}

export function entryHasPlaceholder(entry) {
  return JSON.stringify(entry).includes("<<FILL>>");
}

// frontmatter 블록(첫 --- ~ 다음 ---) 안의 Status 줄만 done 으로 바꾼다 — 본문 "Status:" 오염 방지.
export function flipStatusToDone(content) {
  const lines = content.split("\n");
  if (lines[0].replace(/^﻿/, "") !== "---") {
    return content;
  }
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === "---") {
      break;
    }
    if (/^Status:/.test(lines[index])) {
      lines[index] = "Status: done";
      break;
    }
  }
  return lines.join("\n");
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

function findRunEntry(results, normalizedId) {
  return (results.runs ?? []).find(
    (run) => typeof run.taskId === "string" && run.taskId.toUpperCase() === normalizedId,
  );
}

function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const rawId = args.find((arg) => !arg.startsWith("--"));
  if (!rawId) {
    console.error("usage: pnpm harness:finalize EVAL-XXXX [--force]");
    process.exit(1);
  }

  const tasks = loadMigrationTasks();
  const id = rawId.trim().toUpperCase();
  const task = tasks.find((t) => t.frontmatter.Task?.toUpperCase() === id);
  if (!task) {
    console.error(`[finalize] task not found in evals/tasks/: ${rawId}`);
    process.exit(1);
  }

  const results = loadAgentResults();
  const entry = findRunEntry(results, id);
  const decision = decideFinalize({ status: task.frontmatter.Status, entry, force });

  if (decision.action === "refuse") {
    console.error(`[finalize] 거부 — ${decision.reason}`);
    process.exit(1);
  }

  if (decision.action === "proceed") {
    // 미해소 task: 선행 거부는 --force 로도 우회 불가 (--force 는 Status 검사만 우회).
    const statusById = new Map(
      tasks.map((t) => [t.frontmatter.Task?.toUpperCase(), t.frontmatter.Status]),
    );
    const unresolved = findUnresolvedTaskBlockers(task, statusById);
    if (unresolved.length > 0) {
      console.error(
        `[finalize] 거부 — Blocked-by 미해소 task: 선행 ${unresolved.join(", ")} (done 아님) — --force 로도 우회 불가`,
      );
      process.exit(1);
    }
    if (task.frontmatter.Status !== "done") {
      writeFileSync(task.absolutePath, flipStatusToDone(task.content));
      console.error(`[finalize] Status → done: ${task.repoPath}`);
    }
    if (!entry) {
      const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD (로컬 날짜)
      results.runs = [...(results.runs ?? []), buildRunSkeleton(task, today)];
      writeFileSync(agentResultsPath, `${JSON.stringify(results, null, 2)}\n`);
      console.error(`[finalize] runs[] skeleton append: ${id} (summary·verification 은 <<FILL>>)`);
    } else {
      console.error(`[finalize] runs[] entry 기존재 — append skip`);
    }
  } else {
    console.error(`[finalize] ${decision.action} — 파일 변경 없음, 검증만 수행`);
  }

  // step 4 — 검증. 영속 게이트는 Tier 1-D(placeholder = check 에러)가 담당, 이 exit 1 은 채움 루프 유도.
  const check = spawnSync("node", ["scripts/harness-check.mjs"], { stdio: "inherit" });
  const after = findRunEntry(loadAgentResults(), id);
  if (after && entryHasPlaceholder(after)) {
    console.error(
      `[finalize] runs[] entry 에 <<FILL>> 잔존 — evals/results/agent-results.json 의 summary·verification 을 채우고(notes 불요 시 필드 삭제) pnpm harness:finalize ${id} 를 재실행하라`,
    );
    process.exit(1);
  }
  process.exit(check.status ?? 1);
}

// node --test 가 import 할 때 main 이 돌지 않게 직접 실행시에만 구동.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
