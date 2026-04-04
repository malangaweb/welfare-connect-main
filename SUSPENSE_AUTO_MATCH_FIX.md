# Suspense Account Auto-Match Fix

## Problem

The suspense account was showing 0 wrong transactions because:

1. **M-Pesa sends hashed phone numbers** - The MSISDN comes as a 64-character hash (e.g., `8825837fe959a3f36430908fb03083d3020f43ce6c8561437b409ef6548e7116`)
2. **Auto-match was by phone only** - The `match_suspense_transactions()` function tried to match hashed phones against real member phones
3. **No matches possible** - Hashed phones never match real member phone numbers

## Solution

Updated the `match_suspense_transactions()` function to match by **BillRefNumber (account reference)** instead of phone number.

### Reference Formats Handled

| Format | Example | Action |
|--------|---------|--------|
| Member only | `M011`, `45` | ✅ Auto-match to member |
| Case only | `C045` | ⚠️ Skip (needs manual review) |
| Member + Case | `45#C001`, `M011#C001` | ✅ Auto-match to member |
| Phone + Member | `079970#M299` | ✅ Auto-match to member |
| Unknown | `gdh`, `xyz` | ⚠️ Skip (needs manual review) |

## Deployment Instructions

### Step 1: Run the SQL Migration

1. Go to [Supabase SQL Editor](https://supabase.com/dashboard/project/hfojxbfcjozguobwtcgt/sql/new)
2. Copy the SQL from `supabase/migrations/20260402000001_fix_suspense_auto_match.sql`
3. Paste and click **Run**

### Step 2: Test Auto-Match

1. Go to Accounts → Suspense Account
2. Click **Auto-Match All** button
3. Transactions with valid member references (M011, 45, etc.) will be matched
4. Case-only references (C045) will remain pending for manual review

## How It Works

### Before (Phone-based matching - BROKEN)
```
Payment received: M011
Phone: hash_8825837fe959a3f36430908fb03083d3020f43ce6c8561437b409ef6548e7116
❌ Can't match - phone is hashed
```

### After (Reference-based matching - WORKS)
```
Payment received: M011
Reference: M011 → Extract member number: 011 → 11
✅ Match member M011 → Auto-match successful
```

## Expected Results

After deploying:

1. **Member-only payments** (M011, 45) → Auto-matched and credited to member wallet
2. **Member+Case payments** (45#C001) → Auto-matched to member (wallet funding for now)
3. **Case-only payments** (C045) → Stay in suspense for manual matching to correct member
4. **Invalid references** (gdh, xyz) → Stay in suspense for manual review

## Manual Matching Still Available

For case-only payments and invalid references, manual matching is still available:

1. Click **Match** button on any pending transaction
2. Search for member by name, number, or phone
3. Select member (and optionally case)
4. Confirm match

## Files Changed

- `supabase/migrations/20260402000001_fix_suspense_auto_match.sql` - New migration
- `src/components/accounts/SuspenseManagement.tsx` - No changes needed (UI already supports manual matching)
- `mlg/confirmation.php` - No changes needed (already extracts reference correctly)

## Testing

To test the fix:

1. Make a test payment with BillRefNumber = your member number (e.g., M011 or 45)
2. Wait for webhook to process (should appear in suspense if member not found initially)
3. Click Auto-Match All
4. Transaction should be matched and member wallet credited

## Notes

- Case-only payments (C045) intentionally skip auto-match because we don't know which member sent the money
- The PHP webhook already handles member+case correctly - this fix helps with historical suspense transactions
- Phone numbers are still stored for audit purposes, just not used for matching
