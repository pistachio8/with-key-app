#!/usr/bin/env node
// pnpm harness:intake "<자연어 요청>" [--json]
//
// intake 1 tick: 요청을 분류·라우팅하고 evals/runs/ 에 run 기록을 남긴 뒤,
// 다음에 "사람이 실행할 명령"을 안내한다. 실제 구현·claim·finalize·push 는 하지 않는다.
//
// run 파일 홈은 evals/runs/ — 인스턴스는 머시너리(.agents/) 밖 (ADR-0031).
// 타임스탬프는 bin 에서 생성한다(lib 은 순수 유지).
//
// --json: stdout 에 run 기록 JSON 만 (stderr Next 안내 생략).

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildRoute, loadManifest, repoRoot } from "./harness-route-lib.mjs";

const argv = process.argv.slice(2);
const jsonOnly = argv.includes("--json");
const request = argv
  .filter((arg) => arg !== "--json")
  .join(" ")
  .trim();

if (!request) {
  console.error('usage: pnpm harness:intake "<자연어 요청>" [--json]');
  process.exit(1);
}

const manifest = loadManifest();
const route = buildRoute(request, manifest);

const createdAt = new Date().toISOString();
const stamp = createdAt.replace(/[:.]/g, "-").replace("Z", "");
const slug =
  request
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "request";
const runId = `${stamp}-${route.classification}`;

const runRecord = {
  runId,
  request,
  classification: route.classification,
  confidence: route.confidence,
  ambiguous: route.ambiguous,
  workflow: route.workflow,
  targetWorkflowFile: route.targetWorkflowFile,
  taskCreation: route.taskCreation,
  state: route.nextState,
  domainCandidates: route.domainCandidates,
  requiredContext: route.requiredContext,
  humanGateTokens: route.humanGateTokens,
  blockedActions: route.blockedActions,
  maxRepairAttempts: route.maxRepairAttempts,
  allowedWriteScopes: route.allowedWriteScopes,
  repairAttempts: 0,
  humanGateReason: route.risk,
  createdAt,
};

const runsDir = path.join(repoRoot, "evals/runs");
mkdirSync(runsDir, { recursive: true });
const filePath = path.join(runsDir, `${stamp}-${route.classification}-${slug}.json`);
writeFileSync(filePath, `${JSON.stringify(runRecord, null, 2)}\n`);

if (jsonOnly) {
  console.log(JSON.stringify(runRecord, null, 2));
  process.exit(0);
}

const relRun = path.relative(repoRoot, filePath);
const lines = [];
lines.push(`# intake — ${route.classification} (confidence ${route.confidence})`);
lines.push(`- request: ${request}`);
lines.push(`- workflow: ${route.workflow ?? "(none)"} → state ${route.nextState ?? "(none)"}`);
lines.push(`- targetWorkflow: ${route.targetWorkflowFile ?? "(없음 — 경량 처리)"}`);
lines.push(`- domainCandidates: ${route.domainCandidates.join(", ") || "(none)"}`);
if (route.requiredContext.length > 0) {
  lines.push(`- requiredContext: ${route.requiredContext.join(", ")}`);
}
if (route.risk) {
  lines.push(`- ⚠️ risk: ${route.risk}`);
}
lines.push(`- run 기록: ${relRun}`);
lines.push("");

if (route.ambiguous) {
  lines.push("Next (분류 불확실 — 먼저 사람 확인):");
  lines.push("- 작업 타입이 맞는지 사용자에게 확인한 뒤 재실행");
} else {
  lines.push("Next:");
  lines.push(
    `- ${route.targetWorkflowFile ?? route.workflow} 절차를 따라 ${route.nextState} 부터 진행`,
  );
  if (route.taskCreation) {
    lines.push(`- (해당 task 가 없으면) ${route.taskCreation} 로 Agent Task 생성`);
  }
  lines.push("- pnpm harness:next → pnpm harness:claim <EVAL-ID> → pnpm harness:goal <EVAL-ID>");
  lines.push("- ⛔ push / PR 생성 / merge 는 사람 게이트(D6) — 자동 안 함");
}
console.error(lines.join("\n"));
