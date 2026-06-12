#!/usr/bin/env node
import { execSync } from "node:child_process";
import {
  loadMigrationTasks,
  loadKnownTaskIds,
  validateTask,
  detectStaleStatus,
  detectUnblockCandidates,
  loadAgentResults,
} from "./harness-lib.mjs";

const tasks = loadMigrationTasks();
const knownTaskIds = loadKnownTaskIds();
const violations = tasks.flatMap((task) => {
  return validateTask(task, { knownTaskIds }).map((message) => ({
    task: task.frontmatter.Task || task.repoPath,
    message,
  }));
});

// 머지된 Work Package 브랜치 집합 — stale status 휴리스틱의 신호.
// git 부재·shallow clone 이면 빈 집합 → 경고 없음(graceful). warn 전용이라 무해.
function loadMergedBranches() {
  try {
    const out = execSync("git log --merges --format=%s", { encoding: "utf8" });
    const set = new Set();
    for (const match of out.matchAll(/feat\/[a-z0-9][a-z0-9-]*/g)) {
      set.add(match[0]);
    }
    return set;
  } catch {
    return new Set();
  }
}

const mergedBranches = loadMergedBranches();
const warnings = tasks.flatMap((task) =>
  detectStaleStatus(task, mergedBranches).map((message) => ({
    task: task.frontmatter.Task || task.repoPath,
    message,
  })),
);

const unblockCandidates = detectUnblockCandidates(tasks);

// pass@3 size oracle (advisory · spec orchestration-phase2 §C3): attempts >= 3 이면 성공이어도
// task 크기 경고. abandoned 는 이미 사람이 분할을 결정한 결과라 대상이 아니다.
const sizeWarnings = (loadAgentResults().runs ?? [])
  .filter(
    (run) => Number.isInteger(run.attempts) && run.attempts >= 3 && run.status !== "abandoned",
  )
  .map(
    (run) =>
      `${run.taskId}: attempts ${run.attempts} ≥ 3 — pass@3 oracle 신호, task 분할 검토 (D5)`,
  );

const status = violations.length === 0 ? "PASS" : "FAIL";

console.log(`# Harness Drift Report

- Status: ${status}
- Scope: Tier 1 deterministic traceability
- Checked tasks: ${tasks.length}
- Violations: ${violations.length}
- Stale-status warnings: ${warnings.length}
- Unblock candidates: ${unblockCandidates.length}
- Size-oracle warnings: ${sizeWarnings.length}

## Checks

- 0004+ eval task frontmatter required fields
- Track / Kind / Status enum validity
- blocked task Blocked-by presence + Blocked-by/Depends-on 토큰 문법(≥1 [type:value]·타입 5종·task: 존재)
- Parent path existence
- Source Files path existence
- Target Files path existence
- (warn) Status todo/in_progress 인데 WP 브랜치 머지됨 — stale status
- (warn) blocked task 의 task: blocker 전부 done — 해제 후보
- (warn) runs[] attempts ≥ 3 — pass@3 size oracle, task 분할 검토

## Findings
`);

if (violations.length === 0) {
  console.log("No Tier 1 traceability drift found.");
} else {
  for (const violation of violations) {
    console.log(`- [${violation.task}] ${violation.message}`);
  }
}

if (warnings.length > 0) {
  console.log(`
## Stale Status Warnings (advisory — exit code 비영향)

WP 브랜치가 머지됐는데 Status 가 아직 todo/in_progress 인 task. 머지 PR 에서 Status 갱신을 누락한 흔적.
`);
  for (const warning of warnings) {
    console.log(`- [${warning.task}] ${warning.message}`);
  }
}

if (unblockCandidates.length > 0) {
  console.log(`
## Unblock Candidates (advisory — exit code 비영향)

blocked task 의 Blocked-by task: 토큰이 전부 done — todo flip 검토 대상. gate/adr/spec/po 토큰이 남은 task 는 대상이 아니다(해제 판단이 사람 몫).
`);
  for (const message of unblockCandidates) {
    console.log(`- ${message}`);
  }
}

if (sizeWarnings.length > 0) {
  console.log(`
## Size Oracle Warnings (advisory — exit code 비영향)

attempts ≥ 3 인 run — pass@3 oracle(D5) 신호. 성공했어도 task 가 너무 컸다는 뜻이므로 후속 분해 시 참고. 자동 분할 아님.
`);
  for (const message of sizeWarnings) {
    console.log(`- ${message}`);
  }
}

// 경고는 exit code 에 영향 없음 — 구조적 violation 만 FAIL.
process.exit(violations.length === 0 ? 0 : 1);
