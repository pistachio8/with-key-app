// scripts/harness-lib.spec.mjs
// 실행: node --test scripts/harness-lib.spec.mjs  (또는 pnpm harness:test)
//
// harness-lib 의 결정론 Tier 1 검증 헬퍼 단위 테스트.
// check·context·drift 가 공유하는 SoT(validateTask)와 파서 견고성을 격리 검증한다.
// 파일시스템 의존을 끊기 위해 validateTask 는 exists 를 주입한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseFrontmatter,
  extractSection,
  normalizeRepoPath,
  normalizeLinkedPath,
  parseBlockers,
  loadKnownTaskIds,
  validateTask,
  detectStaleStatus,
  extractWorkPackageBranch,
  loadMigrationTasks,
  extractDefinedAcIds,
  extractAcCitations,
  resolveAcCitation,
  buildAcIndex,
  validateAcTraceability,
  loadAcIndex,
  loadCitationFiles,
  renderGoalPrompt,
  validateGoalPromptLength,
  GOAL_PROMPT_CHAR_LIMIT,
  validateDoneRunParity,
  GRANDFATHERED_DONE,
} from "./harness-lib.mjs";

// ── validateTask 격리용 task 빌더 (exists 주입 → 파일시스템 비의존) ──
const REPO = "/repo";
const pr = (rel) => ({ display: rel, absolutePath: `${REPO}/${rel}` });
const EXISTING = new Set(["/repo/docs/PRD.md", "/repo/src/x.ts", "/repo/docs/y.md"]);
const fakeExists = (p) => EXISTING.has(p);

function makeTask(frontmatter = {}, paths = {}) {
  return {
    repoPath: "evals/tasks/0004-x.md",
    frontmatter,
    parentPaths: paths.parent ?? [pr("docs/PRD.md")],
    sourcePaths: paths.source ?? [pr("src/x.ts")],
    targetPaths: paths.target ?? [pr("docs/y.md")],
  };
}
const VALID_FM = {
  Task: "EVAL-0004",
  Track: "port",
  Kind: "migration",
  Status: "todo",
  Parent: "docs/PRD.md",
};

// ─────────────── parseFrontmatter ───────────────

test("parseFrontmatter: --- 블록을 Key:value 로 파싱", () => {
  const fm = parseFrontmatter("---\nTask: EVAL-0004\nTrack: port\nStatus: todo\n---\n# 본문");
  assert.equal(fm.Task, "EVAL-0004");
  assert.equal(fm.Track, "port");
  assert.equal(fm.Status, "todo");
});

test("parseFrontmatter: frontmatter 없으면 빈 객체", () => {
  assert.deepEqual(parseFrontmatter("# EVAL-0001 본문\n\n**Status**: pending"), {});
});

test("parseFrontmatter: 값 뒤 인라인 주석(# ...) 제거 (템플릿 견고성)", () => {
  const fm = parseFrontmatter("---\nTrack: port          # D2 주석\n---\n본문");
  assert.equal(fm.Track, "port");
});

test("parseFrontmatter: 설명용 주석 라인(# ...) 무시", () => {
  const fm = parseFrontmatter("---\n# 이건 설명 라인\nTrack: greenfield\n---\n본문");
  assert.equal(fm.Track, "greenfield");
  assert.equal(fm["#"], undefined);
});

test("parseFrontmatter: 선행 BOM 이 있어도 파싱 (에디터 견고성)", () => {
  const fm = parseFrontmatter("﻿---\nTrack: port\n---\n본문");
  assert.equal(fm.Track, "port");
});

// ─────────────── extractSection ───────────────

test("extractSection: 헤딩 뒤 부가 텍스트가 있어도 매칭 (## Parent Links (추적성 …))", () => {
  const body = "## Parent Links (추적성 — 위로 1줄씩)\n- [a](../../docs/PRD.md)\n\n## Goal\n내용";
  const section = extractSection(body, "Parent Links");
  assert.ok(section.includes("docs/PRD.md"));
  assert.ok(!section.includes("내용")); // 다음 ## 헤딩에서 멈춤
});

test("extractSection: 정확 일치 헤딩도 매칭", () => {
  const body = "## Target Files\n- `docs/y.md`\n## Next\nx";
  assert.ok(extractSection(body, "Target Files").includes("docs/y.md"));
});

test("extractSection: 섹션 없으면 빈 문자열", () => {
  assert.equal(extractSection("# 제목\n## Goal\n내용", "Parent Links"), "");
});

// ─────────────── normalize* (placeholder 제외) ───────────────

test("normalizeRepoPath: 실재형 경로는 통과", () => {
  assert.equal(normalizeRepoPath("docs/PRD.md"), "docs/PRD.md");
});

test("normalizeRepoPath: '...' placeholder · 글롭 · 꺾쇠는 제외", () => {
  assert.equal(normalizeRepoPath("docs/stories/..."), null);
  assert.equal(normalizeRepoPath("src/**/*.ts"), null);
  assert.equal(normalizeRepoPath("<feature>/x.md"), null);
});

test("normalizeLinkedPath: http(s) 스킴 링크는 제외", () => {
  assert.equal(normalizeLinkedPath("https://example.com/x.md"), null);
});

// ─────────────── parseBlockers (Blocked-by · Depends-on 토큰 파서) ───────────────

test("parseBlockers: — 왼쪽의 [type:value] 토큰을 순서대로 추출", () => {
  const tokens = parseBlockers("[task:EVAL-0005] [task:EVAL-0006] [gate:G2] — 법무 통과 후 노출.");
  assert.deepEqual(tokens, [
    { type: "task", value: "EVAL-0005" },
    { type: "task", value: "EVAL-0006" },
    { type: "gate", value: "G2" },
  ]);
});

test("parseBlockers: 첫 — 오른쪽 prose 의 토큰·EVAL 인용은 무시 (EVAL-0022 선례 오탐 방지)", () => {
  const tokens = parseBlockers(
    "[task:EVAL-0020] — intra-feature 순서(게이트 아님, EVAL-0006 선례 — [task:EVAL-0099] 인용).",
  );
  assert.deepEqual(tokens, [{ type: "task", value: "EVAL-0020" }]);
});

test("parseBlockers: 토큰 없는 구문법 prose → 빈 배열", () => {
  assert.deepEqual(parseBlockers("G2(법무) 통과 + EVAL-0005 선행."), []);
});

test("parseBlockers: dash 없는 토큰-only 줄도 추출", () => {
  assert.deepEqual(parseBlockers("[task:EVAL-0010]"), [{ type: "task", value: "EVAL-0010" }]);
});

test("parseBlockers: undefined/빈 입력에 안전", () => {
  assert.deepEqual(parseBlockers(undefined), []);
  assert.deepEqual(parseBlockers(""), []);
});

test("loadKnownTaskIds: 활성 + archive task id 를 모두 포함 (archive 는 파일명 파생)", () => {
  const ids = loadKnownTaskIds();
  assert.ok(ids.has("EVAL-0004")); // 활성 frontmatter
  assert.ok(ids.has("EVAL-0001")); // archive — frontmatter 없음, 파일명 0001- 에서 파생
  assert.ok(!ids.has("EVAL-9999"));
});

// ─────────────── validateTask (exists 주입) ───────────────

test("validateTask: 정상 task → 위반 0", () => {
  assert.deepEqual(validateTask(makeTask(VALID_FM), { exists: fakeExists }), []);
});

test("validateTask: Task 슬러그형(EVAL-<feature>-<slug>) 허용 (템플릿 SoT 정합)", () => {
  const errs = validateTask(makeTask({ ...VALID_FM, Task: "EVAL-settlement-ledger" }), {
    exists: fakeExists,
  });
  assert.deepEqual(errs, []);
});

test("validateTask: Task 형식 위반 → 에러", () => {
  const errs = validateTask(makeTask({ ...VALID_FM, Task: "TASK-1" }), { exists: fakeExists });
  assert.ok(errs.some((e) => /Task must look like/.test(e)));
});

test("validateTask: frontmatter 필수 키 누락 → missing 위반", () => {
  const errs = validateTask(makeTask({ Track: "port" }), { exists: fakeExists });
  assert.ok(errs.some((e) => /missing frontmatter Task/.test(e)));
  assert.ok(errs.some((e) => /missing frontmatter Status/.test(e)));
});

test("validateTask: Track 미선택 템플릿 값(port | greenfield) → 위반", () => {
  const errs = validateTask(makeTask({ ...VALID_FM, Track: "port | greenfield" }), {
    exists: fakeExists,
  });
  assert.ok(errs.some((e) => /Track must be/.test(e)));
});

test("validateTask: Kind enum 위반 → 에러 (#164 고유 규칙 보존)", () => {
  const errs = validateTask(makeTask({ ...VALID_FM, Kind: "feature" }), { exists: fakeExists });
  assert.ok(errs.some((e) => /Kind must be/.test(e)));
});

test("validateTask: Status=blocked 인데 Blocked-by 없음 → 위반", () => {
  const errs = validateTask(makeTask({ ...VALID_FM, Status: "blocked" }), { exists: fakeExists });
  assert.ok(errs.some((e) => /blocked tasks require Blocked-by/.test(e)));
});

const KNOWN_IDS = new Set(["EVAL-0004", "EVAL-0010", "EVAL-0020"]);

test("validateTask: Blocked-by 키 존재 + 토큰 0개(구문법 prose) → 위반", () => {
  const errs = validateTask(
    makeTask({ ...VALID_FM, Status: "blocked", "Blocked-by": "G2 통과 + EVAL-0010 선행." }),
    { exists: fakeExists, knownTaskIds: KNOWN_IDS },
  );
  assert.ok(errs.some((e) => /Blocked-by must have >=1 \[type:value\] token/.test(e)));
});

test("validateTask: Depends-on 도 같은 규칙 — todo task 의 구문법이 무검출로 살아남지 않는다", () => {
  const errs = validateTask(makeTask({ ...VALID_FM, "Depends-on": "EVAL-0020 구현 선행." }), {
    exists: fakeExists,
    knownTaskIds: KNOWN_IDS,
  });
  assert.ok(errs.some((e) => /Depends-on must have >=1 \[type:value\] token/.test(e)));
});

test("validateTask: 미지 토큰 타입 → 위반", () => {
  const errs = validateTask(
    makeTask({ ...VALID_FM, Status: "blocked", "Blocked-by": "[until:next-week] — 다음 주." }),
    { exists: fakeExists, knownTaskIds: KNOWN_IDS },
  );
  assert.ok(errs.some((e) => /unknown token type \[until:\]/.test(e)));
});

test("validateTask: task: 토큰이 미존재 task 참조 → 위반", () => {
  const errs = validateTask(
    makeTask({ ...VALID_FM, Status: "blocked", "Blocked-by": "[task:EVAL-9999] — 유령 선행." }),
    { exists: fakeExists, knownTaskIds: KNOWN_IDS },
  );
  assert.ok(errs.some((e) => /\[task:EVAL-9999\] not found/.test(e)));
});

test("validateTask: 정상 토큰 문법 → 위반 0 (사람-판단 타입 값은 검증 안 함)", () => {
  const errs = validateTask(
    makeTask({
      ...VALID_FM,
      Status: "blocked",
      "Blocked-by":
        "[task:EVAL-0010] [gate:G2] [spec:analytics-union] [po:retap-flow] [adr:0036] — 설명.",
    }),
    { exists: fakeExists, knownTaskIds: KNOWN_IDS },
  );
  assert.deepEqual(errs, []);
});

test("validateTask: knownTaskIds 미주입(null)이면 task: 존재 검사만 skip", () => {
  const errs = validateTask(
    makeTask({ ...VALID_FM, Status: "blocked", "Blocked-by": "[task:EVAL-9999] — 유령." }),
    { exists: fakeExists },
  );
  assert.deepEqual(errs, []);
});

test("validateTask: hallucinated 경로(존재 안 함) → 위반", () => {
  const errs = validateTask(makeTask(VALID_FM, { parent: [pr("docs/nope.md")] }), {
    exists: fakeExists,
  });
  assert.ok(errs.some((e) => /Parent path missing/.test(e)));
});

test("validateTask: 경로 그룹이 비면 'must list at least one' 위반 (#164 고유 — Source/Target)", () => {
  const errs = validateTask(makeTask(VALID_FM, { source: [] }), { exists: fakeExists });
  assert.ok(errs.some((e) => /Source Files must list at least one/.test(e)));
});

// ─────────────── validateDoneRunParity (results 주입 → 파일시스템 비의존) ───────────────

test("validateDoneRunParity: done 인데 runs[] 기록 없음 → 위반", () => {
  const errs = validateDoneRunParity(
    [makeTask({ ...VALID_FM, Task: "EVAL-0099", Status: "done" })],
    { runs: [] },
  );
  assert.equal(errs.length, 1);
  assert.ok(/no runs\[\] record for EVAL-0099/.test(errs[0]));
});

test("validateDoneRunParity: done + runs[] 기록 있음 → 위반 0 (대소문자 무시)", () => {
  const errs = validateDoneRunParity(
    [makeTask({ ...VALID_FM, Task: "EVAL-0099", Status: "done" })],
    { runs: [{ taskId: "eval-0099" }] },
  );
  assert.deepEqual(errs, []);
});

test("validateDoneRunParity: grandfathered done 은 면제", () => {
  const errs = validateDoneRunParity(
    [makeTask({ ...VALID_FM, Task: "EVAL-0098", Status: "done" })],
    { runs: [] },
    { grandfathered: new Set(["EVAL-0098"]) },
  );
  assert.deepEqual(errs, []);
});

test("validateDoneRunParity: done 아닌 status 는 검사 대상 아님", () => {
  const errs = validateDoneRunParity(
    [
      makeTask({ ...VALID_FM, Task: "EVAL-0097", Status: "todo" }),
      makeTask({ ...VALID_FM, Task: "EVAL-0096", Status: "in_progress" }),
    ],
    { runs: [] },
  );
  assert.deepEqual(errs, []);
});

test("validateDoneRunParity: runs 필드 부재(빈 results)에도 안전", () => {
  const errs = validateDoneRunParity(
    [makeTask({ ...VALID_FM, Task: "EVAL-0099", Status: "done" })],
    {},
  );
  assert.equal(errs.length, 1);
});

test("GRANDFATHERED_DONE: 게이트 도입 시점(2026-06-11) 무기록 done 11건 고정", () => {
  assert.equal(GRANDFATHERED_DONE.size, 11);
  assert.ok(GRANDFATHERED_DONE.has("EVAL-0004"));
  assert.ok(GRANDFATHERED_DONE.has("EVAL-0029"));
  // 기록이 있는 done(예: EVAL-0006)은 면제 리스트에 들어가지 않는다.
  assert.ok(!GRANDFATHERED_DONE.has("EVAL-0006"));
});

// ─────────────── detectStaleStatus (mergedBranches·branchOf 주입) ───────────────

const merged = new Set(["feat/rn-verify-data"]);

test("detectStaleStatus: todo 인데 WP 브랜치 머지됨 → 경고", () => {
  const warns = detectStaleStatus(makeTask({ ...VALID_FM, Status: "todo" }), merged, {
    branchOf: () => "feat/rn-verify-data",
  });
  assert.equal(warns.length, 1);
  assert.ok(/Work Package branch 'feat\/rn-verify-data' is merged/.test(warns[0]));
});

test("detectStaleStatus: in_progress 인데 브랜치 머지됨 → 경고", () => {
  const warns = detectStaleStatus(makeTask({ ...VALID_FM, Status: "in_progress" }), merged, {
    branchOf: () => "feat/rn-verify-data",
  });
  assert.equal(warns.length, 1);
});

test("detectStaleStatus: done 은 검사 대상 아님 → 경고 0", () => {
  const warns = detectStaleStatus(makeTask({ ...VALID_FM, Status: "done" }), merged, {
    branchOf: () => "feat/rn-verify-data",
  });
  assert.deepEqual(warns, []);
});

test("detectStaleStatus: blocked 은 검사 대상 아님 → 경고 0", () => {
  const warns = detectStaleStatus(
    makeTask({ ...VALID_FM, Status: "blocked", "Blocked-by": "EVAL-0010" }),
    merged,
    { branchOf: () => "feat/rn-verify-data" },
  );
  assert.deepEqual(warns, []);
});

test("detectStaleStatus: todo 지만 브랜치 미머지 → 경고 0", () => {
  const warns = detectStaleStatus(makeTask({ ...VALID_FM, Status: "todo" }), merged, {
    branchOf: () => "feat/rn-not-merged",
  });
  assert.deepEqual(warns, []);
});

test("detectStaleStatus: 브랜치 추출 실패(null) → 경고 0", () => {
  const warns = detectStaleStatus(makeTask({ ...VALID_FM, Status: "todo" }), merged, {
    branchOf: () => null,
  });
  assert.deepEqual(warns, []);
});

test("extractWorkPackageBranch: 본문 첫 백틱 feat/<slug> 추출", () => {
  const branch = extractWorkPackageBranch({
    content: "> WP1 (`feat/rn-verify-data`). 게이트 무관 — `feat/other` 는 뒤.",
  });
  assert.equal(branch, "feat/rn-verify-data");
});

test("extractWorkPackageBranch: 본문에 브랜치 없으면 null", () => {
  assert.equal(extractWorkPackageBranch({ content: "브랜치 언급 없음" }), null);
});

// ─────────────── 통합 스모크 (실제 repo) ───────────────

test("loadMigrationTasks: 0001~0003 grandfather 제외, 0004+ 만 로드", () => {
  const tasks = loadMigrationTasks();
  assert.ok(tasks.every((t) => Number(t.repoPath.match(/(\d{4})/)[1]) >= 4));
});

test("validateTask: 실제 EVAL-0004 task → 위반 0 (회귀 가드)", () => {
  const t = loadMigrationTasks().find((x) => x.frontmatter.Task === "EVAL-0004");
  assert.ok(t, "EVAL-0004 task 존재");
  assert.deepEqual(validateTask(t), []);
});

// ─────────────── 상류 AC 추적성 (D7 · 05 §7 Tier 1) ───────────────

test("extractDefinedAcIds: full id + prefix(id 파생·* 선언) 추출", () => {
  const d = extractDefinedAcIds("`AC-settle-1` 본문 ... 그리고 `AC-cheat-detect-*` 핸들");
  assert.ok(d.ids.has("AC-settle-1"));
  assert.ok(d.prefixes.has("AC-settle")); // full id 에서 파생
  assert.ok(d.prefixes.has("AC-cheat-detect")); // * 선언에서
});

test("extractDefinedAcIds: settle 와 settle-trigger prefix 가 충돌하지 않음", () => {
  const d = extractDefinedAcIds("`AC-settle-7` `AC-settle-trigger-3`");
  assert.ok(d.prefixes.has("AC-settle"));
  assert.ok(d.prefixes.has("AC-settle-trigger"));
});

test("extractAcCitations: id·prefix 인용 추출, PRD-AC- 도 AC- 로", () => {
  const refs = extractAcCitations("Parent: PRD-AC-deposit-hold-1 · 의존 AC-peer-reject-*");
  const raws = refs.map((r) => r.raw);
  assert.ok(raws.includes("AC-deposit-hold-1"));
  assert.ok(raws.includes("AC-peer-reject-*"));
});

test("resolveAcCitation: id 는 ids 또는 prefix 로, prefix 는 prefixes 로 resolve", () => {
  const index = buildAcIndex(["`AC-settle-1` `AC-auto-verify-*`"]);
  assert.equal(
    resolveAcCitation({ kind: "id", id: "AC-settle-1", prefix: "AC-settle" }, index),
    true,
  );
  // full id 정의는 없지만 feature prefix 가 선언된 경우(예: auto-verify-2)
  assert.equal(
    resolveAcCitation({ kind: "id", id: "AC-auto-verify-2", prefix: "AC-auto-verify" }, index),
    true,
  );
  assert.equal(resolveAcCitation({ kind: "prefix", prefix: "AC-settle" }, index), true);
  assert.equal(
    resolveAcCitation({ kind: "id", id: "AC-ghost-9", prefix: "AC-ghost" }, index),
    false,
  );
});

test("validateAcTraceability: 사라진 AC 인용 → drift 위반, 중복은 1회", () => {
  const index = buildAcIndex(["`AC-settle-1` `AC-deposit-hold-1`"]);
  const ok = validateAcTraceability(index, [
    { repoPath: "docs/eng-stories/x.md", content: "AC-settle-1 ... AC-settle-1" },
  ]);
  assert.deepEqual(ok, []);
  const bad = validateAcTraceability(index, [
    { repoPath: "docs/eng-stories/x.md", content: "AC-ghost-1 두 번 AC-ghost-1" },
  ]);
  assert.equal(bad.length, 1);
  assert.ok(/AC citation does not resolve/.test(bad[0]));
  assert.ok(/AC-ghost-1/.test(bad[0]));
});

// 통합 스모크 (실제 repo) — 현 인스턴스가 PRD 와 정합한지 회귀 가드
test("loadAcIndex: 실제 PRD 에서 greenfield AC id 로드", () => {
  const index = loadAcIndex();
  assert.ok(index.ids.has("AC-settle-1"));
  assert.ok(index.prefixes.has("AC-deposit-hold"));
});

test("validateAcTraceability: 실제 repo 의 모든 spine 인용이 resolve (drift 0)", () => {
  const errors = validateAcTraceability(loadAcIndex(), loadCitationFiles());
  assert.deepEqual(errors, []);
});

// ── renderGoalPrompt (harness:goal) — task 섹션 → /goal 프롬프트 파생 ──
test("renderGoalPrompt: ADR 게이트·수동 핸드오프·worktree base·mobile env 를 task 에서 도출", () => {
  const task = {
    repoPath: "evals/tasks/0099-rn-foo.md",
    absolutePath: "/repo/evals/tasks/0099-rn-foo.md",
    frontmatter: {
      Task: "EVAL-0099",
      "Blocked-by": "[task:EVAL-0098] [adr:0033] — complete + ADR accepted.",
    },
    verificationCommands: "```bash\npnpm -r test\n# manual: device login\n```",
    sourcePaths: [pr("docs/PRD.md")],
    targetPaths: [pr("apps/mobile")],
    content: [
      "# EVAL-0099: Foo title",
      "## Parent Links",
      "- Parent Work Package: `feat/rn-foo` (EVAL-0099).",
      "## Goal",
      "goal text",
      "## Requirements",
      "- do x",
      "## Non-goals",
      "- not y",
      "## Acceptance Criteria",
      "- ac1",
      "## Verification Commands",
      "```bash",
      "pnpm -r test",
      "```",
      "## Harness Impact Questions",
      "1. folder? Yes",
      "## Stop Condition",
      "- done",
    ].join("\n"),
  };
  const out = renderGoalPrompt(task, { lookupBranch: () => "feat/rn-base" });
  assert.match(out, /# \/goal prompt — EVAL-0099: Foo title/);
  assert.match(out, /git worktree add -b feat\/rn-foo \.\.\/with-key-rn-foo feat\/rn-base/);
  assert.match(out, /ADR\/spec 게이트/);
  assert.match(out, /PO·실기기 핸드오프/);
  assert.match(out, /EXPO_PUBLIC_\* 만/);
  assert.match(out, /do x/);
  assert.match(out, /not y/);
});

test("renderGoalPrompt: ADR/mobile 신호 없으면 게이트·핸드오프 생략, base 기본 develop", () => {
  const task = {
    repoPath: "evals/tasks/0099-web-bar.md",
    absolutePath: "/repo/evals/tasks/0099-web-bar.md",
    frontmatter: { Task: "EVAL-0099" },
    verificationCommands: "```bash\npnpm -r test\n```",
    sourcePaths: [pr("docs/PRD.md")],
    targetPaths: [pr("apps/web/src/x.ts")],
    content: [
      "# EVAL-0099: Bar title",
      "## Parent Links",
      "- Parent Work Package: `feat/web-bar`.",
      "## Requirements",
      "- do z",
      "## Non-goals",
      "- not w",
      "## Acceptance Criteria",
      "- ac",
      "## Verification Commands",
      "```bash",
      "pnpm -r test",
      "```",
      "## Stop Condition",
      "- done",
    ].join("\n"),
  };
  const out = renderGoalPrompt(task);
  assert.doesNotMatch(out, /ADR\/spec 게이트/);
  assert.doesNotMatch(out, /PO·실기기 핸드오프/);
  assert.match(out, /git worktree add -b feat\/web-bar \.\.\/with-key-web-bar develop/);
  assert.match(out, /NEXT_PUBLIC_ 접두 금지/);
});

test("renderGoalPrompt: Depends-on 만 있는 task 도 첫 task: 토큰을 base 로 (Blocked-by 우선)", () => {
  const base = {
    repoPath: "evals/tasks/0099-web-dep.md",
    absolutePath: "/repo/evals/tasks/0099-web-dep.md",
    verificationCommands: "```bash\npnpm -r test\n```",
    sourcePaths: [pr("docs/PRD.md")],
    targetPaths: [pr("apps/web/src/x.ts")],
    content: [
      "# EVAL-0099: Dep title",
      "## Parent Links",
      "- Parent Work Package: `feat/web-dep`.",
      "## Requirements",
      "- do z",
      "## Non-goals",
      "- not w",
      "## Acceptance Criteria",
      "- ac",
      "## Verification Commands",
      "```bash",
      "pnpm -r test",
      "```",
      "## Stop Condition",
      "- done",
    ].join("\n"),
  };
  const dependsOnly = {
    ...base,
    frontmatter: { Task: "EVAL-0099", "Depends-on": "[task:EVAL-0097] — intra-feature 순서." },
  };
  const out = renderGoalPrompt(dependsOnly, { lookupBranch: (id) => `feat/base-of-${id}` });
  assert.match(
    out,
    /git worktree add -b feat\/web-dep \.\.\/with-key-web-dep feat\/base-of-EVAL-0097/,
  );

  const both = {
    ...base,
    frontmatter: {
      Task: "EVAL-0099",
      "Blocked-by": "[task:EVAL-0096] — 하드 게이트.",
      "Depends-on": "[task:EVAL-0097] — 순서.",
    },
  };
  const outBoth = renderGoalPrompt(both, { lookupBranch: (id) => `feat/base-of-${id}` });
  assert.match(outBoth, /feat\/base-of-EVAL-0096/); // Blocked-by 우선
});

test("renderGoalPrompt: prose 의 ADR 단어는 더 이상 게이트 신호가 아님 — adr:/spec: 토큰만", () => {
  const task = {
    repoPath: "evals/tasks/0099-web-bar.md",
    absolutePath: "/repo/evals/tasks/0099-web-bar.md",
    frontmatter: {
      Task: "EVAL-0099",
      "Blocked-by": "[task:EVAL-0098] — ADR-0032 는 이미 accepted(인용일 뿐).",
    },
    verificationCommands: "```bash\npnpm -r test\n```",
    sourcePaths: [pr("docs/PRD.md")],
    targetPaths: [pr("apps/web/src/x.ts")],
    content: [
      "# EVAL-0099: Bar title",
      "## Parent Links",
      "- Parent Work Package: `feat/web-bar`.",
      "## Requirements",
      "- do z",
      "## Non-goals",
      "- not w",
      "## Acceptance Criteria",
      "- ac",
      "## Verification Commands",
      "```bash",
      "pnpm -r test",
      "```",
      "## Stop Condition",
      "- done",
    ].join("\n"),
  };
  const out = renderGoalPrompt(task, { lookupBranch: () => "feat/x" });
  assert.doesNotMatch(out, /ADR\/spec 게이트/);
});

// ── validateGoalPromptLength — /goal 4000자 하드 리밋 (render 주입 → 파일시스템 비의존) ──
test("validateGoalPromptLength: 리밋 초과 open task 는 에러, 리밋 이하는 통과", () => {
  const task = {
    repoPath: "evals/tasks/0099-x.md",
    frontmatter: { Task: "EVAL-0099", Status: "todo" },
  };
  const over = validateGoalPromptLength(task, {
    render: () => "x".repeat(GOAL_PROMPT_CHAR_LIMIT + 1),
  });
  assert.equal(over.length, 1);
  assert.match(over[0], /4001 chars > 4000/);
  assert.deepEqual(
    validateGoalPromptLength(task, { render: () => "x".repeat(GOAL_PROMPT_CHAR_LIMIT) }),
    [],
  );
});

test("validateGoalPromptLength: done task 는 초과해도 소급 검사하지 않음", () => {
  const task = {
    repoPath: "evals/tasks/0099-x.md",
    frontmatter: { Task: "EVAL-0099", Status: "done" },
  };
  assert.deepEqual(
    validateGoalPromptLength(task, { render: () => "x".repeat(GOAL_PROMPT_CHAR_LIMIT + 1) }),
    [],
  );
});

test("renderGoalPrompt: prettier 표 padding 을 압축 — 렌더 길이가 정렬 공백과 무관", () => {
  const task = {
    repoPath: "evals/tasks/0099-web-bar.md",
    absolutePath: "/repo/evals/tasks/0099-web-bar.md",
    frontmatter: { Task: "EVAL-0099" },
    verificationCommands: "```bash\npnpm -r test\n```",
    sourcePaths: [pr("docs/PRD.md")],
    targetPaths: [pr("apps/web/src/x.ts")],
    content: [
      "# EVAL-0099: Bar title",
      "## Parent Links",
      "- Parent Work Package: `feat/web-bar`.",
      "## Requirements",
      "- do z",
      "## Non-goals",
      "- not w",
      "## Acceptance Criteria",
      "| 기준                  | 검증                |",
      "| --------------------- | ------------------- |",
      "| 표 padding 압축       | `pnpm test`         |",
      "## Stop Condition",
      "- done",
    ].join("\n"),
  };
  const out = renderGoalPrompt(task);
  assert.match(out, /\| 기준 \| 검증 \|/);
  assert.match(out, /\| --- \| --- \|/);
  assert.match(out, /\| 표 padding 압축 \| `pnpm test` \|/);
});
