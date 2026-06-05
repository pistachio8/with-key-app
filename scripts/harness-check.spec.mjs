// scripts/harness-check.spec.mjs
// 실행: node --test scripts/harness-check.spec.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseFrontmatter,
  extractParentSection,
  extractCitedPaths,
  resolveCitation,
  checkTaskFile,
} from "./harness-check.mjs";

const ROOT = "/repo";
const TASK_DIR = "/repo/evals/tasks";

// frontmatter 있는 정상 0004 task. Parent 인용은 실재 경로(아래 exists mock 이 true).
const VALID_0004 = [
  "---",
  "Task: EVAL-settlement-ledger",
  "Track: greenfield",
  "Kind: migration",
  "Status: todo",
  "---",
  "",
  "# EVAL-settlement-ledger: 보증금 원장",
  "",
  "## Parent Links (추적성 — 위로 1줄씩)",
  "- Parent PRD Feature: AC-settlement-1 (docs/migration/01-rn-mvp-prd.md)",
  "- Parent Engineering Story: ES-settlement (docs/eng-stories/2026-06-05-settlement.md)",
  "",
  "## Goal",
  "원장이 생긴다.",
].join("\n");

// 인용 경로가 실재할 때만 true 를 돌려주는 exists mock.
const EXISTING = new Set([
  "/repo/docs/migration/01-rn-mvp-prd.md",
  "/repo/docs/eng-stories/2026-06-05-settlement.md",
]);
const fakeExists = (p) => EXISTING.has(p);

test("parseFrontmatter: --- 블록을 Key:value 로 파싱", () => {
  const r = parseFrontmatter(VALID_0004);
  assert.equal(r.hasFrontmatter, true);
  assert.equal(r.fields.Track, "greenfield");
  assert.equal(r.fields.Status, "todo");
  assert.match(r.body, /# EVAL-settlement-ledger/); // 본문은 frontmatter 뒤 빈 줄을 포함할 수 있음
});

test("parseFrontmatter: frontmatter 없으면 hasFrontmatter=false", () => {
  const r = parseFrontmatter("# EVAL-0001: 그냥 본문\n\n**Status**: pending");
  assert.equal(r.hasFrontmatter, false);
  assert.deepEqual(r.fields, {});
});

test("parseFrontmatter: 인라인 주석(# ...)을 값에서 제거", () => {
  const r = parseFrontmatter("---\nTrack: port          # D2 주석\n---\n본문");
  assert.equal(r.fields.Track, "port");
});

test("extractParentSection: Parent 헤딩 아래 bullet 만 수집", () => {
  const section = extractParentSection(parseFrontmatter(VALID_0004).body);
  assert.ok(section.includes("docs/migration/01-rn-mvp-prd.md"));
  assert.ok(!section.includes("원장이 생긴다")); // 다음 헤딩에서 멈춤
});

test("extractParentSection: 섹션 없으면 null", () => {
  assert.equal(extractParentSection("# 제목\n\n## Goal\n내용"), null);
});

test("extractCitedPaths: 구체 경로만, 템플릿/브랜치명 제외", () => {
  const text = [
    "- Parent PRD Feature: <PRD-AC-id> (docs/migration/01-rn-mvp-prd.md)",
    "- Parent Job Story: <JS-id> (docs/stories/...)", // 템플릿 ... → 제외
    "- Parent Work Package: WP-x (브랜치 feat/rn-settlement)", // 확장자 없음 → 제외
  ].join("\n");
  assert.deepEqual(extractCitedPaths(text), ["docs/migration/01-rn-mvp-prd.md"]);
});

test("resolveCitation: root-relative · file-relative 둘 다 허용", () => {
  assert.equal(
    resolveCitation("docs/migration/01-rn-mvp-prd.md", TASK_DIR, ROOT, fakeExists),
    true,
  );
  assert.equal(resolveCitation("docs/nope.md", TASK_DIR, ROOT, fakeExists), false);
});

test("checkTaskFile: 정상 0004 task → 위반 0", () => {
  const r = checkTaskFile(
    { filename: "0004-settlement.md", text: VALID_0004, fileDir: TASK_DIR },
    ROOT,
    fakeExists,
  );
  assert.deepEqual(r.violations, []);
  assert.equal(r.skipped, false);
});

test("checkTaskFile: 0001~0003 frontmatter 없음 → grandfather skip", () => {
  const r = checkTaskFile(
    {
      filename: "0001-server-action.md",
      text: "# EVAL-0001\n\n**Status**: pending",
      fileDir: TASK_DIR,
    },
    ROOT,
    fakeExists,
  );
  assert.deepEqual(r.violations, []);
  assert.equal(r.skipped, true);
});

test("checkTaskFile: 0004+ frontmatter 누락 → 위반", () => {
  const r = checkTaskFile(
    { filename: "0004-x.md", text: "# 본문만\n## Parent Links\n- a", fileDir: TASK_DIR },
    ROOT,
    fakeExists,
  );
  assert.equal(r.violations.length, 1);
  assert.match(r.violations[0], /frontmatter 필수/);
});

test("checkTaskFile: Track 미기입 템플릿 값 → 위반", () => {
  const text = VALID_0004.replace("Track: greenfield", "Track: port | greenfield");
  const r = checkTaskFile({ filename: "0005-x.md", text, fileDir: TASK_DIR }, ROOT, fakeExists);
  assert.ok(r.violations.some((v) => /Track=/.test(v)));
});

test("checkTaskFile: Status=blocked 인데 Blocked-by 없음 → 위반", () => {
  const text = VALID_0004.replace("Status: todo", "Status: blocked");
  const r = checkTaskFile({ filename: "0006-x.md", text, fileDir: TASK_DIR }, ROOT, fakeExists);
  assert.ok(r.violations.some((v) => /Blocked-by/.test(v)));
});

test("checkTaskFile: hallucinated Parent 경로 → 위반", () => {
  const text = VALID_0004.replace(
    "docs/eng-stories/2026-06-05-settlement.md",
    "docs/eng-stories/9999-does-not-exist.md",
  );
  const r = checkTaskFile({ filename: "0007-x.md", text, fileDir: TASK_DIR }, ROOT, fakeExists);
  assert.ok(r.violations.some((v) => /hallucinated-path/.test(v)));
});

test("checkTaskFile: Parent 섹션 누락 → 위반", () => {
  const text = ["---", "Track: port", "Status: done", "---", "", "# 제목", "## Goal", "내용"].join(
    "\n",
  );
  const r = checkTaskFile({ filename: "0008-x.md", text, fileDir: TASK_DIR }, ROOT, fakeExists);
  assert.ok(r.violations.some((v) => /Parent Links/.test(v)));
});
