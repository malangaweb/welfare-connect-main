#!/usr/bin/env bash
# Run the pgTAP suite for the financial engine.
#
# Usage:
#   ./supabase/tests/run.sh                 # uses $DATABASE_URL, else local supabase db
#
# Requires: psql, and the pgtap extension available in the target database.
# `supabase start` bundles pgTAP; for a bare Postgres install pgtap first.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Resolve a connection string:
#  1. explicit DATABASE_URL
#  2. local supabase default
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

echo "Running pgTAP suite against: ${DB_URL%%\?*}"

fail=0
for f in "$SCRIPT_DIR"/*.test.sql; do
  echo "── $(basename "$f") ──────────────────────────────"
  if ! psql "$DB_URL" --quiet --no-psqlrc -v ON_ERROR_STOP=1 -f "$f"; then
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "pgTAP: FAILURES detected" >&2
  exit 1
fi
echo "pgTAP: all suites passed"
