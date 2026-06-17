#!/usr/bin/env node
import {
  loadMigrationTasks,
  loadKnownTaskIds,
  validateTask,
  validateGoalPromptLength,
  loadAcIndex,
  loadCitationFiles,
  validateAcTraceability,
  loadAgentResults,
  validateDoneRunParity,
  validateRunAttempts,
} from "./harness-lib.mjs";
import { loadManifest, validateManifestTargets } from "./harness-route-lib.mjs";

// Tier 1-A: Agent Task frontmatter·경로 추적성 + Blocked-by/Depends-on 토큰 문법.
const tasks = loadMigrationTasks();
const knownTaskIds = loadKnownTaskIds();
const taskErrors = tasks.flatMap((task) => validateTask(task, { knownTaskIds }));

// Tier 1-B: 상류 AC 추적성 — spine 인용이 PRD AC 로 resolve 되나(05 §7).
const acIndex = loadAcIndex();
const citationFiles = loadCitationFiles();
const acErrors = validateAcTraceability(acIndex, citationFiles);

// Tier 1-C: open task 의 /goal 프롬프트 길이 — 4000자 초과는 /goal 이 실행을 거부한다.
// frontmatter·경로가 깨진 task 는 렌더 자체가 무의미하므로 Tier 1-A 통과분만 잰다.
const goalErrors =
  taskErrors.length > 0 ? [] : tasks.flatMap((task) => validateGoalPromptLength(task));

// Tier 1-D: done↔runs 정합 — Status done 인 task 는 agent-results.json runs[] 기록이 있어야 한다.
// 무기록 done(가짜 완료)이 회귀 baseline 을 비우는 것을 차단한다. 도입 이전 done 은 GRANDFATHERED_DONE.
const agentResults = loadAgentResults();
const runParityErrors = validateDoneRunParity(tasks, agentResults);

// Tier 1-E: runs[] attempts — 신규 엔트리는 양의 정수 필수, oneShot 잔존 금지 (oneShot 대체).
// pass@3 oracle 의 기계 판정 입력 — 비검증 필드(oneShot)가 조용히 누락된 실증의 재발 방지.
const attemptsErrors = validateRunAttempts(agentResults);

// Tier 1-F: route-manifest 포인터 정합 — 요청 라우터가 가리키는 워크플로 파일이 실존하나(ADR-0031 drift 표면).
// route-manifest 는 markdown 워크플로를 가리키는 얇은 index 라, 대상이 이동·삭제되면 끊긴다.
const manifestErrors = validateManifestTargets(loadManifest());

const errors = [
  ...taskErrors,
  ...acErrors,
  ...goalErrors,
  ...runParityErrors,
  ...attemptsErrors,
  ...manifestErrors,
];

if (errors.length > 0) {
  console.error(`[harness:check] FAIL — ${errors.length} violation(s).`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.error(
  `[harness:check] PASS — ${tasks.length} migration task(s), ` +
    `${citationFiles.length} citation file(s) vs ${acIndex.ids.size} PRD AC id(s), 0 violation(s).`,
);
