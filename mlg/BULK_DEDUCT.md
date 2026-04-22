# Bulk “Deduct to Case” (PHP + Supabase Edge proxy)

## Flow

1. **Web app** (treasurer / finance role): People → select members → **Deduct to Case** → choose an active case.
2. **Edge function** `api-case-bulk-deduct` validates the user’s `app_token` (privileged roles only), then forwards the request to PHP with a shared secret.
3. **PHP** `bulk_deduct_case.php` applies business rules and inserts `case_wallet_deduction` rows (idempotent per member per case).

## Server setup (cPanel)

1. Copy `bulk_deduct_config.example.php` → `bulk_deduct_config.php` and fill in:
   - `$supabaseUrl`
   - `$supabaseServiceRoleKey`
   - `$MLG_INTERNAL_BULK_KEY` (long random string)
2. Upload `bulk_deduct_case.php` and `bulk_deduct_config.php` beside your other `mlg/` endpoints.
3. Note the public URL, e.g. `https://your-domain/mlg/bulk_deduct_case.php`.

## Supabase secrets

Set for the project (Dashboard → Edge Functions → Secrets):

| Secret | Purpose |
|--------|---------|
| `MLG_BULK_DEDUCT_URL` | Full HTTPS URL to `bulk_deduct_case.php` |
| `MLG_INTERNAL_BULK_KEY` | Same value as `$MLG_INTERNAL_BULK_KEY` in PHP config |

Deploy the function:

```bash
supabase functions deploy api-case-bulk-deduct
```

## Database

Apply migration `20260422120000_case_wallet_deduction_and_defaulters.sql` so that:

- `case_wallet_deduction` debits wallets consistently.
- One deduction per member per case is enforced (unique partial index).
- Finalizing a case records unpaid members in `case_defaulters`.
