# M-Pesa Endpoint Naming (Standardized)

## Active Endpoints

- Confirmation callback: `mlg/mpesa_confirmation.php`
- Validation callback: `mlg/mpesa_validation.php`
- STK push initiation (app-authenticated): `mlg/stk_push.php`
- STK push callback (Daraja): `mlg/stk_callback.php`
- Reversal initiation (app-authenticated): `mlg/mpesa_reversal.php`
- Reversal callback (Daraja): `mlg/mpesa_reversal_result.php`

## Backward Compatibility

- `mlg/confirmation.php` and `mlg/validation.php` remain present.
- The new standardized files currently proxy to those existing handlers, so behavior remains unchanged.

## Logging

- Raw callback log: `mlg/mpesa_confirmation_raw.log`
- Existing debug/trace log: `mlg/confirmation_log.json`
- STK callback raw log: `mlg/stk_callback_raw.log`
- STK callback error log: `mlg/stk_callback_errors.log`
- STK push error log: `mlg/stk_push_errors.log`
- Reversal callback raw log: `mlg/mpesa_reversal_result_raw.log`
- Reversal error log: `mlg/mpesa_reversal_errors.log`

## Required Environment For STK PHP Flow

- `APP_JWT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MPESA_ENV`
- `MPESA_CONSUMER_KEY`
- `MPESA_CONSUMER_SECRET`
- `MPESA_PASSKEY`
- `MPESA_SHORTCODE`
- `MPESA_STK_CALLBACK_URL` (recommended explicit public callback URL)
- `MPESA_INITIATOR_NAME`
- `MPESA_SECURITY_CREDENTIAL` (encrypted credential from Daraja certificate workflow)
- `MPESA_REVERSAL_RESULT_URL` (recommended explicit public callback URL)
- `MPESA_REVERSAL_TIMEOUT_URL` (recommended explicit public callback URL)

This keeps current C2B processing stable while making endpoint intent explicit for future maintenance.
