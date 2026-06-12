import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const repoRoot = process.cwd();
export const tasksDir = path.join(repoRoot, "evals/tasks");
export const archiveTasksDir = path.join(tasksDir, "archive");

// task: 토큰 존재 검사용 id 인덱스 — 활성 evals/tasks/ + archive/ 포함.
// 왜 archive 포함: 선행 done task 가 나중에 archive 되는 순간 하류 토큰이 CI 를 깨는 회귀 방지.
// archive 구파일(0001~0003)은 frontmatter 가 없어 파일명 번호에서 id 를 파생한다.
export function loadKnownTaskIds() {
  const ids = new Set();
  for (const dir of [tasksDir, archiveTasksDir]) {
    if (!existsSync(dir)) {
      continue;
    }
    for (const file of readdirSync(dir)) {
      const match = file.match(/^(\d{4})-.*\.md$/);
      if (!match || file.endsWith(".goal.md")) {
        continue;
      }
      const frontmatter = parseFrontmatter(readFileSync(path.join(dir, file), "utf8"));
      ids.add((frontmatter.Task || `EVAL-${match[1]}`).toUpperCase());
    }
  }
  return ids;
}

const REQUIRED_FRONTMATTER = ["Task", "Track", "Kind", "Status", "Parent"];
const TRACKS = new Set(["port", "greenfield"]);
const KINDS = new Set(["migration", "regression"]);
const STATUSES = new Set(["todo", "blocked", "in_progress", "done"]);

// ── Blocked-by · Depends-on 토큰 문법 (spec 2026-06-12-harness-finalize-blocked-by-tokens §C1) ──
// `[type:value] [type:value] — 자유 문장`. 첫 `—`(em dash) 왼쪽에서만 토큰을 추출한다.
// 왜 첫 — 기준: prose 안의 토큰·EVAL 인용(예: EVAL-0022 의 "EVAL-0006 선례")을 의존으로 오탐하지 않기 위해.
// 타입 5종 고정 — 현행 13개 task blocker 전수 분류가 이 5종으로 닫힌다. 신규 타입은 spec 갱신으로만.
export const BLOCKER_TOKEN_TYPES = new Set(["task", "gate", "adr", "spec", "po"]);

export function parseBlockers(line) {
  const left = String(line ?? "").split("—")[0];
  const tokens = [];
  for (const match of left.matchAll(/\[([a-z]+):([^\]]+)\]/g)) {
    tokens.push({ type: match[1], value: match[2].trim() });
  }
  return tokens;
}

export function loadMigrationTasks() {
  if (!existsSync(tasksDir)) {
    return [];
  }

  return (
    readdirSync(tasksDir)
      .filter((file) => /^\d{4}-.*\.md$/.test(file))
      // .goal.md 는 harness:goal 의 파생 뷰 — task 아님. 재-ingest 시 batch 비멱등·check 오탐.
      .filter((file) => !file.endsWith(".goal.md"))
      .filter((file) => Number(file.slice(0, 4)) >= 4)
      .sort()
      .map((file) => {
        const absolutePath = path.join(tasksDir, file);
        const content = readFileSync(absolutePath, "utf8");
        return parseTaskFile(absolutePath, content);
      })
  );
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

export function validateTask(task, { exists = existsSync, knownTaskIds = null } = {}) {
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

  // 토큰 문법 강제 (spec §C2) — blocked 한정이 아니라 "키가 존재하면" 검사한다.
  // 왜: blocked 한정이면 todo task 의 Depends-on 구문법이 무검출로 살아남아 base branch 가 조용히 develop 으로 떨어진다.
  for (const key of ["Blocked-by", "Depends-on"]) {
    if (!(key in task.frontmatter)) {
      continue;
    }
    const tokens = parseBlockers(task.frontmatter[key]);
    if (tokens.length === 0) {
      errors.push(
        `${task.repoPath}: ${key} must have >=1 [type:value] token before — (구문법 prose 금지, spec 2026-06-12 §C1)`,
      );
    }
    for (const token of tokens) {
      if (!BLOCKER_TOKEN_TYPES.has(token.type)) {
        errors.push(
          `${task.repoPath}: ${key} unknown token type [${token.type}:] — task·gate·adr·spec·po 만 허용(신규 타입은 spec 갱신)`,
        );
      } else if (
        token.type === "task" &&
        knownTaskIds &&
        !knownTaskIds.has(token.value.toUpperCase())
      ) {
        errors.push(
          `${task.repoPath}: ${key} [task:${token.value}] not found in evals/tasks/ (+archive/)`,
        );
      }
    }
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

// Work Package 브랜치명을 task 본문에서 추출한다 — 템플릿이 `> WPn (`feat/<slug>`)` 형태로 적는다.
// frontmatter 필드가 아니라 prose 라서 첫 백틱 `feat/...` 토큰을 신호로 쓴다.
// renamed 브랜치(예: 본문 feat/rn-verify-replace ↔ 머지 feat/rn-verify-photo-replace)는 놓칠 수 있다 — warn 전용이라 허용.
export function extractWorkPackageBranch(task) {
  const match = (task.content || "").match(/`(feat\/[a-z0-9][a-z0-9-]*)`/);
  return match ? match[1] : null;
}

// stale status 휴리스틱: todo·in_progress 인데 WP 브랜치가 이미 머지됨 → status 갱신 누락 의심.
// blocker 아닌 warn — Target Files 가 디렉토리 단위라 파일 존재로는 done 을 가릴 수 없어 머지 신호를 쓴다.
// mergedBranches(Set)·branchOf 를 주입받아 git·본문 비의존으로 테스트한다(validateTask 의 exists 주입과 동형).
export function detectStaleStatus(
  task,
  mergedBranches,
  { branchOf = extractWorkPackageBranch } = {},
) {
  const status = task.frontmatter.Status;
  if (status !== "todo" && status !== "in_progress") {
    return [];
  }
  const branch = branchOf(task);
  if (!branch || !mergedBranches.has(branch)) {
    return [];
  }
  return [
    `${task.repoPath}: Status '${status}' but Work Package branch '${branch}' is merged — flip to done?`,
  ];
}

export const agentResultsPath = path.join(repoRoot, "evals/results/agent-results.json");

// done↔runs 정합 게이트(2026-06-11) 도입 이전에 runs[] 기록 없이 done 전환된 task.
// 소급 기록을 만들지 않기 위한 명시 예외 — 이후의 done 전환은 runs[] append 가 같은 PR 에 필수.
export const GRANDFATHERED_DONE = new Set([
  "EVAL-0004",
  "EVAL-0005",
  "EVAL-0010",
  "EVAL-0011",
  "EVAL-0015",
  "EVAL-0020",
  "EVAL-0023",
  "EVAL-0024",
  "EVAL-0027",
  "EVAL-0028",
  "EVAL-0029",
]);

export function loadAgentResults({ readFile = (p) => readFileSync(p, "utf8") } = {}) {
  if (!existsSync(agentResultsPath)) {
    return { runs: [] };
  }
  return JSON.parse(readFile(agentResultsPath));
}

// done↔runs 정합: Status done 인 task 는 agent-results.json runs[] 에 동일 taskId 기록 ≥1건.
// run 내용 품질은 검증하지 않는다 — "done 인데 실행 이력 0건" 인 무기록 done 만 차단한다.
export function validateDoneRunParity(tasks, results, { grandfathered = GRANDFATHERED_DONE } = {}) {
  const runs = results.runs ?? [];

  return tasks.flatMap((task) => {
    if (task.frontmatter.Status !== "done") {
      return [];
    }
    const id = task.frontmatter.Task?.toUpperCase();
    if (!id) {
      return [];
    }
    const entries = runs.filter(
      (run) => typeof run.taskId === "string" && run.taskId.toUpperCase() === id,
    );
    const errors = [];
    if (entries.length === 0 && !grandfathered.has(id)) {
      errors.push(
        `${task.repoPath}: Status 'done' but no runs[] record for ${id} in evals/results/agent-results.json — append a run entry in the same PR`,
      );
    }
    // finalize skeleton 의 <<FILL>> 이 채워지지 않은 채 커밋되는 회귀를 CI 게이트로 차단 (spec §C2).
    // finalize 의 exit 1 은 프로세스가 살아있는 동안만 유효 — 영속 게이트는 여기다.
    for (const entry of entries) {
      if (JSON.stringify(entry).includes("<<FILL>>")) {
        errors.push(
          `${task.repoPath}: runs[] entry for ${id} has <<FILL>> placeholder — summary·verification 을 채우고 notes 불요 시 필드를 삭제하라`,
        );
      }
    }
    return errors;
  });
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

// ════════════════════════════════════════════════════════════════
// /goal 프롬프트 렌더러 (harness:goal) — task 파일을 SoT 로 한 파생 뷰.
// 하드코딩 프롬프트 대신 task 의 구조화 섹션(Goal·Requirements·Non-goals·AC·
// Verification·Harness Impact·Stop)에서 deterministic 렌더 → 중복/drift 0.
// 분기 신호(ADR 게이트·수동 핸드오프·worktree base)는 task frontmatter/섹션에서 도출한다.
// ════════════════════════════════════════════════════════════════

function firstFeatBranch(text) {
  const match = (text || "").match(/feat\/[a-z0-9][a-z0-9-]*/);
  return match ? match[0] : null;
}

function slugFromRepoPath(repoPath) {
  const base = repoPath.split("/").pop() || "";
  return base.replace(/^\d+-/, "").replace(/\.md$/, "");
}

// 선행 task(Blocked-by)의 Work Package 브랜치를 찾아 worktree base 로 쓴다.
// 파일시스템 비의존 테스트를 위해 renderGoalPrompt 에 주입 가능(validateTask 패턴).
function defaultLookupBranch(evalId) {
  const predecessor = findTask(evalId);
  if (!predecessor) {
    return null;
  }
  return firstFeatBranch(extractSection(predecessor.content, "Parent Links"));
}

export function renderGoalPrompt(task, { lookupBranch = defaultLookupBranch } = {}) {
  const id = task.frontmatter.Task;
  const titleMatch = task.content.match(/^#\s+(EVAL-[^\n]+)$/m);
  const title = titleMatch ? titleMatch[1] : id;
  const blockedBy = task.frontmatter["Blocked-by"] || "";
  const blockerTokens = parseBlockers(blockedBy);
  const dependsTokens = parseBlockers(task.frontmatter["Depends-on"] || "");

  const parentLinks = extractSection(task.content, "Parent Links");
  const requirements = extractSection(task.content, "Requirements").trim();
  const nonGoals = extractSection(task.content, "Non-goals").trim();
  const ac = extractSection(task.content, "Acceptance Criteria").trim();
  const harnessImpact = extractSection(task.content, "Harness Impact Questions").trim();
  const stop = extractSection(task.content, "Stop Condition").trim();
  const verify = (task.verificationCommands || "").trim();

  const wpBranch = firstFeatBranch(parentLinks) || `feat/${slugFromRepoPath(task.repoPath)}`;
  // 첫 task: 토큰이 worktree base 선행 — Blocked-by 우선, 없으면 Depends-on (spec §C2).
  // 왜 첫 토큰: 현행 동작(첫 선행 브랜치 위에 쌓기) 보존 — 복수 base 병합은 범위 밖.
  const firstTaskToken = [...blockerTokens, ...dependsTokens].find((t) => t.type === "task");
  const predecessor = firstTaskToken ? firstTaskToken.value : null;
  const baseBranch = (predecessor && lookupBranch(predecessor)) || "develop";
  const worktreeDir = `../with-key-${wpBranch.replace(/^feat\//, "").replace(/\//g, "-")}`;

  // ADR/spec 게이트: prose 단어 매치가 아니라 토큰 존재로 판단 — 인용 오탐 제거 (spec §C2).
  const adrGate = blockerTokens.some((t) => t.type === "adr" || t.type === "spec");
  // 수동/외부 단계는 task 저자가 Verification 의 # 주석으로 표시한다(예: "# manual/dev-build: ...").
  // AC 본문의 "dev build config" 같은 기능명에 오탐하지 않도록 # 주석만 신호로 쓴다.
  const manualHandoff = /(^|\n)\s*#/.test(verify);
  const mobile =
    /apps\/mobile/.test(task.content) ||
    [...task.sourcePaths, ...task.targetPaths].some((item) => /apps\/mobile/.test(item.display));

  const sourceList = task.sourcePaths.map((item) => item.display).join(" · ") || "(none)";
  const targetList = task.targetPaths.map((item) => item.display).join(" · ") || "(none)";
  const envRule = mobile
    ? "모바일 번들 env 는 EXPO_PUBLIC_* 만 (서버 키 sb_secret_*·OPENAI·VAPID private·레거시명 금지)."
    : "클라이언트 번들에 서버 시크릿 금지 (서버 키에 NEXT_PUBLIC_ 접두 금지).";

  const fallbackVerify = `pnpm harness:context ${id}\npnpm -r typecheck && pnpm -r lint && pnpm -r test\npnpm harness:check && pnpm validate:docs`;

  const out = [];
  out.push(`# /goal prompt — ${title}`);
  out.push(
    `# 생성: pnpm harness:goal ${id} · SoT=${task.repoPath} (파생 뷰 — 직접 수정 말고 task 를 고쳐 재생성)`,
  );
  out.push("");
  out.push("## 실행 방식");
  out.push(
    `- harness \`.agents/workflows/implement-agent-task.md\` 를 따른다. 대상 task: \`${task.repoPath}\` (이 1개만 — Story/PRD 핸드오프 금지).`,
  );
  if (adrGate) {
    out.push(
      `- ⚠️ ADR/spec 게이트: 이 task 는 선행 결정에 막혀 있다 — "Blocked-by: ${blockedBy}". 해당 ADR/spec 이 docs/adr/ · docs/superpowers/specs/ 에 accepted 로 없으면 \`pnpm new adr <topic>\`(또는 \`pnpm new spec\`) 으로 초안만 작성하고 **STOP — PO 수락 요청**. 수락 전 관련 구성을 코드로 확정하지 않는다.`,
    );
  }
  out.push("");
  out.push("## Step 0 — 격리 (worktree · 병행 세션·main 무손상)");
  out.push("```bash");
  out.push(`git worktree add -b ${wpBranch} ${worktreeDir} ${baseBranch}`);
  out.push(`cd ${worktreeDir} && pnpm install`);
  out.push("```");
  out.push("- docs/pm · docs/stories · .agents/pm 는 건드리지 않는다 (병행 PM 세션 소유).");
  out.push("");
  out.push("## Step 1 — 컨텍스트");
  out.push("```bash");
  out.push(`pnpm harness:context ${id}`);
  out.push("```");
  out.push(`- 읽기: ${sourceList} · .agents/engineering/INDEX.md`);
  out.push(
    "- 외부 라이브러리/SDK 는 Context7/공식 docs 로 최신 API 확인 후 구현 (학습데이터와 다를 수 있음).",
  );
  out.push("");
  out.push("## Step 2 — 구현 (Target Files 만, Non-goals 봉인, surgical)");
  out.push(requirements || "(task Requirements 참조)");
  out.push("");
  out.push(`Target: ${targetList}`);
  out.push("");
  out.push("## 가드레일 (위반 시 멈추고 보고)");
  out.push("Non-goals:");
  out.push(nonGoals || "(task Non-goals 참조)");
  out.push("");
  out.push(`- ${envRule}`);
  out.push(
    "- 도메인 로직은 @withkey/domain 소비 (재구현 금지). 변경은 surgical — 무관 코드·문서 손대지 않음.",
  );
  out.push("");
  out.push("## 성공 기준 (verify loop — 전부 green 될 때까지, pass@3)");
  out.push("Acceptance Criteria:");
  out.push(ac || "(task AC 참조)");
  out.push("");
  out.push("Verification:");
  if (verify) {
    // task.verificationCommands 는 이미 ```bash 펜스를 포함한다(extractSection). 이중 펜스 방지.
    out.push(verify);
  } else {
    out.push("```bash");
    out.push(fallbackVerify);
    out.push("```");
  }
  if (manualHandoff) {
    out.push(
      '- 위 중 주석(#)·"manual/dev-build/실기기/device" 항목은 자동 검증 불가 → **PO·실기기 핸드오프, 통과 위조 금지**.',
    );
  }
  out.push("");
  out.push("## Harness Impact (구현 후 답변 → drift 루프)");
  out.push(harnessImpact || "(task Harness Impact Questions 참조)");
  out.push(`→ 하나라도 yes 면 evals/drift-reports/${id}-*.md 에 노트 + pnpm harness:drift.`);
  out.push("");
  out.push("## 완료 / 보고");
  out.push(
    `- 한국어 "작업 종료 보고"(명세·구현·변경 파일·영향·검증·미해결).${manualHandoff ? " 자동 불가(수동/외부) 항목은 PO 액션으로 명시." : ""}`,
  );
  out.push("- 커밋/푸시는 사용자 확인 후에만 (git 계정 pistachio8).");
  out.push("");
  out.push("## Stop Condition");
  out.push(stop || "(task Stop Condition 참조)");
  out.push("");
  return compactTableRows(out.join("\n"));
}

// prettier(pre-commit lint-staged)가 markdown 표를 열 정렬 padding 으로 재포맷해 커밋 때마다
// 렌더 길이를 부풀린다(task 1개당 수백 자). /goal 프롬프트는 정렬이 불필요하므로 표 행(| 시작)의
// 연속 공백과 separator 대시 런만 압축해 4000자 예산을 padding 과 무관하게 만든다.
function compactTableRows(text) {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("|")) {
        return line;
      }
      return trimmed.replace(/ {2,}/g, " ").replace(/-{4,}/g, "---");
    })
    .join("\n");
}

// /goal 명령의 goal condition 은 4000자 하드 리밋 — 초과 프롬프트는 실행 자체가 거부된다.
export const GOAL_PROMPT_CHAR_LIMIT = 4000;

// 렌더된 /goal 프롬프트가 리밋을 넘는 task 를 잡는다. done task 는 /goal 재실행 대상이
// 아니므로 open(todo·blocked·in_progress) task 만 검사한다 — 과거 done 초과분은 소급하지 않는다.
export function validateGoalPromptLength(task, { render = renderGoalPrompt } = {}) {
  if (task.frontmatter.Status === "done") {
    return [];
  }
  const length = render(task).length;
  if (length <= GOAL_PROMPT_CHAR_LIMIT) {
    return [];
  }
  return [
    `${task.repoPath}: rendered /goal prompt is ${length} chars > ${GOAL_PROMPT_CHAR_LIMIT} (/goal 하드 리밋) — task 를 분할하거나 본문을 줄여라 (05 §9.4)`,
  ];
}
