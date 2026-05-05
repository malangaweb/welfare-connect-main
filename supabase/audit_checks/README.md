# Payment Audit Checks

Run these SQL checks to catch payment inconsistencies and double entries.

## Files

- `01_check_duplicate_mpesa_references.sql`
  - Finds duplicated `mpesa_reference` values in `transactions`.
- `02_check_suspense_vs_transactions_conflicts.sql`
  - Finds unresolved suspense rows whose receipt already exists in `transactions`.
- `03_check_stale_pending_stk.sql`
  - Finds stale pending STK rows older than 30 minutes.

## How to run

In Supabase SQL editor, run each file individually (recommended), or copy/paste the SQL.

Note: `run_all_payment_audits.sql` uses `psql` meta-commands (`\\i`, `\\echo`) and is intended for CLI use with `psql`, not Supabase web SQL editor.

## Suggested cadence

- Daily: all 3 checks
- After incidents/deploys: all 3 checks + existing repair scripts in `supabase/`
