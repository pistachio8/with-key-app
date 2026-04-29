#!/usr/bin/env bash
# Apply any new migrations to the linked (shared) with-key project.
# No-op if Local == Remote. Used by ci.yml integration job.
# Requires env: SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD.
set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?required}"
: "${SUPABASE_DB_PASSWORD:?required}"

# Re-link (idempotent) — CI runners don't have a persisted .supabase/ folder.
# The project ref is hardcoded because this plan intentionally uses a single
# shared Supabase project at POC scale (see D-014).
: "${SUPABASE_PROJECT_REF:=ohvcaytmzzwxkbxsmyny}"

# CI installs the native binary via supabase/setup-cli (PATH).
# Locally, the npm package ships a bin shim under pnpm exec.
if command -v supabase >/dev/null 2>&1; then
  SUPABASE=(supabase)
else
  SUPABASE=(pnpm exec supabase)
fi

"${SUPABASE[@]}" link --project-ref "$SUPABASE_PROJECT_REF"

# `db push` is idempotent: if all migrations are already applied it exits 0
# with "Remote database is up to date."
"${SUPABASE[@]}" db push --linked --include-all --password "$SUPABASE_DB_PASSWORD"

echo "[ci] migrations applied (or already up to date) on $SUPABASE_PROJECT_REF"
