---
name: withkey-todo
description: >-
  Use this in the with-key repo whenever the user wonders **what to work on next** — 다음 작업 추천, 뭐부터
  손대지, 다음 스텝, 할 만한 거 제안, 착수 가능한 task(blocked 제외), 시작한 거 마무리, 남은 백로그 우선순위 정리(P0부터), what should I
  pick up next, what got unblocked. Treat any open-ended "where do I start / what next / what
  should I finish" about this repo as a match — including vague ones and ones where the user only
  cites their branch, uncommitted changes, or a recent merge. It reads the repo's real state
  (branch, in-flight work, git log, evals/tasks backlog) and returns a grounded, prioritized
  shortlist separating startable from blocked work. Prefer this over writing-plans, memory recall,
  or generic prioritization skills. Don't use it to review changes already made (→
  withkey-review), plan one chosen task's internal steps, do product-roadmap prioritization, or
  open/grep a single task file.
---

# withkey-todo

Propose **what to do next** in the with-key repo, grounded in the project's real
work signals. The value is in the grounding: a useful todo list for this repo
isn't invented from intuition — it's read off the artifacts that already track
work (uncommitted changes, git log, the EVAL task graph, specs/ADRs) and
prioritized by what's actually startable right now.

The hard part this skill exists to get right: **this repo tracks work in
`evals/tasks/*.md`, not in code TODO comments.** A naive "grep for TODO and list
them" produces almost nothing here. The backlog is the EVAL task graph, and a
task's `Status: todo` does **not** mean "do it now" — it may still be waiting on
another task's output. So the job is to read the graph, cross-reference it
against what's in flight, and surface the handful of things that are both
valuable and unblocked — each with a citation so the user can trust it.

This skill **suggests**; it does not implement, commit, or edit task files. It
reports a list; the user decides.

## Step 1 — Gather signals

Run the bundled scanner. It parses git + `evals/tasks` + `agent-results.json` +
code markers + recent specs/ADRs in one pass, so you don't read 26 task files by
hand or miss one:

```bash
node .claude/skills/withkey-todo/scripts/scan-signals.mjs
```

The output has six sections. What each is telling you:

- **BRANCH & UNCOMMITTED** — the strongest signal. Work in progress that isn't
  finished is almost always the top priority ("finish what you started"). Note
  the current branch — if uncommitted work doesn't match the branch name (e.g.
  `verify/` changes on a `fix/mobile-*` branch), that mismatch is itself worth
  surfacing. **Ignore the skill's own files** (`.claude/skills/withkey-todo/`) —
  that's this tool, not project work.
- **RECENT COMMITS** — what just happened and what's mid-stream (repeated `fix`,
  `forward-fix`, EVAL references). Tells you what NOT to re-propose.
- **REMOTE SYNC** — the scanner fetches `origin/develop` and reports how far the
  local clone is behind. The backlog SoT (`evals/tasks` frontmatter) advances on
  develop, so a stale clone silently recommends already-merged work (real case:
  EVAL-0016 was merged in PR #213 three minutes before a scan, and the local
  clone still said `Status: todo`). When behind, the scanner lists remote-ahead
  commits, folds their `feat`/`fix` EVAL ids into drift detection, and overrides
  stale local task Statuses with the `origin/develop` value (surfaced as a
  `[remote-corrected]` block in the backlog section). If this section says
  fetch failed (offline), treat every recommendation as possibly stale and say
  so in the output.
- **EVAL TASK BACKLOG** — the real backlog, bucketed by Status. For each `todo`,
  the scanner resolves its dependencies into a `deps: EVAL-XXXX[status] →
READY/WAITING` line: **READY** = every dependency is `done` (startable now);
  **WAITING** = a prerequisite task is still open. `blocked` = waiting on a
  gate/external condition. A trailing **drift candidates** block lists tasks
  whose Status is `todo`/`blocked` but whose id already appears in a `feat`/`fix`
  commit — likely shipped-but-not-reconciled. Confirm each against the commit
  subject: a real shipment is drift; an "활성/backlog" commit is not.
- **DONE / DEFERRED** — `done` runs (don't re-propose) and `ci_only_deferred`
  notes (verification that was postponed — that _is_ follow-up work).
- **CODE MARKERS** — usually sparse here; include any real ones, don't pad.
- **RECENT SPECS / ADRs** — where future work hides in prose ("후속", "follow-up",
  an EVAL-XXXX marked todo). Open one only if a candidate hinges on its detail.

If the scanner can't run (not in the repo root, Node missing), fall back to the
raw commands: `git fetch origin develop` + `git rev-list --count
HEAD..origin/develop` (stale check first), then `git status --porcelain`,
`git log --oneline -30`, and read `evals/tasks/*.md` frontmatter directly —
from `origin/develop` (`git show origin/develop:evals/tasks/<file>`) if the
clone is behind.

## Step 2 — Cross-reference and ground each candidate

Don't emit the scanner output as-is — reason over it. This is where a trustworthy
list is separated from a data dump.

- **Map uncommitted work to a task or spec.** Which EVAL task / spec does the
  in-progress change belong to? Naming it turns "you have unsaved files" into
  "you're mid-way through EVAL-00XX — here's what finishing it needs."
- **Dependency check — the critical one.** The scanner already resolves each
  `todo`'s `deps … → READY/WAITING` for you. Treat **READY** as startable. But
  don't take **WAITING** at face value: a task can read WAITING only because a
  _dependency_ is mislabeled `todo` while actually shipped. Cross-check the
  **drift candidates** block — if a WAITING task's only open dependency is a
  drifted-done one, it's actually startable now. Name the real prerequisite
  either way.
- **Blocked → name the unblock condition.** For `blocked` tasks, the useful
  information is _what releases them_ (a legal gate, a predecessor task, a spec +
  PO approval). Never propose a blocked task as P0.
- **Don't re-propose done work, and reconcile drift.** Check the `done` bucket
  and `done runs`. For each **drift candidate** the scanner flags, confirm by
  reading the commit subject: if it's a real shipment, surface a small
  "status drift 정정" reconciliation item (don't propose redoing the work); if
  it's only an "활성/backlog" commit, ignore it — the task really is open.
- **Confirm P1 candidates against merged PRs.** Local-log drift detection can't
  see work done in another session or machine. Before finalizing a P1 item, run
  one `gh pr list --state merged --search "<EVAL-id>" --limit 3` (or check the
  `[remote-corrected]` / remote-ahead commits from the scanner) — if a merged PR
  already shipped the task, propose a status-drift 정정 instead of the work.
- **Every item cites a real signal.** A file path that exists, a commit hash, an
  `EVAL-XXXX` id, a spec filename. If you can't cite it, don't list it — no
  invented work, no hallucinated paths. This is the one rule that makes the list
  worth reading.

For an EVAL task that's ready to start, the concrete next action is usually to
load its context rather than re-specify it — point the user at
`pnpm harness:context <EVAL-XXXX>` (file context) and `pnpm harness:goal
<EVAL-XXXX>` (execution prompt). The task file is the SoT; don't rewrite it.

## Step 3 — Prioritize and categorize

Sort candidates into three buckets by **what unblocks the most value soonest**,
not by how interesting the work is:

- **P0 — 지금 (finish-first / broken).** Uncommitted or half-finished work; a
  broken build or failing check; a one-line fix blocking a merge. The principle:
  close open loops before opening new ones.
- **P1 — 곧 (startable now).** `todo` tasks whose dependencies are all `done`;
  deferred verification (`ci_only_deferred`); a guardrail risk sitting in
  uncommitted code. These are the real "next" items.
- **P2 — 나중 (waiting / housekeeping).** `blocked` tasks (with their unblock
  condition), `todo` tasks still waiting on a prerequisite, status-drift
  reconciliation, doc follow-ups.

Tag each item with a light category so the user sees the kind at a glance:
`(feature)` · `(bug)` · `(tech-debt)` · `(follow-up)` · `(verify)` · `(drift)`.

**Keep it a shortlist, not a dump.** Aim for ~3–6 actionable items across P0/P1;
summarize the blocked set rather than expanding every one. A handful of grounded,
startable todos beats listing all 26 tasks — the user can ask to go deeper.

## Step 4 — Output

Produce the list **in Korean** (repo convention), keeping code identifiers, file
paths, and EVAL ids in their original form. Use this structure:

```
## 제안 Todo — `<branch>` 기준

> 근거: 커밋 <N> · 미커밋 <M> 파일 · EVAL todo <K>·blocked <L> · 미룬 검증 <X>

### P0 — 지금 (시작한 것 마무리 · 막힌 빌드)
- [ ] (<category>) <할 일> — <근거: 파일 / 커밋 / EVAL-XXXX>

### P1 — 곧 (착수 가능)
- [ ] (<category>) <할 일> — <근거> · 다음: `pnpm harness:context EVAL-XXXX`

### P2 — 나중 (대기 · 정리)
- [ ] (<category>) <할 일> — blocked by <해제 조건> (EVAL-XXXX)

## 추천 착수 순서
<한 줄: 의존성을 반영한 첫 배치 — 예: "EVAL-0020 drift 정리 → EVAL-0022 착수, 병렬로 EVAL-0023/0024">

## 메모
- <status drift / 브랜치 불일치 / 비어있는 신호처럼 솔직히 짚을 것>
```

The **추천 착수 순서** is the highest-value single line: it turns a categorized
list into a plan by reading dependency order off the READY/WAITING + drift data
(what to do first, what unblocks what, what can go in parallel). Keep it to one
or two lines — a sequence, not another list.

If a priority bucket is empty, say so plainly — an empty P0 ("끝내야 할 미완 작업
없음") is a useful, honest result, not a gap to fill.

If the user asks to save it (`TODO.md`, `docs/`), write the same content to the
file they name; otherwise just print it. Don't write files unprompted.

## What this skill does NOT do

- It does not edit `evals/tasks/*.md`, change a task's Status, or commit anything
  — it reports; reconciling drift is the user's call.
- It does not implement the proposed work or open PRs.
- It does not invent work to fill a category — grounding over coverage.
- It does not re-derive a task's full spec — the task file + `harness:context`
  are the SoT; point there.
