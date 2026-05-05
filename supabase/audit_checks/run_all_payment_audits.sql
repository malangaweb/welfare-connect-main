-- Run all payment consistency audits
-- Execute this file in Supabase SQL editor (or psql) to run all checks.

\echo '--- 1) Duplicate mpesa_reference rows in transactions ---'
\i supabase/audit_checks/01_check_duplicate_mpesa_references.sql

\echo '--- 2) Suspense unresolved rows that already exist in transactions ---'
\i supabase/audit_checks/02_check_suspense_vs_transactions_conflicts.sql

\echo '--- 3) Stale pending STK transactions (>30min) ---'
\i supabase/audit_checks/03_check_stale_pending_stk.sql
