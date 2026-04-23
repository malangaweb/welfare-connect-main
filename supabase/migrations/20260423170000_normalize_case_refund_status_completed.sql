-- Ensure case refund rows are counted in wallet + paid checks.
-- Some older flows inserted contribution_refund without explicit status.
UPDATE public.transactions
SET status = 'completed'
WHERE transaction_type IN ('contribution_refund', 'case_wallet_refund')
  AND case_id IS NOT NULL
  AND (status IS NULL OR status = 'pending');

-- Keep refund channel explicit for reporting/compatibility.
UPDATE public.transactions
SET payment_method = COALESCE(payment_method, 'wallet')
WHERE transaction_type IN ('contribution_refund', 'case_wallet_refund')
  AND case_id IS NOT NULL
  AND (payment_method IS NULL OR payment_method = '');

-- Recompute wallet balances after status normalization.
UPDATE public.members m
SET wallet_balance = calculate_wallet_balance(m.id)
WHERE m.id IS NOT NULL;
