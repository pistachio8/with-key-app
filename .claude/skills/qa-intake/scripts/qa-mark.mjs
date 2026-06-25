#!/usr/bin/env node
// .claude/skills/qa-intake/scripts/qa-mark.mjs
//
// triage 가 끝난 feedback 행을 state(docs/QA_TRIAGE.intake.json)에 processed 로 기록한다.
// 여기 기록된 id 는 다음 qa-fetch 에서 다시 안 뜬다(중복 방지).
//
// 입력: stdin JSON 배열
//   [{ "id": "<uuid>", "verdict": "<verdict>", "triageId": "B10"?, "taskRef": "EVAL-0048"? }]
//   verdict: actionable-bug | actionable-feature | actionable-improvement
//          | noise | positive-confirmation | duplicate | already-fixed
//
// 호출은 triage 결과를 QA_TRIAGE.md 에 적은 "뒤에" 한다 — 도중에 멈춰도 미기록 행은
// 다음 fetch 에서 다시 떠서 유실되지 않는다.
//
// usage:
//   echo '[{"id":"...","verdict":"noise"}]' | node .claude/skills/qa-intake/scripts/qa-mark.mjs

import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const statePath = process.env.QA_INTAKE_STATE
  ? path.resolve(process.env.QA_INTAKE_STATE)
  : path.join(repoRoot, "docs/QA_TRIAGE.intake.json");

const stdin = readFileSync(0, "utf8").trim();
if (!stdin) {
  console.error("[qa-mark] empty stdin — pipe a JSON array of {id, verdict}.");
  process.exit(1);
}
let entries;
try {
  entries = JSON.parse(stdin);
} catch (e) {
  console.error("[qa-mark] stdin is not valid JSON:", e.message);
  process.exit(1);
}
if (!Array.isArray(entries)) {
  console.error("[qa-mark] expected a JSON array.");
  process.exit(1);
}

let state = { processed: {}, updatedAt: null };
if (existsSync(statePath)) {
  try {
    state = JSON.parse(readFileSync(statePath, "utf8"));
    state.processed ??= {};
  } catch (e) {
    console.error("[qa-mark] existing state unreadable, refusing to overwrite:", e.message);
    process.exit(2);
  }
}

const now = new Date().toISOString();
let added = 0;
for (const entry of entries) {
  if (!entry || !entry.id || !entry.verdict) {
    console.error("[qa-mark] skipping entry without id+verdict:", JSON.stringify(entry));
    continue;
  }
  state.processed[entry.id] = {
    verdict: entry.verdict,
    triageId: entry.triageId ?? null,
    taskRef: entry.taskRef ?? null,
    decidedAt: now,
  };
  added += 1;
}
state.updatedAt = now;
writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
console.error(
  `[qa-mark] recorded ${added} item(s) → ${path.relative(repoRoot, statePath)} ` +
    `(processed total ${Object.keys(state.processed).length})`,
);
