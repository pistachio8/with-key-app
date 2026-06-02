#!/usr/bin/env node
// scripts/check-spec-required.mjs
// spec-required 경로 변경 시 같은 PR에 spec 또는 ADR 동반 추가 여부 검증.
// soft 게이트 — exit 0 유지, stderr에 경고만.
// CLI: node scripts/check-spec-required.mjs [--base <branch>]
// 기본 base: develop.

import { execSync } from "node:child_process";

// spec-required 경로 매핑 (AGENTS.md §4 · 2026-05-13 spec)
// 매칭은 위에서 아래 순서 첫 매칭 적용.
const WHITELIST = [
  {
    pattern: /^supabase\/migrations\//,
    recommend: "ADR",
    reason: "단방향(POC 정책), 데이터 손실 가능",
  },
  {
    pattern: /^src\/lib\/supabase\//,
    recommend: "ADR",
    reason: "인증 백본(admin/client/server/middleware)",
  },
  { pattern: /^middleware\.ts$/, recommend: "ADR", reason: "Next.js 인증 진입점" },
  {
    pattern: /^src\/lib\/keywords\/pool\.ts$/,
    recommend: "ADR",
    reason: "POC freeze 정책 — PO 승인 + VALIDATION 재논의",
  },
  { pattern: /^src\/lib\/validators\//, recommend: "spec", reason: "도메인 zod 스키마 변경" },
  {
    pattern: /^src\/lib\/analytics\/track\.ts$/,
    recommend: "spec",
    reason: "PRD §9.1과 1:1 동기화",
  },
  { pattern: /^src\/lib\/ai\//, recommend: "spec", reason: "AI 프롬프트 가역 · A/B 비교 가능" },
];

function parseArgs(argv) {
  const out = { base: "develop" };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--base" && argv[i + 1]) {
      out.base = argv[i + 1];
      i++;
    }
  }
  return out;
}

function gitDiffFiles(base) {
  try {
    const out = execSync(`git diff --name-only ${base}...HEAD`, { encoding: "utf8" });
    return out
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch (err) {
    console.error(`[check-spec-required] git diff 실패 (base=${base}): ${err.message}`);
    console.error(
      "  base 브랜치가 로컬에 fetch 되어 있는지 확인하세요 (예: git fetch origin develop).",
    );
    process.exit(0); // soft: 검사 자체 실패해도 차단 안 함
  }
}

function classify(files) {
  const triggered = []; // { path, recommend, reason }
  for (const f of files) {
    for (const rule of WHITELIST) {
      if (rule.pattern.test(f)) {
        triggered.push({ path: f, recommend: rule.recommend, reason: rule.reason });
        break;
      }
    }
  }
  return triggered;
}

function hasSpecOrAdr(files) {
  return files.some(
    (f) => /^docs\/superpowers\/specs\/.+\.md$/.test(f) || /^docs\/adr\/.+\.md$/.test(f),
  );
}

const args = parseArgs(process.argv);
const files = gitDiffFiles(args.base);

if (files.length === 0) {
  console.log(`[check-spec-required] no changes vs ${args.base}.`);
  process.exit(0);
}

const triggered = classify(files);

if (triggered.length === 0) {
  console.log(`[check-spec-required] no spec-required paths touched.`);
  process.exit(0);
}

const hasDoc = hasSpecOrAdr(files);

if (hasDoc) {
  console.log(`[check-spec-required] spec/ADR detected alongside spec-required paths — OK.`);
  for (const t of triggered) {
    console.log(`  - ${t.path}  (권장: ${t.recommend})`);
  }
  process.exit(0);
}

// soft warn — exit 0
console.error("");
console.error("[check-spec-required] ⚠ spec-required 경로 변경에 spec/ADR 동반 추가가 없습니다.");
console.error("  같은 PR에 docs/superpowers/specs/*.md 또는 docs/adr/*.md 추가/수정을 권장합니다.");
console.error("  (현재 soft 게이트 — merge는 차단되지 않습니다.)");
console.error("");
console.error("  변경 경로:");
for (const t of triggered) {
  console.error(`    - ${t.path}`);
  console.error(`        권장: ${t.recommend}  (${t.reason})`);
}
console.error("");
console.error("  새 문서 생성: pnpm new <plan|spec|adr> <topic-kebab>");
console.error("");
process.exit(0);
