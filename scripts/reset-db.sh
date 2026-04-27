#!/usr/bin/env bash
set -euo pipefail
# 로컬 Supabase DB를 migrations + seed로 초기화한다.
# ONBOARDING §4 참조.
pnpm supabase db reset
