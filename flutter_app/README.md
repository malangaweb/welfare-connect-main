# Malanga Welfare Companion (Flutter)

Companion mobile app for member + admin workflows.

## Run

```bash
cd flutter_app
flutter pub get
flutter pub run build_runner build --delete-conflicting-outputs
flutter run \
  --dart-define=SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

## Implemented v1 modules

- Admin/member login (`auth-admin-login`, `auth-member-login`)
- Wallet summary + recent transactions (`api-member-summary`)
- Cases list/details (`api-cases-list`, `api-case-details`)
- STK push initiation (`api-stk-push`)
- Admin suspense queue + match (`api-suspense-list`, `api-suspense-match`)
- Offline cache/outbox (Drift)
- Push token registration (`api-register-device-token`)
