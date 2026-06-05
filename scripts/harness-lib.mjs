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
