#!/usr/bin/env node
// scan-signals.mjs — withkey-todo 의 신호 수집기.
//
// "다음에 뭘 할까" 를 제안하려면 흩어진 신호를 한 곳에 모아야 한다. 매 실행마다
// 26개 EVAL task 파일 frontmatter 를 일일이 읽는 건 토큰 낭비이고 한두 개를 빠뜨리기
// 쉽다. 이 스크립트는 git · evals/tasks · agent-results · 코드 마커 · 최근 spec/ADR
// 을 한 번에 파싱해 구조화된 텍스트로 출력한다. SKILL.md 는 이 출력 위에서 추론한다.
//
// 의존성 0 (Node 20 built-ins). repo 루트에서 실행 가정.
// 사용: node .claude/skills/withkey-todo/scripts/scan-signals.mjs

import { execSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const sh = (cmd) => {
  try {
    return execSync(cmd, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trimEnd();
  } catch {
    return "";
  }
};
const EVAL_RE = /EVAL-\d{4}/g;
const trunc = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s || "");
const parseFm = (raw) => {
  const fm = {};
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (m) {
    for (const line of m[1].split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) fm[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
  }
  return fm;
};

function section(title) {
  console.log(`\n=== ${title} ===`);
}

// ── 1. 브랜치 & 미커밋 작업 ─────────────────────────────────────────────
// 가장 강한 신호: "지금 손대고 있던 것". 미완 작업은 새 작업을 제안하기 전에 먼저 본다.
section("BRANCH & UNCOMMITTED");
const branch = sh("git rev-parse --abbrev-ref HEAD");
console.log(`branch: ${branch}`);
const porcelain = sh("git status --porcelain");
if (porcelain) {
  console.log("status:");
  console.log(porcelain);
  const stat = sh("git diff --stat") + "\n" + sh("git diff --staged --stat");
  const statLines = stat.split("\n").filter(Boolean);
  if (statLines.length) {
    console.log("diffstat:");
    console.log(statLines.join("\n"));
  }
} else {
  console.log("status: (clean — 미커밋 변경 없음)");
}

// ── 2. 최근 커밋 (진행 흐름) ────────────────────────────────────────────
// 최근에 무엇을 했고 무엇이 진행 중인지. fix 반복·forward-fix·EVAL 참조를 읽는다.
section("RECENT COMMITS (last 30)");
const log = sh("git log --oneline -30");
console.log(log || "(none)");
const commitEvals = new Set(log.match(EVAL_RE) || []);
if (commitEvals.size) console.log(`\ncommits reference: ${[...commitEvals].sort().join(", ")}`);

// ── 3. EVAL task 백로그 (이 repo 의 실 backlog SoT) ─────────────────────
// 코드 TODO 주석은 이 repo 에 거의 없다. 실제 할 일은 evals/tasks/*.md 의 frontmatter
// (Status · Depends-on · Blocked-by) 에 산다. status 별로 모아 출력한다.
// feat/fix 커밋 제목에 등장한 EVAL id → drift candidate 탐지용 (task status 와 git 현실 대조).
// chore/docs/merge 는 제외 — 실제 구현 출하 신호는 feat/fix 에 있다.
const shipped = {};
for (const line of log.split("\n")) {
  const sm = line.match(/^(\S+)\s+(.*)$/);
  if (!sm || !/^(feat|fix)[(:]/.test(sm[2])) continue;
  for (const id of sm[2].match(EVAL_RE) || []) (shipped[id] ||= []).push(sm[1]);
}

// ── 2.5 원격 동기 상태 (origin/develop) ─────────────────────────────────
// 로컬 클론이 stale 하면 task frontmatter 도 git log 도 과거 시점이다. 다른 세션/
// 머신에서 작업해 머지된 경우(실례: EVAL-0016/PR#213 — 머지 3분 뒤 stale 클론이
// done task 를 P1 로 추천) 로컬 신호만으로는 구조적으로 못 잡는다. fetch 후
// origin/develop 와의 차이를 신호에 합류시킨다. backlog SoT 는 develop 에서 전진한다.
section("REMOTE SYNC (origin/develop)");
sh("git fetch origin develop --quiet");
const behind = sh("git rev-list --count HEAD..origin/develop");
const remoteStatus = {}; // EVAL id → origin/develop 기준 Status (backlog 에서 로컬 교정용)
if (behind === "0") {
  console.log("up to date with origin/develop");
} else if (behind === "") {
  console.log("(fetch/rev-list 실패 — offline? 로컬 신호만 사용. stale 추천 가능성 유의)");
} else {
  console.log(
    `local is ${behind} commit(s) behind origin/develop — backlog 는 원격 기준으로 교정함`,
  );
  const remoteLog = sh("git log --oneline HEAD..origin/develop");
  console.log("remote-ahead commits:");
  console.log(remoteLog);
  // 원격에만 있는 feat/fix 커밋도 drift 후보 탐지(shipped)에 합류.
  for (const line of remoteLog.split("\n")) {
    const sm = line.match(/^(\S+)\s+(.*)$/);
    if (!sm || !/^(feat|fix)[(:]/.test(sm[2])) continue;
    for (const id of sm[2].match(EVAL_RE) || []) (shipped[id] ||= []).push(`${sm[1]}(remote)`);
  }
  // 원격에서 바뀐 task 파일의 frontmatter Status 를 읽어 backlog 출력 시 로컬값을 덮는다.
  const changedTasks = sh("git diff --name-only HEAD origin/develop -- evals/tasks");
  for (const f of changedTasks.split("\n").filter((f) => f.endsWith(".md"))) {
    const raw = sh(`git show origin/develop:${f}`);
    if (!raw) continue;
    const fm = parseFm(raw);
    const id = fm.task || `EVAL-${path.basename(f).slice(0, 4)}`;
    if (fm.status) remoteStatus[id] = fm.status.toLowerCase().replace(/\s+/g, "_");
  }
}

section("EVAL TASK BACKLOG (evals/tasks/*.md)");
const tasksDir = path.join(root, "evals", "tasks");
if (existsSync(tasksDir)) {
  const tasks = [];
  const statusById = {};
  for (const file of readdirSync(tasksDir)
    .filter((f) => f.endsWith(".md"))
    .sort()) {
    const raw = readFileSync(path.join(tasksDir, file), "utf8");
    const fm = parseFm(raw);
    const id = fm.task || `EVAL-${file.slice(0, 4)}`;
    const titleLine = raw.split("\n").find((l) => l.startsWith("# "));
    const title = titleLine ? titleLine.replace(/^#\s*/, "") : "";
    let status = (fm.status || "other").toLowerCase().replace(/\s+/g, "_");
    // origin/develop 가 backlog SoT — 원격에서 Status 가 전진했으면 로컬값을 덮는다.
    let corrected = "";
    if (remoteStatus[id] && remoteStatus[id] !== status) {
      corrected = `local=${status} → origin/develop=${remoteStatus[id]}`;
      status = remoteStatus[id];
    }
    tasks.push({
      id,
      title,
      status,
      corrected,
      dep: fm["depends-on"] || "",
      blk: fm["blocked-by"] || "",
    });
    statusById[id] = status;
  }
  const correctedTasks = tasks.filter((t) => t.corrected);
  if (correctedTasks.length) {
    console.log(`\n[remote-corrected — 로컬 frontmatter 가 stale, 아래는 origin/develop 기준]`);
    for (const t of correctedTasks) console.log(`- ${t.id}: ${t.corrected}`);
  }
  // todo 의 depends-on 에서 EVAL id 를 뽑아 현재 status 로 해석 → 모든 dep 가 done 이면 READY,
  // 아니면 WAITING. "todo ≠ 즉시 착수 가능" 의 가장 틀리기 쉬운 추론을 코드로 전진 배치.
  const resolveDeps = (s) => {
    const ids = [...new Set(s.match(EVAL_RE) || [])];
    if (!ids.length) return "deps: none → READY";
    const ready = ids.every((id) => statusById[id] === "done");
    return `deps: ${ids.map((id) => `${id}[${statusById[id] || "?"}]`).join(" ")} → ${ready ? "READY" : "WAITING"}`;
  };
  const order = ["in_progress", "todo", "blocked", "done", "other"];
  for (const st of order) {
    const items = tasks.filter((t) => t.status === st);
    if (!items.length) continue;
    console.log(`\n[${st}] (${items.length})`);
    for (const t of items) {
      console.log(`- ${t.id} — ${trunc(t.title, 70)}`);
      if (st === "todo") console.log(`    ${resolveDeps(t.dep)}`);
      if (st === "blocked") console.log(`    blocked-by: ${trunc(t.blk || t.dep, 90)}`);
    }
  }
  // drift 후보: status 가 todo/blocked 인데 feat/fix 커밋에 이미 등장. 자동 판정 금지 —
  // 커밋이 '출하'인지 '활성/backlog 정의'인지 제목으로 확인해야 하므로 후보로만 제시.
  const drift = tasks.filter((t) => ["todo", "blocked"].includes(t.status) && shipped[t.id]);
  if (drift.length) {
    console.log(`\n[drift candidates — task status vs git, 반드시 커밋 제목으로 VERIFY]`);
    for (const t of drift)
      console.log(
        `- ${t.id} status=${t.status} 인데 feat/fix 커밋 등장: ${shipped[t.id].join(", ")} (출하인지 '활성/backlog'인지 제목 확인)`,
      );
  }
  console.log(
    `\nNOTE: READY = depends-on 이 모두 done(파일 기준). WAITING = 선행 todo/blocked 대기. ` +
      `단 drift 후보는 파일이 todo 라도 실제로 done 일 수 있으니 git 으로 교정하라. ` +
      `'blocked' 은 게이트/외부 조건 해제 전까지 P0 제안 금지.`,
  );
} else {
  console.log("(evals/tasks 디렉터리 없음 — 이 repo 가 아닐 수 있음)");
}

// ── 4. 완료 / 미룬 검증 (agent-results.json) ────────────────────────────
// 이미 done 인 task 를 다시 제안하면 안 된다. runs[].verification.ci_only_deferred 는
// "로컬에선 못 돌려 CI 로 미룬 검증" — 그 자체가 follow-up 작업이다.
section("DONE / DEFERRED (evals/results/agent-results.json)");
const resPath = path.join(root, "evals", "results", "agent-results.json");
if (existsSync(resPath)) {
  try {
    const data = JSON.parse(readFileSync(resPath, "utf8"));
    const doneRuns = (data.runs || []).filter((r) => r.status === "done").map((r) => r.taskId);
    if (doneRuns.length) console.log(`done runs: ${[...new Set(doneRuns)].join(", ")}`);
    for (const r of data.runs || []) {
      const def = r.verification && r.verification.ci_only_deferred;
      if (def) console.log(`deferred-verify [${r.taskId}]: ${trunc(def, 160)}`);
    }
  } catch {
    console.log("(파싱 실패)");
  }
} else {
  console.log("(없음)");
}

// ── 5. 코드 마커 (이 repo 에선 보통 희소) ───────────────────────────────
section("CODE MARKERS (TODO/FIXME/HACK/XXX)");
const markers = sh(
  `grep -rIn -E "(TODO|FIXME|HACK|XXX)\\b" --include=*.ts --include=*.tsx --include=*.sql apps packages supabase 2>/dev/null | head -25`,
);
console.log(markers || "(none — 이 repo 는 코드 주석 대신 evals/tasks 로 추적한다)");

// ── 6. 최근 spec / ADR (후속 액션이 숨는 곳) ────────────────────────────
// spec·ADR 본문에 "후속"·"follow-up"·EVAL-XXXX todo 형태로 미래 작업이 적혀 있다.
section("RECENT SPECS / ADRs (newest 8 each)");
for (const [label, dir] of [
  ["specs", path.join(root, "docs", "superpowers", "specs")],
  ["adr", path.join(root, "docs", "adr")],
]) {
  if (!existsSync(dir)) continue;
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
    .sort()
    .slice(-8);
  console.log(`\n[${label}]`);
  for (const f of files) console.log(`- ${f}`);
}

console.log("\n=== END ===");
