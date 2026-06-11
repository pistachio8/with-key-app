# Migration review layer

Read this only when the diff touches `supabase/migrations/**`. These are the
highest-stakes changes in the repo: there is **no down script** (POC is one-way),
and a merged migration is **already applied in production**. A mistake here can't
be quietly reverted — it costs a forward fix-up migration and risks data
integrity. So weigh findings here heavily.

SoT for these rules: `docs/ONBOARDING.md §4.3`, `docs/ARCHITECTURE.md`,
`docs/BE_SCHEMA.md §10`, and for money/verification write paths,
`docs/adr/0032-settlement-verification-data-model.md`.

## File & numbering (Blocker if violated)

- **Append-only numbering.** New migrations get the next number at the end
  (`000X_<snake_case>.sql`). Never renumber, reorder, or delete an existing
  migration — merged numbers are live in prod, so reordering breaks integrity.
- **Editing the *contents* of an already-merged migration is the same violation
  — a Blocker, not a stylistic scope nit.** The merged file already ran in prod;
  changing its SQL (even something as innocent-looking as `create table` →
  `create table if not exists`) makes a fresh `supabase db reset` diverge from
  what production actually has, and can silently mask a schema drift. Roll the
  change forward in a *new* migration instead. (Treat any hunk that modifies an
  existing `000X_*.sql` other than the newest unmerged one as Blocker.)
- **No down script.** Don't add rollback SQL. Roll forward with a new migration
  instead.
- **Filename convention**: `000X_<snake_case>.sql`. Flag wrong casing,
  separators, or a duplicate/out-of-order number.
- Append-only means "don't rearrange numbers," **not** "split everything into
  tiny files." Day-1-style initial DDL belongs together; a coherent change can be
  one file.
- **No Studio DDL.** All schema changes go through migration files, never
  hand-applied in Supabase Studio (reproducibility).

## RLS & write-path security (Blocker)

- **RLS ON for every new table, no exceptions.** A `CREATE TABLE` with no
  accompanying RLS enable + policies is a Blocker — clients hit the DB with the
  publishable key, so RLS is the only defense. (`0002_rls.sql` is the baseline
  pattern; later migrations reinforce it.)
- **Money / verification-state writes go through one `SECURITY DEFINER` RPC
  path** (ADR-0032). Tables like `point_ledger`, `settlements`, and
  verification-status columns must not have client INSERT/UPDATE/DELETE policies —
  writes happen only via service-role RPC. A client-writable ledger is a Blocker:
  RLS alone can't keep money consistent.
- **Append-only ledger + immutable snapshots.** Ledger/settlement rows should be
  protected by a guard trigger that blocks non-`service_role` mutation (see
  migrations 0042/0043). Flag a money table that lacks the guard trigger.
- **Reuse existing patterns, don't invent new ones.** The established building
  blocks are the `is_group_member()` helper, service-role-only write policies, and
  guard triggers. A migration that rolls its own bespoke authorization mechanism
  instead of these is a Major finding — it raises review/learning cost and is
  where leaks hide.
- **`action_logs` AI columns** (`ai_summary`, `template_fallback`,
  `regenerate_count`, `prompt_version`) stay server-only — column-level RLS or a
  single Server Action path must block client INSERT/UPDATE of them.

## SECURITY DEFINER hardening (Minor)

- For any `SECURITY DEFINER` function, check it pins its search path —
  `SET search_path = ''` (or an explicit schema) in the function definition.
  A mutable search_path lets a caller shadow objects the function resolves
  unqualified (search_path injection); Supabase's database linter flags this as
  **"Function Search Path Mutable."**
- This is a Supabase/Postgres best-practice and a linter warning, **not** a
  documented with-key guardrail — report it as **Minor** and say so, so it's
  clearly distinguished from the project's own rules. If the user wants it
  promoted to a hard rule, that's an ADR, not a review verdict.

## Migration risk — beyond rule compliance (Major)

A migration can follow every rule above and still be risky to apply. These are
about what happens when the SQL actually runs against production data:

- **Re-runnability.** Prefer idempotent DDL (`create or replace function`,
  `create table if not exists`, `... on conflict do nothing`) so a partial/retried
  apply doesn't error or double-write. Flag a plain `insert`/`alter` that breaks
  if the migration runs twice.
- **Backfill of existing rows.** A new `NOT NULL` column with no default, or a new
  CHECK/constraint, can fail or silently exclude rows that already exist. Ask: how
  do pre-existing rows satisfy this? Is there a backfill step?
- **Breaking existing readers.** Dropping/renaming a column or changing a
  function signature breaks code still on the old shape. The generated
  `apps/web/src/types/supabase.ts` lags until `pnpm db:types` is re-run, so a
  rename can typecheck-pass locally and break at runtime.
- **Locking / large-table impact.** `ALTER TABLE` rewrites and new indexes lock
  or scan; on a big table that's downtime. Note it even if POC tables are small.
- **Production-apply gating.** Some migrations are intentionally held from prod
  apply until a gate clears (e.g. legal/G2 review for money features — see the
  `0044` header note). If the migration declares such a gate, the review should
  confirm it isn't applied prematurely, and surface the gate under 검증 권고.

## Process (Major)

- **ADR required.** `supabase/migrations/**` is a spec-required path: the same PR
  should add an ADR (`docs/adr/NNNN-*.md`). A spec (`docs/superpowers/specs/*`)
  is an acceptable substitute the reviewer can accept, but a migration with
  *neither* is a finding (CI emits only a soft warning, so the review must call it
  out so it isn't missed).
- **Verification.** A migration change should be validated by re-applying
  (`pnpm supabase db reset`) and exercising access per role (anon vs.
  authenticated), especially for RLS/RPC changes. Note this under 검증 권고 if it
  hasn't been done.

## Migration-layer output

Fold migration findings into the normal severity buckets in the main report, but
make the "영향 범위 → Supabase 테이블/RLS/migration" line concrete: name the
migration file(s), the tables/policies/RPCs touched, and whether an ADR
accompanies them.
