<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# with-key Agent Operating Rules

These rules are for every coding agent session in this repository. They are
intentionally self-contained because `.claude/**` is local-only and ignored by
git.

## Start-of-task Protocol

Before making code changes for a non-trivial request, report a short fact-based
brief in Korean:

1. **Fact 요약** — what is already known from the user request, active plan, repo
   files, and previous commits. Separate facts from assumptions.
2. **작업 범위** — exact paths likely to change.
3. **데이터/RLS 영향** — Supabase tables, RLS policies, migrations, or "없음".
4. **검증 계획** — commands/tests that will prove the work is done.

For tiny requests such as "show git status" or "commit this", skip the full
brief and execute directly.

## Execution Style

- Prefer the plan/task structure already present in `docs/superpowers/plans/**`.
- Execute in small batches. After each batch, summarize what changed and which
  verification command passed or failed.
- Keep changes surgical. Do not rewrite unrelated code, docs, or formatting.
- If `.claude/commands/*.md` or `.claude/skills/*.md` exists and the user asks
  for that command/skill by name, read it and follow the parts that fit the
  current agent/tooling.
- Claude-specific subagent rules in `.claude/rules/common/agents.md` are
  advisory for non-Claude agents. Codex must use only the available tools and
  must not spawn subagents unless the user explicitly asks for parallel agents.

## End-of-task Report

Finish implementation work with this Korean report shape:

1. **명세 요약** — plan task, PRD/BE_SCHEMA reference, or user goal.
2. **구현 내역** — behavior changed, not just filenames.
3. **변경 파일** — clickable file links when possible.
4. **영향 범위** — app paths, Supabase tables/RLS/migrations, external services.
5. **검증 결과** — exact commands run and pass/fail/skip.
6. **커밋** — hashes and messages if commits were created.
7. **미해결/후속 액션** — only real residual risk.

## Technical Scribe Compatibility

If `.claude/PROJECT_LOG.md` and `.claude/project-log-policy.md` exist, and the
work contains a high-value decision, user-facing feature, security/RLS change,
or deployment/database pipeline change, update `.claude/PROJECT_LOG.md` unless
the user says not to. End the response with `이번에 추가된 항목 3줄 요약` only
when that project log was actually updated.
