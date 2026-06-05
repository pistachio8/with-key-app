#!/usr/bin/env node
// scripts/harness-check.mjs  →  pnpm harness:check
// 결정론 Tier 1 하네스 검증 (drift 아님 — 구조·추적성 lint).
// 계약: spec docs/superpowers/specs/2026-06-04-harness-mvp-file-structure-design.md §4.6
//   1. harness.config(.json 우선, 없으면 .example.json) 로드 → paths.agentTasks
//   2. evals/tasks/*.md frontmatter 파싱 → Track·Status·Parent 존재/유효 검사
//   3. Parent 인용 파일 경로 resolve (hallucinated-path = Traceability drift)
//   4. 위반 모으기 → stderr 출력 + process.exit(위반 ? 1 : 0)
//
// grandfather: 0001~0003 은 frontmatter 없는 POC baseline → skip (evals/README §33).
//   0004+ 는 frontmatter 필수. frontmatter 가 있으면 번호 무관 전체 검증.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VALID_TRACKS = new Set(["port", "greenfield"]);
const VALID_STATUS = new Set(["todo", "blocked", "in_progress", "done"]);

// 인용 경로 인식용 — 알려진 확장자로 끝나는 토큰만 "파일 경로"로 본다.
// (다른 스크립트와 동일 컨벤션 — scripts/validate-doc-paths.mjs)
const KNOWN_EXT = "(?:md|mdx|ts|tsx|js|jsx|mjs|cjs|json|yaml|yml|sql|sh|env|toml|css)";
const PATH_RE = new RegExp("([A-Za-z0-9_][A-Za-z0-9_./\\-]*\\." + KNOWN_EXT + ")", "g");

/** 템플릿/글롭 placeholder 는 검증 대상이 아니다. */
function isTemplateToken(token) {
  return /[<>{}*]/.test(token) || token.includes("...");
}

/**
 * harness.config 로드. 실 config 우선, 없으면 example fallback.
 * @returns {{ config: object, source: string }}
 */
export function loadConfig(root) {
  const real = join(root, ".agents/harness/config/harness.config.json");
  const example = join(root, ".agents/harness/config/harness.config.example.json");
  const source = existsSync(real) ? real : example;
  return { config: JSON.parse(readFileSync(source, "utf8")), source };
}

/**
 * 최상단 YAML frontmatter(`---` … `---`)를 얕게 파싱한다.
 * 하네스 frontmatter 는 `Key: value` 평면 구조라 풀 YAML 파서가 불필요하다.
 * @returns {{ hasFrontmatter: boolean, fields: Record<string,string>, body: string }}
 */
export function parseFrontmatter(text) {
  const normalized = text.replace(/^﻿/, "");
  if (!normalized.startsWith("---")) {
    return { hasFrontmatter: false, fields: {}, body: normalized };
  }
  const end = normalized.indexOf("\n---", 3);
  if (end === -1) {
    return { hasFrontmatter: false, fields: {}, body: normalized };
  }
  const block = normalized.slice(3, end);
  const body = normalized.slice(normalized.indexOf("\n", end + 1) + 1);
  const fields = {};
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue; // 주석 라인 무시
    const colon = trimmed.indexOf(":");
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    const value = trimmed
      .slice(colon + 1)
      .replace(/\s+#.*$/, "") // 인라인 주석 제거
      .trim();
    if (key) fields[key] = value;
  }
  return { hasFrontmatter: true, fields, body };
}

/**
 * "## Parent Links" 섹션 본문을 잘라 반환. 없으면 null.
 */
export function extractParentSection(body) {
  const lines = body.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{2,3}\s+Parent/i.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return null;
  const collected = [];
  for (let i = start; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) break; // 다음 헤딩에서 멈춤
    collected.push(lines[i]);
  }
  return collected.join("\n");
}

/**
 * 텍스트에서 인용된 구체 파일 경로 토큰을 뽑는다(템플릿 placeholder 제외).
 */
export function extractCitedPaths(text) {
  const out = [];
  for (const match of text.matchAll(PATH_RE)) {
    const token = match[1].replace(/[).,;:]+$/, ""); // 후행 구두점 제거
    if (isTemplateToken(token)) continue;
    if (!out.includes(token)) out.push(token);
  }
  return out;
}

/**
 * 인용 경로가 repo 안에서 resolve 되는지. root-relative · file-relative 둘 다 허용.
 */
export function resolveCitation(citedPath, fileDir, root, exists = existsSync) {
  if (isAbsolute(citedPath)) return exists(citedPath);
  return [join(fileDir, citedPath), join(root, citedPath)].some((c) => exists(c));
}

/**
 * 단일 task 파일 검사. { violations, skipped } 반환.
 * grandfather(skip)는 위반이 아니라 별도 집계.
 */
export function checkTaskFile({ filename, text, fileDir }, root, exists = existsSync) {
  const violations = [];
  const { hasFrontmatter, fields, body } = parseFrontmatter(text);
  const numMatch = filename.match(/^(\d{4})/);
  const num = numMatch ? Number(numMatch[1]) : null;

  if (!hasFrontmatter) {
    // 0004+ 는 frontmatter 필수. 0001~0003·번호 없는 비-task md 는 grandfather skip.
    if (num !== null && num >= 4) {
      violations.push(
        `${filename}: 0004+ Agent Task 는 frontmatter 필수 (Track·Status·Parent). evals/README §33`,
      );
      return { violations, skipped: false };
    }
    return { violations, skipped: true };
  }

  // --- Track 존재 + enum ---
  if (!fields.Track) {
    violations.push(`${filename}: frontmatter 에 Track 누락 (port|greenfield)`);
  } else if (!VALID_TRACKS.has(fields.Track)) {
    violations.push(
      `${filename}: Track="${fields.Track}" 은 port|greenfield 가 아님 (미기입 템플릿/오타)`,
    );
  }

  // --- Status 존재 + enum + blocked 일관성 ---
  if (!fields.Status) {
    violations.push(`${filename}: frontmatter 에 Status 누락 (todo|blocked|in_progress|done)`);
  } else if (!VALID_STATUS.has(fields.Status)) {
    violations.push(`${filename}: Status="${fields.Status}" 은 허용 enum 아님`);
  } else if (fields.Status === "blocked" && !fields["Blocked-by"]) {
    violations.push(`${filename}: Status=blocked 인데 Blocked-by 해제조건 누락`);
  }

  // --- Parent 섹션 존재 + 인용 경로 resolve (hallucinated-path = Traceability drift) ---
  const parentSection = extractParentSection(body);
  if (parentSection === null) {
    violations.push(`${filename}: "## Parent Links" 추적성 섹션 누락`);
  } else {
    for (const citedPath of extractCitedPaths(parentSection)) {
      if (!resolveCitation(citedPath, fileDir, root, exists)) {
        violations.push(
          `${filename}: Parent 인용 경로 resolve 실패 (hallucinated-path) → ${citedPath}`,
        );
      }
    }
  }

  return { violations, skipped: false };
}

/**
 * 전체 검사 실행. config 로 정한 agentTasks 디렉토리의 task 들을 검사.
 * @returns {{ violations: string[], checked: number, skipped: number, configSource: string }}
 */
export function runCheck(root) {
  const { config, source } = loadConfig(root);
  const tasksRel = config?.paths?.agentTasks ?? "evals/tasks";
  const tasksDir = join(root, tasksRel);

  if (!existsSync(tasksDir)) {
    return {
      violations: [`agentTasks 디렉토리 없음: ${tasksRel} (config: ${source})`],
      checked: 0,
      skipped: 0,
      configSource: source,
    };
  }

  const files = readdirSync(tasksDir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .sort();
  const violations = [];
  let checked = 0;
  let skipped = 0;

  for (const filename of files) {
    const text = readFileSync(join(tasksDir, filename), "utf8");
    const result = checkTaskFile({ filename, text, fileDir: tasksDir }, root);
    if (result.skipped) skipped++;
    else checked++;
    violations.push(...result.violations);
  }

  return { violations, checked, skipped, configSource: source };
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const { violations, checked, skipped } = runCheck(root);

  if (violations.length > 0) {
    console.error("[harness:check] 추적성·구조 위반 발견:");
    for (const v of violations) console.error(`  ✗ ${v}`);
    console.error(
      `\n[harness:check] ${violations.length}건 위반 — FAIL (검사 ${checked} · grandfather skip ${skipped})`,
    );
    process.exit(1);
  }

  console.error(`[harness:check] OK — 위반 0건 (검사 ${checked} · grandfather skip ${skipped})`);
  process.exit(0);
}

// 직접 실행될 때만 main (테스트에서 import 시엔 실행 안 됨).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
