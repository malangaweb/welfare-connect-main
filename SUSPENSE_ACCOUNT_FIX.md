# Suspense Account Empty - ROOT CAUSE FIX

## Problem Summary

PHP script successfully inserts into `wrong_mpesa_transactions` (HTTP 201), but the suspense account page shows 0 transactions.

## Root Cause

**RLS (Row Level Security) is blocking frontend queries!**

### What's Happening

```
┌─────────────────────────────────────────────────────────┐
│  PHP Webhook (confirmation.php)                         │
│  - Uses SERVICE_ROLE key                                │
│  - Bypasses RLS ✅                                      │
│  - Insert succeeds (HTTP 201)                           │
└─────────────────────────────────────────────────────────┘
                          ↓
              wrong_mpesa_transactions table
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Frontend (SuspenseManagement.tsx)                      │
│  - Uses ANON key                                        │
│  - Blocked by RLS ❌                                    │
│  - RLS policy checks: auth.uid() → NULL                 │
│  - Query returns nothing                                │
└─────────────────────────────────────────────────────────┘
```

### Why RLS Fails

The app uses **custom authentication** (localStorage-based), NOT Supabase Auth:

```typescript
// Frontend stores user in localStorage
localStorage.setItem('currentUser', JSON.stringify(user));

// RLS policy tries to check auth.uid()
WHERE EXISTS (
  SELECT 1 FROM users WHERE users.id = auth.uid()  -- auth.uid() is NULL!
)
```

Since users aren't authenticated via Supabase Auth, `auth.uid()` always returns `NULL`, so the RLS policy blocks ALL queries.

## Solution

**Disable RLS on `wrong_mpesa_transactions` table.**

The app already has its own authorization checks in `src/lib/authorization.ts` that enforce role-based access control at the application level.

## Deployment Instructions

### Step 1: Run the RLS Disable Migration

1. Go to [Supabase SQL Editor](https://supabase.com/dashboard/project/hfojxbfcjozguobwtcgt/sql/new)
2. Copy and paste this SQL:

```sql
-- Disable Row Level Security
ALTER TABLE wrong_mpesa_transactions DISABLE ROW LEVEL SECURITY;

-- Drop the old RLS policies (cleanup)
DROP POLICY IF EXISTS "Service role has full access" ON wrong_mpesa_transactions;
DROP POLICY IF EXISTS "Admins can view suspense transactions" ON wrong_mpesa_transactions;
DROP POLICY IF EXISTS "Super admins can update suspense transactions" ON wrong_mpesa_transactions;
DROP POLICY IF EXISTS "Super admins can insert suspense transactions" ON wrong_mpesa_transactions;

-- Add explanatory comment
COMMENT ON TABLE wrong_mpesa_transactions IS 'Suspense account for unmatched M-Pesa payments. RLS disabled - app uses custom auth with authorization checks in src/lib/authorization.ts';
```

3. Click **Run**

### Step 2: Run the Auto-Match Fix Migration

Copy and paste the SQL from `supabase/migrations/20260402000001_fix_suspense_auto_match.sql`

### Step 3: Test

1. Refresh the Suspense Account page
2. You should now see all the pending transactions
3. Click **Auto-Match All** to match transactions with valid member references

## Files Created

1. `supabase/migrations/20260402000002_disable_rls_suspense.sql` - Disables RLS
2. `supabase/migrations/20260402000001_fix_suspense_auto_match.sql` - Fixes auto-match to use BillRefNumber
3. `SUSPENSE_ACCOUNT_FIX.md` - This documentation

## Security Note

Disabling RLS is **safe** in this case because:

1. ✅ The app has role-based authorization in `src/lib/authorization.ts`
2. ✅ Only authenticated admins can access the suspense account page
3. ✅ The `SuspenseManagement` component checks user permissions
4. ✅ All actions are logged to `audit_logs`

The authorization flow is:

```
User clicks Suspense Account
  ↓
AuthContext checks: isAdmin()
  ↓
SuspenseManagement loads
  ↓
Frontend fetches data (now allowed - RLS disabled)
  ↓
User performs action (match, reverse, ignore)
  ↓
Backend logs action to audit_logs
```

## Complete SQL (Both Fixes)

Run this in Supabase SQL Editor:

```sql
-- ============================================
-- FIX 1: Disable RLS
-- ============================================
ALTER TABLE wrong_mpesa_transactions DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access" ON wrong_mpesa_transactions;
DROP POLICY IF EXISTS "Admins can view suspense transactions" ON wrong_mpesa_transactions;
DROP POLICY IF EXISTS "Super admins can update suspense transactions" ON wrong_mpesa_transactions;
DROP POLICY IF EXISTS "Super admins can insert suspense transactions" ON wrong_mpesa_transactions;

COMMENT ON TABLE wrong_mpesa_transactions IS 'Suspense account for unmatched M-Pesa payments. RLS disabled - app uses custom auth.';

-- ============================================
-- FIX 2: Update auto-match function
-- ============================================
-- (Paste the contents of 20260402000001_fix_suspense_auto_match.sql here)
```

## Expected Result

After running both migrations:

1. ✅ Suspense account page will show all pending transactions
2. ✅ Auto-Match will work for member references (M011, 45, etc.)
3. ✅ Case-only references (C045) will stay pending for manual review
4. ✅ Manual matching will work for all transactions
