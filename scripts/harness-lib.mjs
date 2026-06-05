import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const repoRoot = process.cwd();
export const tasksDir = path.join(repoRoot, "evals/tasks");

const REQUIRED_FRONTMATTER = ["Task", "Track", "Kind", "Status", "Parent"];
const TRACKS = new Set(["port", "greenfield"]);
const KINDS = new Set(["migration", "regression"]);
const STATUSES = new Set(["todo", "blocked", "in_progress", "done"]);

export function loadMigrationTasks() {
  if (!existsSync(tasksDir)) {
    return [];
  }

  return readdirSync(tasksDir)
    .filter((file) => /^\d{4}-.*\.md$/.test(file))
    .filter((file) => Number(file.slice(0, 4)) >= 4)
    .sort()
    .map((file) => {
      const absolutePath = path.join(tasksDir, file);
      const content = readFileSync(absolutePath, "utf8");
      return parseTaskFile(absolutePath, content);
    });
}

export function findTask(taskId) {
  const normalized = taskId.trim().toUpperCase();
  return loadMigrationTasks().find((task) => {
    return task.frontmatter.Task?.toUpperCase() === normalized;
  });
}

export function parseTaskFile(absolutePath, content) {
  const frontmatter = parseFrontmatter(content);
  const sections = {
    parentLinks: extractSection(content, "Parent Links"),
    sourceFiles: extractSection(content, "Source Files to Inspect"),
    targetFiles: extractSection(content, "Target Files"),
    verificationCommands: extractSection(content, "Verification Commands"),
  };

  return {
    absolutePath,
    repoPath: toRepoPath(absolutePath),
    content,
    frontmatter,
    parentPaths: unique([
      ...pathsFromFrontmatter(frontmatter.Parent),
      ...pathsFromMarkdownLinks(sections.parentLinks, path.dirname(absolutePath)),
    ]),
    sourcePaths: unique(pathsFromBulletSection(sections.sourceFiles, repoRoot)),
    targetPaths: unique(pathsFromBulletSection(sections.targetFiles, repoRoot)),
    verificationCommands: sections.verificationCommands.trim(),
  };
}

export function validateTask(task, { exists = existsSync } = {}) {
  const errors = [];

  for (const key of REQUIRED_FRONTMATTER) {
    if (!task.frontmatter[key]) {
      errors.push(`${task.repoPath}: missing frontmatter ${key}`);
    }
  }

  // 템플릿 SoT(.agents/backlog/AGENT_TASK_TEMPLATE.md)는 번호형(EVAL-0004)과
  // 슬러그형(EVAL-<feature>-<slug>)을 둘 다 허용 — EVAL- 접두 + 영숫자/하이픈만 강제.
  if (task.frontmatter.Task && !/^EVAL-[A-Za-z0-9][A-Za-z0-9-]*$/.test(task.frontmatter.Task)) {
    errors.push(`${task.repoPath}: Task must look like EVAL-0004 or EVAL-<feature>-<slug>`);
  }

  if (task.frontmatter.Track && !TRACKS.has(task.frontmatter.Track)) {
    errors.push(`${task.repoPath}: Track must be port or greenfield`);
  }

  if (task.frontmatter.Kind && !KINDS.has(task.frontmatter.Kind)) {
    errors.push(`${task.repoPath}: Kind must be migration or regression`);
  }

  if (task.frontmatter.Status && !STATUSES.has(task.frontmatter.Status)) {
    errors.push(`${task.repoPath}: Status must be todo, blocked, in_progress, or done`);
  }

  if (task.frontmatter.Status === "blocked" && !task.frontmatter["Blocked-by"]) {
    errors.push(`${task.repoPath}: blocked tasks require Blocked-by`);
  }

  const pathGroups = [
    ["Parent", task.parentPaths],
    ["Source Files", task.sourcePaths],
    ["Target Files", task.targetPaths],
  ];

  for (const [label, paths] of pathGroups) {
    if (paths.length === 0) {
      errors.push(`${task.repoPath}: ${label} must list at least one path`);
    }

    for (const item of paths) {
      if (!exists(item.absolutePath)) {
        errors.push(`${task.repoPath}: ${label} path missing: ${item.display}`);
      }
    }
  }

  return errors;
}

export function formatPathList(paths) {
  return paths
    .map((item) => {
      const status = existsSync(item.absolutePath) ? "ok" : "missing";
      return `- ${item.display} (${status})`;
    })
    .join("\n");
}

export function toRepoPath(absolutePath) {
  return path.relative(repoRoot, absolutePath).split(path.sep).join("/");
}

export function parseFrontmatter(content) {
  // BOM 제거 후 첫 줄이 --- 여야 frontmatter (에디터/템플릿이 BOM 을 삽입할 수 있다).
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0] !== "---") {
    return {};
  }

  const frontmatter = {};
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "---") {
      break;
    }
    if (line.trim().startsWith("#")) {
      continue; // 주석 라인 무시 — 템플릿이 설명용 # 라인을 둔다.
    }
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!match) {
      continue;
    }
    // 값 뒤 인라인 주석(" # ...") 제거 — 템플릿이 enum 설명을 값 옆에 단다.
    frontmatter[match[1]] = match[2].replace(/\s+#.*$/, "").trim();
  }
  return frontmatter;
}

export function extractSection(content, heading) {
  const lines = content.split(/\r?\n/);
  // 헤딩 뒤 부가 텍스트 허용 — 템플릿은 "## Parent Links (추적성 …)" 처럼 단다.
  const headingRe = new RegExp(`^## ${heading}(?:\\s|$)`);
  const start = lines.findIndex((line) => headingRe.test(line.trim()));
  if (start === -1) {
    return "";
  }

  const sectionLines = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) {
      break;
    }
    sectionLines.push(lines[index]);
  }
  return sectionLines.join("\n");
}

function pathsFromFrontmatter(value) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => normalizeRepoPath(item.trim()))
    .filter(Boolean)
    .map((repoPath) => pathRecord(repoPath, repoRoot));
}

function pathsFromMarkdownLinks(markdown, baseDir) {
  const paths = [];
  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const match of markdown.matchAll(linkPattern)) {
    const target = normalizeLinkedPath(match[1]);
    if (!target) {
      continue;
    }
    paths.push(pathRecord(target, baseDir));
  }
  return paths;
}

function pathsFromBulletSection(markdown, baseDir) {
  const paths = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trim().startsWith("-")) {
      continue;
    }

    const markdownLink = line.match(/\[[^\]]+\]\(([^)]+)\)/);
    if (markdownLink) {
      const target = normalizeLinkedPath(markdownLink[1]);
      if (target) {
        paths.push(pathRecord(target, baseDir));
      }
      continue;
    }

    const backtick = line.match(/`([^`]+)`/);
    if (backtick) {
      const target = normalizeRepoPath(backtick[1]);
      if (target) {
        paths.push(pathRecord(target, repoRoot));
      }
    }
  }
  return paths;
}

export function normalizeLinkedPath(value) {
  const stripped = value.trim().replace(/^<|>$/g, "").split("#")[0];
  if (!stripped || isPlaceholder(stripped) || /^[a-z]+:/i.test(stripped)) {
    return null;
  }
  return stripped;
}

export function normalizeRepoPath(value) {
  const stripped = value.trim().replace(/^<|>$/g, "").split("#")[0];
  if (!stripped || isPlaceholder(stripped) || /^[a-z]+:/i.test(stripped)) {
    return null;
  }
  return stripped;
}

// 템플릿 placeholder/글롭은 실재 경로가 아니다 — 잔여 꺾쇠·중괄호·별표·"..." 를 거른다.
function isPlaceholder(token) {
  return /[<>{}*]/.test(token) || token.includes("...");
}

function pathRecord(target, baseDir) {
  const absolutePath = path.isAbsolute(target) ? target : path.resolve(baseDir, target);

  return {
    display: toRepoPath(absolutePath),
    absolutePath,
  };
}

function unique(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = item.absolutePath;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }
  return output;
}

export function describeFile(pathRecordItem) {
  if (!existsSync(pathRecordItem.absolutePath)) {
    return "missing";
  }

  const stats = statSync(pathRecordItem.absolutePath);
  return stats.isDirectory() ? "directory" : `${stats.size} bytes`;
}

// ════════════════════════════════════════════════════════════════
// 상류 추적성 게이트 (D7 · 05 §7 Tier 1)
// "spine 파일(Engineering Story · Agent Task)이 인용한 PRD AC id 가
//  아직 PRD 에 실재하는가" 를 결정론 검사한다. 사라진 AC 인용 = Traceability drift.
//
// 정의 SoT: feature-kebab AC id (`AC-<feature>-<n>`) 는 RN MVP PRD 가 유일 정의처.
// POC PRD 의 숫자형 `AC-2` 는 형태가 달라(소문자 feature 없음) 본 게이트 범위 밖.
// ════════════════════════════════════════════════════════════════

// AC 정의처: feature-kebab AC id 가 선언되는 SoT(PRD+stories 클러스터, 05 §2).
export const acDefinitionFiles = ["docs/migration/01-rn-mvp-prd.md", "docs/PRD.md"];
export const acDefinitionDirs = ["docs/stories"];
// 인용처: PRD AC 를 상향 인용하는 spine 파일(README 제외) + Agent Task.
export const acCitationDirs = ["docs/eng-stories", "docs/pm"];

// 매 호출 새 정규식 — 전역 플래그 lastIndex 공유 방지.
const acIdRe = () => /AC-[a-z][a-z0-9-]*-\d+/g;
const acPrefixRe = () => /AC-[a-z][a-z0-9-]*-\*/g;

// content 에서 정의된 AC id 집합과 prefix 집합을 뽑는다.
export function extractDefinedAcIds(content) {
  const ids = new Set();
  const prefixes = new Set();
  for (const match of content.matchAll(acIdRe())) {
    ids.add(match[0]);
    prefixes.add(match[0].replace(/-\d+$/, ""));
  }
  for (const match of content.matchAll(acPrefixRe())) {
    prefixes.add(match[0].replace(/-\*$/, ""));
  }
  return { ids, prefixes };
}

// content 의 AC 인용을 뽑는다. `PRD-AC-…` 도 내부 `AC-…` 토큰으로 추출된다.
export function extractAcCitations(content) {
  const refs = [];
  for (const match of content.matchAll(acPrefixRe())) {
    refs.push({ raw: match[0], kind: "prefix", prefix: match[0].replace(/-\*$/, "") });
  }
  for (const match of content.matchAll(acIdRe())) {
    refs.push({
      raw: match[0],
      kind: "id",
      id: match[0],
      prefix: match[0].replace(/-\d+$/, ""),
    });
  }
  return refs;
}

// 인용 1건이 정의 인덱스로 resolve 되는가.
// id 인용은 (정확 id) 또는 (prefix 만 선언된 feature) 둘 중 하나면 통과.
export function resolveAcCitation(ref, index) {
  if (ref.kind === "prefix") {
    return index.prefixes.has(ref.prefix);
  }
  return index.ids.has(ref.id) || index.prefixes.has(ref.prefix);
}

export function buildAcIndex(contents) {
  const ids = new Set();
  const prefixes = new Set();
  for (const content of contents) {
    const defined = extractDefinedAcIds(content);
    defined.ids.forEach((id) => ids.add(id));
    defined.prefixes.forEach((prefix) => prefixes.add(prefix));
  }
  return { ids, prefixes };
}

function markdownFilesIn(dir, { skip = [] } = {}) {
  const absoluteDir = path.join(repoRoot, dir);
  if (!existsSync(absoluteDir)) {
    return [];
  }
  return readdirSync(absoluteDir)
    .filter((file) => file.endsWith(".md") && !skip.includes(file))
    .map((file) => path.join(absoluteDir, file));
}

export function loadAcIndex({ readFile = (p) => readFileSync(p, "utf8") } = {}) {
  const files = [
    ...acDefinitionFiles.map((file) => path.join(repoRoot, file)),
    ...acDefinitionDirs.flatMap((dir) => markdownFilesIn(dir)),
  ].filter((file) => existsSync(file));
  return buildAcIndex(files.map((file) => readFile(file)));
}

export function loadCitationFiles() {
  const files = acCitationDirs.flatMap((dir) => markdownFilesIn(dir, { skip: ["README.md"] }));
  const out = files.map((absolutePath) => ({
    repoPath: toRepoPath(absolutePath),
    content: readFileSync(absolutePath, "utf8"),
  }));
  // Agent Task(0004+)도 PRD AC 를 상향 인용하므로 함께 검사.
  for (const task of loadMigrationTasks()) {
    out.push({ repoPath: task.repoPath, content: task.content });
  }
  return out;
}

export function validateAcTraceability(index, citationFiles) {
  const errors = [];
  for (const file of citationFiles) {
    const seen = new Set();
    for (const ref of extractAcCitations(file.content)) {
      if (resolveAcCitation(ref, index) || seen.has(ref.raw)) {
        continue;
      }
      seen.add(ref.raw);
      errors.push(`${file.repoPath}: AC citation does not resolve to PRD: ${ref.raw}`);
    }
  }
  return errors;
}
