#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$ROOT_DIR/supabase/migrations/001_initial_schema.sql"
TESTS="$ROOT_DIR/supabase/tests/verify_schema.sql"

for required in "create extension if not exists vector" "create table if not exists public.contracts" "create table if not exists public.analysis_results" "create table if not exists public.document_chunks" "create table if not exists public.chat_history" "enable row level security" "contract-pdfs" "vector_cosine_ops" "set_updated_at"; do
  grep -Fqi "$required" "$MIGRATION" || { echo "FAIL: missing migration requirement: $required" >&2; exit 1; }
done

grep -Fq "foreign key (contract_id, user_id)" "$MIGRATION" || { echo "FAIL: composite chat ownership FK missing" >&2; exit 1; }
# Ignore SQL comments when checking for destructive statements.
if sed '/^[[:space:]]*--/d' "$MIGRATION" | grep -Eiq '^[[:space:]]*(drop[[:space:]]+(table|schema)|truncate)[[:space:]]'; then
  echo "FAIL: destructive SQL found" >&2
  exit 1
fi

echo "PASS: static migration checks"

if command -v psql >/dev/null 2>&1 && [[ -n "${DATABASE_URL:-}" ]]; then
  psql "$DATABASE_URL" --set ON_ERROR_STOP=1 --file "$TESTS"
else
  echo "SKIP: live SQL verification (set DATABASE_URL and install psql to run it)"
fi
