---
name: withkey-review
description: >-
  Self-review the current branch's changes (git diff) against with-key's
  project guardrails before opening a PR. Use this whenever the user wants
  their in-progress changes checked as a whole — phrasings like "리뷰해줘",
  "내 변경 검토해줘", "PR 올리기 전에 봐줘", "커밋 전에 체크해줘", "방금 작업한 거
  봐줘". Reviews goal fit (does the change meet its AC), completeness (missing
  cross-artifact updates / parity), scope creep, correctness, with-key
  guardrails (security/secrets, Server Action · RSC · route colocation, zod
  SoT, Supabase/RLS, AI diary, analytics event parity, env), and test
  reliability. When the diff touches supabase/migrations/**, it also applies
  the migration rules and risks (append-only numbering, one-way, SECURITY
  DEFINER RPC, immutable ledgers, re-runnability, backfill, prod-apply
  gating). Unlike the single-file review.md command or the cloud /code-review
  ultra, this is a fast local self-review over the whole branch diff. Prefer
  this skill over a generic review when the user is working in the with-key
  repo and asks to check, review, or sanity-check changes they just made.
---

# withkey-review

A fast **self-review** pass over the current branch's changes, checked against
with-key's project guardrails. The goal mirrors what a careful engineer does
before requesting a peer review: confirm the change does its job, completely and
safely, so a reviewer's time (and a CI round-trip) isn't wasted on things you
could have caught yourself.

This is **not** an exhaustive nitpick pass and **not** a redesign proposal.
Confidence over coverage. See "What this skill does NOT do" below.

The authoritative guardrail definitions live in the repo docs; this skill is the
runner that applies them to a diff. When something here is ambiguous, the SoT is:
`docs/QUALITY_GATE.md`, `AGENTS.md` (§3 가드레일), `docs/ARCHITECTURE.md`,
`docs/BE_SCHEMA.md`. Don't re-read all of them every run — rely on the embedded
checklist below and only open a doc when a finding hinges on a detail you're
unsure about.

## Step 1 — Get the diff

By default, review the changes on the current branch plus anything uncommitted.
Run these to assemble the review surface:

```bash
# Pick the base branch the branch forked from (develop preferred, else main)
BASE=$(git show-ref --verify --quiet refs/remotes/origin/develop && echo origin/develop || echo origin/main)
MB=$(git merge-base HEAD "$BASE")
git --no-pager diff --stat "$MB"...HEAD        # committed branch changes (overview)
git --no-pager diff "$MB"...HEAD               # committed branch changes (full)
git --no-pager diff                            # unstaged working tree
git --no-pager diff --staged                   # staged but uncommitted
```

If the branch has no commits ahead of base, the real change lives in the working
tree (`git diff` / `--staged`) — review that. Variations to honor:

- **"staged만"** / "커밋 전 게이트" → review only `git diff --staged`.
- **A pasted diff or a `.diff`/`.patch` file** → review that instead of running git.
- **Specific files named** → restrict to those paths.

If the diff is empty, say so and stop. Read the **full surrounding code** of
changed regions, not just the hunks — a diff can look fine in isolation and still
break an invariant just outside the hunk.

## Step 2 — Establish the goal and the change surface

Before hunting defects, pin down two things — you can't judge "did it work" or
"what's missing" without them:

- **The goal.** What is this diff supposed to accomplish? Find the stated intent:
  the referenced PRD AC, spec (`docs/superpowers/specs/*`), ADR, or eval task
  (`evals/tasks/*.md`). If the user gave a task description, use that.
- **The change surface.** Which files/axes the diff touches, whether any
  spec-required path is in play (`supabase/migrations/**`, `src/lib/supabase/**`,
  `middleware.ts`, `packages/domain/src/keywords/pool.ts`, `packages/domain/src/validators/**`,
  `apps/web/src/lib/analytics/track.ts`, `src/lib/ai/**`), and the verification
  state (have `pnpm typecheck` / `lint` / `test` been run?).

## Step 3 — Review across these axes

Apply each axis to the changed code. For every finding give **file:line**, a
one-line **why it matters**, and a concrete fix. Skip an axis the diff doesn't
touch; don't invent findings to fill it — an empty axis is a good result.

### A. 목표 적합성 — Goal fit

Does the diff actually achieve its stated goal / the AC it claims? A change that
is clean and guardrail-compliant but doesn't deliver the goal is the most
expensive miss — nothing downstream will catch it.

- Trace each claimed AC / acceptance point to the code that satisfies it.
- Watch for partial implementations: a goal that needs three things where the
  diff does two.
- **Why**: correctness-of-detail is worthless if the change solves the wrong
  problem, or only half of it.

### B. 변경 누락 — Completeness / missing changes

What does this change _imply_ that isn't here? This is the lens reviewers most
often miss.

- **Cross-artifact mirrors.** When the same rule lives in two places, both must
  move together — a formula in `packages/domain/*.ts` **and** its SQL port in a
  migration; a zod schema **and** the DB CHECK; a validator **and** the generated
  types. Flag any mirror updated on one side only, and verify the two sides
  actually agree (not just that both were touched).
- **Parity obligations.** `AnalyticsEvent` ↔ PRD §9.1; `BE_SCHEMA.md` ↔ the
  actual table/RLS; `.env.example` ↔ a new env var; a spec-required path ↔ its
  ADR/spec.
- **Implied-but-absent**: new behavior with no test (see axis F); a new
  user-facing flow with no loading/empty/error state.
- **Why**: a half-applied change passes typecheck and still ships a latent bug.

### C. 과잉 변경 — Scope creep & diff hygiene

- Edits unrelated to the stated goal mixed in (surgical-change violation).
- Leftover `console.log`, debug code, commented-out blocks, stray TODOs.
- Formatting/whitespace churn that bloats the diff.
- **Why**: scope creep is what self-review catches best and a human reviewer worst.

### D. 정확성 — Correctness

- Logic bugs, missed edge cases, null/undefined handling, missing `await`.
- Errors swallowed silently (no user message, no log); unhandled failure paths.

### E. 기존 규칙 준수 — with-key guardrail compliance

The repo's hard rules; each violation's severity in parentheses.

- **Security & secrets (Blocker):** hardcoded secrets; server-only keys
  (`SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`, `VAPID_PRIVATE_KEY`) reachable from a
  client component or `NEXT_PUBLIC_`-prefixed; legacy Supabase key names
  (`*_ANON_KEY` / `*_SERVICE_ROLE_KEY` — repo uses `sb_publishable_*` /
  `sb_secret_*` only); `adminClient()` / service-role queries bypassing RLS
  without a Layer-1 visibility gate, or caching a service-role result in a
  user-facing cache; untrusted input used without zod validation at the boundary.
- **Architecture:** client→server writes not via a `_actions.ts` Server Action;
  `useEffect` + `fetch` writes or new SWR / React Query; `src/app/api/*` used for
  anything but an external callback; feature code outside the route's
  `_components/` / `_actions.ts`, or a new `src/features/`; unclear `'use server'`
  / `'use client'` boundary; non-serializable Server Action args/returns.
- **Types & zod SoT:** `any` (use `unknown` + narrowing); overused `as` / `!`;
  domain types hand-declared instead of `z.infer<>` from `packages/domain/src/validators/*` (`@withkey/domain`);
  direct edits to generated `apps/web/src/types/supabase.ts`.
- **Domain:** AI diary (`src/lib/ai/`) — `AbortController` + 4.5s timeout,
  `templateFallback()` when keyword coverage < 1, log metadata only, never
  prompt/response bodies; analytics — `track()` only emits `AnalyticsEvent` union
  events (1:1 PRD §9.1); keyword pool frozen (PO approval + ADR;
  `KEYWORD_POOL_VERSION` injected into `keywords_shown` / `action_logged`); cache
  reads (`src/lib/db/reads/`) declare `"use cache: private"` + `cacheTag` inline;
  reuse `src/lib/utils.ts` (`cn`), `@withkey/domain` (keywords · validators ·
  challenge helpers), `src/lib/push/*`, `src/components/ui/*` instead of
  re-implementing.

### F. 테스트 신뢰도 — Test reliability

Tests existing isn't enough; ask whether they'd actually catch a regression.

- **Coverage of the change:** is the new/changed behavior tested, including its
  edge and failure paths — not just the happy path?
- **Meaningful assertions:** tests pin real invariants, not tautologies
  (`expect(x).toBe(x)`), and don't assert so heavily on mocks that they test
  nothing real.
- **Behavior over implementation:** tests survive a refactor that preserves
  behavior.
- **Determinism:** no time / random / ordering / network flakiness baked in.
- **Run state:** were the tests actually run green? Don't assume.
- **Why**: an untrustworthy suite is worse than none — it manufactures false
  confidence.

### 마이그레이션 — Migration rules & risk (conditional)

**Only if the diff touches `supabase/migrations/**`**, read
[`references/migration.md`](references/migration.md). It covers both the repo's
migration _rules_ (append-only numbering, one-way, RLS ON, SECURITY DEFINER RPC,
immutable ledgers, ADR) and migration _risk_ (re-runnability, backfill of
existing rows, locking, production-apply gating). These are the costliest,
least-reversible changes in the repo — a merged migration is already in prod with
no down script — so don't skip it when migrations change.

## (Optional) Large or multi-domain diffs — domain-reviewer fan-out

The default path above is a **single-context inline review** — keep it for small
POC diffs; it is the baseline this skill is tuned against. When a branch's diff
is **large and spans multiple domains** (migration + frontend + backend), or the
user asks to go deep / parallel, you may instead **fan out** to the project's
read-only domain reviewers in `.claude/agents/`, then merge.

1. **Classify** the changed files by domain:
   - `supabase/migrations/**`, `src/lib/supabase/**` (RLS/RPC) → `migration-reviewer`
   - `apps/web/src/app/**`, `src/components/ui/**`, `src/lib/db/reads/**` → `frontend-reviewer`
   - `**/_actions.ts`, `apps/web/src/lib/{ai,push,analytics,supabase}/**`, `packages/domain/src/{validators,keywords}/**`, `middleware.ts` → `backend-reviewer`
2. **Spawn in parallel** — one Task per _touched_ domain (skip domains the diff
   doesn't touch), each scoped to its files. Each reviewer carries the same
   guardrails as the axes above, applied per domain in an isolated context.
3. **Merge & verify — do not trust subagent output verbatim.** Reconcile the
   reports into one: dedup overlaps, and when two reviewers **disagree on a fact,
   check the source** before reporting — a subagent can misread (e.g. claim a
   function is absent when it exists). A contradiction reconciled against source
   often yields a sharper finding than either report alone. This verification
   step is the orchestrator's job and the main reason fan-out is worth its cost.
4. **Emit the single Step-4 report** from the merged, verified findings.

**Graceful fallback (important):** the reviewers are only invocable by name
(`subagent_type: migration-reviewer` …) after Claude Code has loaded
`.claude/agents/` at startup. If a Task call reports the agent type is not found
— a fresh session before reload, or a teammate without these local agents —
**fall back to the inline review** (Steps 1–3). Fan-out is an optional
accelerator, never a requirement; the inline path always produces a valid review.

**Cost:** fan-out spends more tokens and adds latency. Default to inline for
small diffs; reach for fan-out only when depth/parallelism actually pays.

## Step 4 — Output

Produce the report **in Korean** (repo convention), keeping code identifiers,
file paths, and library/API names in their original form. Use this structure:

```
## 리뷰 요약
<1~2줄: 무엇을 바꾼 diff인지 + 목표 달성/누락 여부 + Blocker 유무>

## 이슈
### 🔴 Blocker  (머지 전 반드시 수정 — 보안/데이터 손실/가드레일 위반/목표 미달)
- `path/to/file.ts:42` — [축 A~F·migration] <무엇이 문제인지>. <왜 중요한지 1줄>. <고칠 방법>

### 🟠 Major  (머지 전 수정 권장 — 버그/완성도 결손/테스트 신뢰도)
- ...

### 🟡 Minor  (가능하면 — 유지보수/스타일/베스트프랙티스)
- ...

## 영향 범위
- Supabase 테이블/RLS/migration: <예/아니오 + 한 줄>
- env/시크릿: <예/아니오 + 한 줄>
- spec-required 경로 + ADR/spec 동반 여부: <해당 시>

## 검증 권고
- <아직 안 돌린 typecheck/lint/test/db reset 중 이 변경에 필요한 것>
```

Tag each issue with the axis it came from (A 목표 / B 누락 / C 과잉 / D 정확성 /
E 규칙 / F 테스트 / migration) so the user sees coverage at a glance. Map
severities to `docs/QUALITY_GATE.md` §리뷰 기준: Blocker = CRITICAL (block merge),
Major = HIGH, Minor = MEDIUM/LOW. If there are no Blockers or Majors, say so
plainly — a clean review is a valid, useful result.

Calibrate severity to **impact**, not to how many rules a line technically
breaks. **Blocker** is reserved for: secret/credential leaks, data loss, RLS
bypass, migration append-only / one-way violations, money-path holes, or the
change missing its stated goal. Type/style issues — `any`, a stray `console.log`,
an `<img>` instead of `next/image` — are **Minor** (bump to Major only when they
cause a real runtime bug), never Blocker. A wall of Blockers reads as noise and
buries the one that actually blocks the merge.

## Depth

Default depth is **medium**: report high-confidence findings; hold back
speculative ones. If the user asks to go deep ("꼼꼼히", "deep", "max", "샅샅이"),
widen coverage and include lower-confidence findings, clearly labeling them as
uncertain so the user can judge.

## What this skill does NOT do

Staying in scope is what makes a self-review fast and trusted:

- No large refactoring or architecture-redesign proposals — flag the concern,
  don't redesign.
- No style nitpicks that ESLint/Prettier already own.
- No "improving" unrelated code outside the diff.
- No exhaustive trivia lists. A handful of real findings beats fifty cosmetic ones.
- It does not apply fixes or commit. It reports; the user decides. (If they
  explicitly ask to fix afterward, that's a separate action.)
