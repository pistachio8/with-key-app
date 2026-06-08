---
name: withkey-migration-reviewer
description: >-
  Review with-key Supabase migration, RLS, RPC, and database-auth changes.
  Use when a diff touches supabase/migrations/**, src/lib/supabase/**, or
  docs/BE_SCHEMA.md parity. Reports findings only; do not edit or apply
  migrations. Enforces append-only migration numbering, one-way policy, RLS on
  every table, SECURITY DEFINER safety, service-role write boundaries,
  immutable ledgers, storage privacy, ADR/spec parity, and production apply
  risk.
metadata:
  short-description: Review with-key DB migrations
---

# withkey-migration-reviewer

Review database changes in with-key. Report findings only.

## Scope

Review only:

- `supabase/migrations/**`
- `src/lib/supabase/**` when the change concerns RLS, RPC, clients, or roles
- `docs/BE_SCHEMA.md` parity with the schema/RLS change

Ignore UI rendering and pure server-library logic.

## Process

Use the current branch merge-base unless the user supplied a diff or named
files. Read the full migration file, not just hunks. Cross-check relevant
existing policies, especially `supabase/migrations/0002_rls.sql`.

## Rules

Blocker:

- Migration filenames are `000X_<snake_case>.sql`; numbers are append-only at
  the tail. Do not renumber, reorder, delete, or edit already-merged migrations.
- No down scripts; with-key rolls forward.
- Every new table enables RLS and ships policies.
- Money and verification-state writes do not expose client INSERT/UPDATE/DELETE
  paths; use the established service-role RPC pattern.
- Ledger/settlement/history tables are append-only or guard-trigger protected.
- Photos remain in private storage behind signed URLs; no public bucket.
- New Supabase key names use `sb_publishable_*` / `sb_secret_*`; legacy
  `*_ANON_KEY` and `*_SERVICE_ROLE_KEY` are banned.

Major:

- Migration is not re-runnable enough for partial/retried apply.
- Existing rows are not backfilled for new `NOT NULL`, CHECK, or constraints.
- Dropped/renamed columns or changed function signatures break existing readers.
- Large-table `ALTER` or index creation creates apply/locking risk.
- `supabase/migrations/**` changed without ADR or acceptable spec.
- `docs/BE_SCHEMA.md` drifts from table/RLS/RPC behavior.

Minor:

- `SECURITY DEFINER` function does not pin `search_path`, unless it creates a
  real privilege bypass. Supabase's database linter treats mutable search path
  as a warning.
- Naming or style issues without operational impact.

## Output

Report in Korean:

```markdown
## migration 리뷰

<1줄: DB 변경 요약 + Blocker 유무>

### 🔴 Blocker

- `supabase/migrations/00XX_*.sql:NN` — <문제>. <왜 중요>. <고칠 방법>

### 🟠 Major

- ...

### 🟡 Minor

- ...

### 영향 / 검증 권고

- BE_SCHEMA·ADR/spec 동반 여부
- `pnpm supabase db reset` 및 anon/authenticated 역할별 접근 실측 필요 여부
```

If there are no Blockers or Majors, say that plainly.
