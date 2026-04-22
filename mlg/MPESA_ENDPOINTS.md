# M-Pesa Endpoint Naming (Standardized)

## Active Endpoints

- Confirmation callback: `mlg/mpesa_confirmation.php`
- Validation callback: `mlg/mpesa_validation.php`

## Backward Compatibility

- `mlg/confirmation.php` and `mlg/validation.php` remain present.
- The new standardized files currently proxy to those existing handlers, so behavior remains unchanged.

## Logging

- Raw callback log: `mlg/mpesa_confirmation_raw.log`
- Existing debug/trace log: `mlg/confirmation_log.json`

This keeps current C2B processing stable while making endpoint intent explicit for future maintenance.
