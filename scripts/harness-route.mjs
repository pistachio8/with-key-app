#!/usr/bin/env node
// pnpm harness:route "<자연어 요청>" [--json]
//
// 자연어 요청을 작업 타입으로 분류하고 기존 워크플로로의 라우팅을 JSON 으로 출력한다.
// LLM 비호출 — deterministic 키워드 분류(scripts/harness-route-lib.mjs).
// 파일시스템을 변경하지 않는다(분류만). run 기록은 harness-intake.mjs.
//
// --json: stdout 에 JSON 만 (stderr 힌트 생략). 기본: JSON + stderr 1줄 힌트.

import { buildRoute, loadManifest } from "./harness-route-lib.mjs";

const argv = process.argv.slice(2);
const jsonOnly = argv.includes("--json");
const request = argv
  .filter((arg) => arg !== "--json")
  .join(" ")
  .trim();

if (!request) {
  console.error('usage: pnpm harness:route "<자연어 요청>" [--json]');
  process.exit(1);
}

const manifest = loadManifest();
const route = buildRoute(request, manifest);

console.log(JSON.stringify(route, null, 2));

if (!jsonOnly) {
  const hint = route.ambiguous
    ? `→ ambiguous(confidence ${route.confidence}) — 자동 진행 말고 사용자에게 작업 타입 확인`
    : `→ ${route.classification} → ${route.workflow} (state ${route.nextState}). 다음: pnpm harness:intake "${request}"`;
  console.error(hint);
}
