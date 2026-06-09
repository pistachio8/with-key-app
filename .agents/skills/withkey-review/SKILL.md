---
name: withkey-review
description: >-
  Self-review the current branch diff in the with-key repo before a PR or
  commit. Use when the user asks to review, sanity-check, or inspect their
  in-progress changes as a whole. Checks goal fit, missing cross-artifact
  updates, scope creep, correctness, with-key guardrails, Supabase/RLS risk,
  AI diary and analytics contracts, env/secrets, and test reliability. For
  large multi-domain diffs, use the withkey-migration-reviewer,
  withkey-backend-reviewer, and withkey-frontend-reviewer skills as scoped
  review passes.
metadata:
  short-description: Review with-key branch diffs
---

# withkey-review

Run a fast self-review over the current branch's changes against with-key's
project guardrails. This is the Codex-compatible version of the Claude Code
`withkey-review` skill: use `.agents/skills/*` as the source, not
`.claude/skills/*` or `.claude/agents/*`.

This is not an exhaustive redesign pass. Report real merge risks, missing
requirements, and guardrail violations with file/line evidence.

Authoritative sources when a detail is ambiguous:

- `AGENTS.md` §3 with-key guardrails
- `docs/QUALITY_GATE.md`
- `docs/ARCHITECTURE.md`
- `docs/BE_SCHEMA.md`
- relevant PRD/spec/ADR/eval task named by the user or diff

Do not bulk-read all docs every run. Open the source only when a finding depends
on a detail you are not sure about.

## Step 1 - Get the review surface

Default: review committed branch changes plus uncommitted changes.

```bash
BASE=$(git show-ref --verify --quiet refs/remotes/origin/develop && echo origin/develop || echo origin/main)
MB=$(git merge-base HEAD "$BASE")
git --no-pager diff --stat "$MB"...HEAD
git --no-pager diff "$MB"...HEAD
git --no-pager diff
git --no-pager diff --staged
```

Honor narrower user scope:

- "staged only" / "커밋 전" -> review only `git diff --staged`
- pasted diff or `.diff`/`.patch` file -> review that surface
- named files -> restrict review to those paths

If the diff is empty, say so and stop. Read full surrounding code for changed
regions, not just hunks.

## Step 2 - Establish goal and change surface

Before findings, pin down:

- Goal: user request, PRD AC, spec, ADR, or eval task the diff claims to satisfy.
- Surface: touched files/domains, spec-required paths, and verification state.
- Spec-required paths: `supabase/migrations/**`, `src/lib/supabase/**`,
  `middleware.ts`, `packages/domain/src/keywords/pool.ts`,
  `packages/domain/src/validators/**`, `apps/web/src/lib/analytics/track.ts`,
  `src/lib/ai/**`.

## Step 3 - Review axes

Apply only axes relevant to the diff. Every finding needs `path:line`, why it
matters, and a concrete fix.

### A. Goal fit

- Does the diff actually satisfy the stated goal or AC?
- Is any required branch of the workflow missing?
- Block when the change is clean but solves the wrong problem or only part of it.

### B. Completeness / missing changes

- Cross-artifact mirrors moved together: zod schema and DB CHECK, TS formula and
  SQL port, validator and generated/consumer types.
- Parity obligations: `AnalyticsEvent` and PRD §9.1, `BE_SCHEMA.md` and
  migration/RLS, `.env.example` and new env vars, spec-required path and
  ADR/spec.
- User-facing flows include loading, empty, and error states where applicable.

### C. Scope creep / diff hygiene

- Unrelated edits mixed into the goal.
- Leftover debug output, commented-out blocks, stray TODOs.
- Formatting churn that hides the actual change.

### D. Correctness

- Logic errors, edge cases, null/undefined handling, missing `await`.
- Silent swallowed errors or unhandled failure paths.

### E. with-key guardrails

- Security/secrets: no hardcoded secrets; server-only keys are not client
  reachable or `NEXT_PUBLIC_`; Supabase keys use `sb_publishable_*` /
  `sb_secret_*`, not legacy key names.
- Architecture: client-to-server writes go through route `_actions.ts` Server
  Actions; no `useEffect` + `fetch` writes; no new SWR/React Query; `src/app/api`
  remains external-callback only; no new `src/features/`.
- Types: no `any`; prefer `unknown` plus narrowing; zod schemas in
  `packages/domain/src/validators/*` (`@withkey/domain`) are the domain type
  source via `z.infer<>`; generated `apps/web/src/types/supabase.ts` is not
  hand-edited.
- Supabase/RLS/cache: RLS remains the authorization boundary; `adminClient()` and
  service-role reads do not bypass Layer-1 visibility gates; user-facing cached
  reads do not store cross-viewer service-role results.
- AI diary: OpenAI call uses `AbortController` with fixed 4.5s timeout;
  fallback when keyword coverage is below 1; logs metadata only, never prompt or
  response body.
- Analytics: events stay 1:1 with PRD §9.1; no ad-hoc event names.
- Keyword pool: `packages/domain/src/keywords/pool.ts` is frozen unless PO approval
  plus ADR/validation update is present.
- Next.js 16: when a finding depends on framework behavior, verify against
  `node_modules/next/dist/docs/` first.

### F. Test reliability

- Tests cover the changed behavior, including edge/failure paths.
- Assertions pin behavior, not tautologies or mock internals only.
- Tests are deterministic and were actually run.

### Migration axis

If the diff touches `supabase/migrations/**`, read
`references/migration.md`. Migration mistakes are costly because with-key uses
append-only, one-way migrations.

## Optional Codex domain split

For small diffs, do the review inline in this context.

For large multi-domain diffs, run scoped passes using these Codex skills:

- `withkey-migration-reviewer`: `supabase/migrations/**`,
  `src/lib/supabase/**`, DB/RLS/RPC/`BE_SCHEMA.md`
- `withkey-backend-reviewer`: `_actions.ts`,
  `apps/web/src/lib/{ai,push,analytics,supabase}/**`,
  `packages/domain/src/{validators,keywords}/**`,
  `middleware.ts`, `src/app/api/*`
- `withkey-frontend-reviewer`: `apps/web/src/app/**`,
  `src/components/ui/**`, `src/lib/db/reads/**`, client/server boundaries

If the active Codex environment provides sub-agent tools and the user explicitly
asked for sub-agents, delegation, or parallel agent work, you may delegate those
scoped passes to separate agents with self-contained prompts. Otherwise, read
the relevant skill files yourself and merge the results inline.

Always verify delegated findings against source before reporting. Deduplicate
overlaps and resolve contradictions by checking the files.

## Step 4 - Output

Report in Korean. Keep code identifiers, file paths, and library/API names in
their original form.

```markdown
## 리뷰 요약

<1-2줄: 어떤 diff인지, 목표 달성/누락 여부, Blocker 유무>

## 이슈

### 🔴 Blocker (머지 전 반드시 수정)

- `path/to/file.ts:42` — [A 목표/B 누락/C 과잉/D 정확성/E 규칙/F 테스트/migration] <문제>. <왜 중요한지>. <고칠 방법>

### 🟠 Major (머지 전 수정 권장)

- ...

### 🟡 Minor (가능하면)

- ...

## 영향 범위

- Supabase 테이블/RLS/migration: <예/아니오 + 구체 내용>
- env/시크릿: <예/아니오 + 구체 내용>
- spec-required 경로 + ADR/spec 동반 여부: <해당 시>

## 검증 권고

- <아직 안 돌린 typecheck/lint/test/db reset 등>
```

Severity calibration:

- Blocker: secret leak, data loss, RLS/cache leak, migration append-only/one-way
  violation, keyword-pool drift, AI diary privacy/timeout break, or stated-goal
  failure.
- Major: real bug, completeness gap, weak verification for risky behavior.
- Minor: maintainability/style/type issues without direct runtime or security
  impact.

If there are no Blockers or Majors, say so plainly. A clean review is a valid
result.
