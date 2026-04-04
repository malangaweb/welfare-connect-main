# Quick Reference - Empty Records Fix

## Problem
Empty records still appearing in `wrong_mpesa_transactions` table

## Immediate Actions

### 1. Deploy Updated Functions
```bash
supabase functions deploy mpesa-c2b-webhook
supabase functions deploy mpesa-callback
```

### 2. Monitor Next Payment
Wait for an M-Pesa payment, then run diagnostics.

### 3. Run Diagnostic Query
```sql
-- Check recent records
SELECT 
    mpesa_receipt_number,
    phone_number,
    amount,
    created_at
FROM wrong_mpesa_transactions
WHERE created_at >= NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Check audit logs
SELECT 
    action,
    new_values->>'reason' as reason,
    new_values->>'amount' as amount,
    created_at
FROM audit_logs
WHERE created_at >= NOW() - INTERVAL '1 hour'
  AND action LIKE '%MPESA%'
ORDER BY created_at DESC;
```

## What Changed

### Added Detailed Logging
- Pre-insert validation logs
- Type checking for all values
- Final validation before database insert

### Added Audit Tracking
- Empty callback logging
- Rejection reason tracking
- Raw body capture for debugging

## Expected Behavior

**Valid Payment:**
- ✅ All fields populated
- ✅ Amount > 0
- ✅ Receipt number present

**Invalid Payment:**
- ❌ Rejected BEFORE insert
- ❌ Logged to audit_logs
- ❌ Error thrown in Edge Function

## Files to Check

1. **Edge Function Logs** - Supabase Dashboard → Edge Functions → Logs
2. **Audit Logs Table** - Check for rejection reasons
3. **Wrong M-Pesa Transactions** - Check for new empty records

## Contact Info for Debugging

If empty records still appear after deployment, provide:
1. Screenshot of new empty record (with created_at timestamp)
2. Edge Function logs from that time
3. Output of diagnostic SQL queries
