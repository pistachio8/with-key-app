#!/usr/bin/env node
// scripts/new-doc.mjs
// pnpm new <plan|spec|adr> <topic-kebab>
// 의존성 0. 단순 문자열 치환으로 docs/superpowers/templates/<type>.md → 대상 디렉터리에 출력.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const DEFAULT_TEMPLATE_DIR = "docs/superpowers/templates";
const PM_TEMPLATE_DIR = ".agents/pm/templates";

const TYPES = {
  plan: { dir: "docs/superpowers/plans", template: "plan.md" },
  spec: { dir: "docs/superpowers/specs", template: "spec.md" },
  adr: { dir: "docs/adr", template: "adr.md" },
  // PM family — template source는 .agents/pm/templates/ (ADR-0031 §3)
  prd: { dir: ".agents/pm", template: "PRD_TEMPLATE.md", templateDir: PM_TEMPLATE_DIR },
  "job-story": {
    dir: "docs/stories",
    template: "JOB_STORY_TEMPLATE.md",
    templateDir: PM_TEMPLATE_DIR,
  },
  "eng-story": {
    dir: "docs/eng-stories",
    template: "ENGINEERING_STORY_TEMPLATE.md",
    templateDir: PM_TEMPLATE_DIR,
  },
  "test-scenario": {
    dir: "docs/stories",
    template: "TEST_SCENARIO_TEMPLATE.md",
    templateDir: PM_TEMPLATE_DIR,
  },
  "acceptance-criteria": {
    dir: ".agents/pm",
    template: "ACCEPTANCE_CRITERIA_TEMPLATE.md",
    templateDir: PM_TEMPLATE_DIR,
  },
};

function usage() {
  console.error(
    "Usage: pnpm new <plan|spec|adr|prd|job-story|eng-story|test-scenario|acceptance-criteria> <topic-kebab>",
  );
  console.error("  예: pnpm new spec auth-magiclink-fix");
  console.error("  예: pnpm new eng-story point-ledger");
  process.exit(1);
}

function kebabToTitle(kebab) {
  return kebab
    .split("-")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function isValidTopic(t) {
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(t) || /^[a-z0-9]$/.test(t);
}

function readAuthor() {
  try {
    const name = execSync("git config user.name", { encoding: "utf8" }).trim();
    if (name) return name;
  } catch {
    /* fall through */
  }
  console.error(
    "[warn] git config user.name 미설정 — author 필드를 비워둡니다. `git config user.name <이름>` 설정 권장.",
  );
  return "";
}

function nextAdrNumber(adrDir) {
  if (!existsSync(adrDir)) return 1;
  const nums = readdirSync(adrDir)
    .map((f) => /^(\d{4})-/.exec(f))
    .filter(Boolean)
    .map((m) => parseInt(m[1], 10));
  return nums.length === 0 ? 1 : Math.max(...nums) + 1;
}

function uniquePath(dir, baseName) {
  let candidate = resolve(REPO_ROOT, dir, baseName);
  if (!existsSync(candidate)) return candidate;
  const m = /^(.+)\.md$/.exec(baseName);
  if (!m) throw new Error("Internal: unexpected baseName " + baseName);
  for (let i = 2; i < 100; i++) {
    const next = resolve(REPO_ROOT, dir, `${m[1]}-${i}.md`);
    if (!existsSync(next)) return next;
  }
  throw new Error("동일 topic으로 99개 이상 파일 존재 — 사람이 정리하세요.");
}

const [, , typeArg, topicArg] = process.argv;
if (!typeArg || !topicArg) usage();
const cfg = TYPES[typeArg];
if (!cfg) {
  console.error(
    `Unknown type: ${typeArg}. Allowed: plan | spec | adr | prd | job-story | eng-story | test-scenario | acceptance-criteria`,
  );
  process.exit(1);
}
if (!isValidTopic(topicArg)) {
  console.error(`Invalid topic: "${topicArg}". kebab-case만 허용(소문자/숫자/하이픈).`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const author = readAuthor();
const title = kebabToTitle(topicArg);

let baseName;
let topicForTemplate;
if (typeArg === "adr") {
  const n = nextAdrNumber(resolve(REPO_ROOT, cfg.dir));
  const padded = String(n).padStart(4, "0");
  baseName = `${padded}-${topicArg}.md`;
  topicForTemplate = `${padded}-${topicArg}`;
} else {
  baseName = `${today}-${topicArg}.md`;
  topicForTemplate = topicArg;
}

const outPath = uniquePath(cfg.dir, baseName);
const templatePath = resolve(REPO_ROOT, cfg.templateDir ?? DEFAULT_TEMPLATE_DIR, cfg.template);

if (!existsSync(templatePath)) {
  console.error(`Template not found: ${templatePath}`);
  process.exit(1);
}

const tpl = readFileSync(templatePath, "utf8");
const rendered = tpl
  .replaceAll("{{date}}", today)
  .replaceAll("{{title}}", title)
  .replaceAll("{{author}}", author)
  .replaceAll("{{topic}}", topicForTemplate);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, rendered, "utf8");

const rel = outPath.replace(REPO_ROOT + "/", "");
console.log(`Created: ${rel}`);
