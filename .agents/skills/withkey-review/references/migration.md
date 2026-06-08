# Migration review layer

Read this only when a review diff touches `supabase/migrations/**`. These are
the highest-stakes changes in with-key: migrations are append-only and one-way,
and a merged migration may already be applied in production.

SoT for details: `docs/ONBOARDING.md` §4.3, `docs/ARCHITECTURE.md`,
`docs/BE_SCHEMA.md` §10, and money/verification ADRs such as
`docs/adr/0032-settlement-verification-data-model.md`.

## File and numbering

Blocker if violated:

- New migrations use the next tail number: `000X_<snake_case>.sql`.
- Do not renumber, reorder, delete, or rewrite already-merged migrations.
- No down scripts; roll forward with a new migration.
- All schema changes go through migration files, not Supabase Studio DDL.

Treat edits to an already-merged migration as the same class of problem as
renumbering: local reset history diverges from production history.

## RLS and write-path security

Blocker if violated:

- Every new table must enable RLS and ship policies.
- Money/verification-state writes use the established service-role RPC path, not
  client INSERT/UPDATE/DELETE policies.
- Append-only ledgers and immutable snapshots must be guarded against ordinary
  UPDATE/DELETE.
- Reuse existing helpers such as `is_group_member()`, service-role-only write
  policies, and guard triggers instead of inventing bespoke auth logic.
- `action_logs` AI columns stay server-only.

## SECURITY DEFINER hardening

For `SECURITY DEFINER` functions, prefer an explicit search path such as
`SET search_path = ''` or an explicit schema. Supabase flags mutable search path
as a database-linter risk. Report this as Minor unless the function also creates
an actual privilege bypass.

## Migration risk

Major when applicable:

- Re-runnability: repeated or partial apply should not double-write or fail
  unnecessarily.
- Existing rows: new `NOT NULL`, CHECK, or constraint changes need backfill or a
  clear reason existing rows already satisfy them.
- Compatibility: dropped/renamed columns or function signature changes can break
  deployed readers and generated Supabase types.
- Locking: large-table `ALTER` and index creation may lock or scan.
- Production gates: honor any header note that intentionally holds a migration
  from production apply.

## Process and verification

- `supabase/migrations/**` is spec-required. The same PR should add an ADR or an
  acceptable spec; CI warning is soft, so the review should surface absence.
- Recommend `pnpm supabase db reset` plus role-level access checks
  (anon/authenticated) for migration/RLS/RPC changes.

In the main report, name the migration files, touched tables/policies/RPCs, and
whether ADR/spec and verification are present.
