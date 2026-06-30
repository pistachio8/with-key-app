#!/usr/bin/env node
// scripts/probe-context-footprint.mjs
//
// Rollout4 subagent-isolation probe 측정 instrument
// (docs/superpowers/plans/2026-06-26-rollout4-subagent-isolation-probe.md §측정 지표).
//
// 세션 JSONL 에서 orchestrator(메인 LLM) 컨텍스트 footprint proxy 세 가지를 한 번에 뽑는다:
//   · HWM        — turn별 context 점유(input+cache_read+cache_creation)의 최고치
//   · 축적 곡선   — turn별 점유 시퀀스 + 선형 기울기(slopePerTurn). bounded vs 선형 성장 판정용(relocation check)
//   · compaction — system/compact_boundary 레코드(trigger·pre·postTokens). 발생 시 보조 확증
// 더불어 treatment arm 측정을 위해 서브에이전트(Agent) 위임 집계도 뽑는다:
//   · subagents  — Agent tool_result.toolUseResult.{agentType,totalTokens,resolvedModel} (위임당 집계)
//
// 측정 근거(2026-06-26 실측): isSidechain:true 는 전 코퍼스 0건 → 서브에이전트 transcript 는 별도 파일이
// 아니라 부모 세션의 Agent tool_result 에 집계로만 실린다. 따라서 implementer 내부 곡선은 미기록이고,
// orchestrator(메인) 곡선 + 서브에이전트 집계만 측정한다(relocation 의 결정적 측은 메인 곡선이라 충분).
//
// 사용:
//   node scripts/probe-context-footprint.mjs <session.jsonl> [more.jsonl ...]   # 지정 세션
//   node scripts/probe-context-footprint.mjs                                    # with-key 프로젝트 전체 + 분포 요약
// 단일 파일 인자일 때만 per-turn `curve` 를 함께 출력(detail 모드).

import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PROJ = join(homedir(), ".claude/projects/-Users-ian-gitlab-with-key");
const args = process.argv.slice(2);
const files = args.length
  ? args
  : readdirSync(PROJ)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => join(PROJ, f));
const detail = args.length === 1;

const occ = (u) =>
  (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
const slope = (ys) => {
  const n = ys.length;
  if (n < 2) return 0;
  const sx = ((n - 1) * n) / 2;
  const sxx = ((n - 1) * n * (2 * n - 1)) / 6;
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxy = ys.reduce((a, y, i) => a + i * y, 0);
  const d = n * sxx - sx * sx;
  return d ? (n * sxy - sx * sy) / d : 0;
};
const pct = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;

const hwms = [];
for (const file of files) {
  const curve = [],
    compactions = [],
    subagents = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let r;
    try {
      r = JSON.parse(line);
    } catch {
      continue;
    }
    if (r.type === "assistant" && r.message?.usage && !r.isSidechain)
      curve.push(occ(r.message.usage));
    if (r.type === "system" && r.subtype === "compact_boundary")
      compactions.push(r.compactMetadata || {});
    const tur = r.toolUseResult;
    if (tur && tur.agentType)
      subagents.push({ agentType: tur.agentType, totalTokens: tur.totalTokens || 0 });
  }
  if (!curve.length && !subagents.length) continue;
  const hwm = curve.length ? Math.max(...curve) : 0;
  if (hwm) hwms.push(hwm);
  const out = {
    file: file.split("/").pop(),
    turns: curve.length,
    hwm,
    first: curve[0] ?? null,
    last: curve.at(-1) ?? null,
    slopePerTurn: Math.round(slope(curve)),
    compactions: compactions.map((c) => ({
      trigger: c.trigger,
      pre: c.preTokens,
      post: c.postTokens,
    })),
    subagents: {
      count: subagents.length,
      byType: subagents.reduce(
        (m, s) => ((m[s.agentType] = (m[s.agentType] || 0) + s.totalTokens), m),
        {},
      ),
    },
  };
  if (detail) out.curve = curve;
  console.log(JSON.stringify(out));
}

if (!detail && hwms.length) {
  const s = [...hwms].sort((a, b) => a - b);
  console.error(
    `\n[summary] sessions=${s.length} hwm median=${pct(s, 50)} p90=${pct(s, 90)} max=${s.at(-1)}`,
  );
}
