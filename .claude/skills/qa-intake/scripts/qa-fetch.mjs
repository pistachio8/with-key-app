#!/usr/bin/env node
// .claude/skills/qa-intake/scripts/qa-fetch.mjs
//
// feedback 테이블에서 아직 triage 안 된 행만 읽어 JSON 으로 출력한다 (read-only).
//
// 읽기 경로: SUPABASE_SECRET_KEY(service_role 등가, RLS 우회). feedback 는 INSERT-only RLS 라
// publishable 키로는 못 읽는다(ADR-0035). 호출 시 `--env-file=.env.local` 로 env 를 주입한다.
// 같은 env 만 주면 cron(무인) 환경에서도 그대로 동작한다 — MCP 토큰 의존 없음.
//
// dedup 권위(authority): state 파일(docs/QA_TRIAGE.intake.json)의 processed id 집합.
// 이 스크립트는 state 를 쓰지 않는다 — triage 후 qa-mark.mjs 가 기록한다(read/write 분리).
//
// usage:
//   node --env-file=.env.local .claude/skills/qa-intake/scripts/qa-fetch.mjs [--all] [--limit N]
//     --all     : processed 무시하고 전부 출력 (재분류·디버그용)
//     --limit N : 조회 상한 (기본 200)

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
// @supabase/supabase-js 는 apps/web 의 의존성이라 그쪽 node_modules 기준으로 resolve.
const require = createRequire(path.join(repoRoot, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

const argv = process.argv.slice(2);
const all = argv.includes("--all");
const limIdx = argv.indexOf("--limit");
const limit = limIdx >= 0 ? Number(argv[limIdx + 1]) : 200;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("[qa-fetch] missing env — run with: node --env-file=.env.local <script>");
  console.error("  NEXT_PUBLIC_SUPABASE_URL?", !!url, " SUPABASE_SECRET_KEY?", !!key);
  process.exit(1);
}

const statePath = process.env.QA_INTAKE_STATE
  ? path.resolve(process.env.QA_INTAKE_STATE)
  : path.join(repoRoot, "docs/QA_TRIAGE.intake.json");
let processed = {};
if (existsSync(statePath)) {
  try {
    processed = JSON.parse(readFileSync(statePath, "utf8")).processed ?? {};
  } catch (e) {
    console.error("[qa-fetch] state parse failed, treating as empty:", e.message);
  }
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await sb
  .from("feedback")
  .select("id,user_id,category,body,photo_path,created_at")
  .order("created_at", { ascending: true })
  .limit(limit);
if (error) {
  console.error("[qa-fetch] SELECT failed:", error.message);
  process.exit(2);
}

const items = (data ?? []).filter((r) => all || !processed[r.id]);
const byCategory = {};
for (const r of items) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;

const out = {
  generatedAt: new Date().toISOString(),
  statePath: path.relative(repoRoot, statePath),
  processedCount: Object.keys(processed).length,
  newCount: items.length,
  byCategory,
  items: items.map((r) => ({
    id: r.id,
    category: r.category, // 'bug' | 'feature' | 'other' — 사용자 self-label, 신뢰 불가
    body: r.body,
    hasPhoto: Boolean(r.photo_path),
    photoPath: r.photo_path ?? null,
    reporter: r.user_id,
    createdAt: r.created_at,
  })),
};
console.log(JSON.stringify(out, null, 2));
