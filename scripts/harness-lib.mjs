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

export function validateTask(task) {
  const errors = [];

  for (const key of REQUIRED_FRONTMATTER) {
    if (!task.frontmatter[key]) {
      errors.push(`${task.repoPath}: missing frontmatter ${key}`);
    }
  }

  if (task.frontmatter.Task && !/^EVAL-\d{4}$/.test(task.frontmatter.Task)) {
    errors.push(`${task.repoPath}: Task must look like EVAL-0004`);
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
      if (!existsSync(item.absolutePath)) {
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

function parseFrontmatter(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") {
    return {};
  }

  const frontmatter = {};
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "---") {
      break;
    }
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!match) {
      continue;
    }
    frontmatter[match[1]] = match[2].trim();
  }
  return frontmatter;
}

function extractSection(content, heading) {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
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

function normalizeLinkedPath(value) {
  const stripped = value.trim().replace(/^<|>$/g, "").split("#")[0];
  if (!stripped || /^[a-z]+:/i.test(stripped)) {
    return null;
  }
  return stripped;
}

function normalizeRepoPath(value) {
  const stripped = value.trim().replace(/^<|>$/g, "").split("#")[0];
  if (!stripped || stripped.includes("*") || /^[a-z]+:/i.test(stripped)) {
    return null;
  }
  return stripped;
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
