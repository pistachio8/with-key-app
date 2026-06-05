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
  validateTask,
  loadMigrationTasks,
  extractDefinedAcIds,
  extractAcCitations,
  resolveAcCitation,
  buildAcIndex,
  validateAcTraceability,
  loadAcIndex,
  loadCitationFiles,
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
