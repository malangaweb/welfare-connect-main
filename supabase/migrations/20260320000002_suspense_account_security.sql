-- =====================================================
-- MIGRATION: Suspense Account Security & Improvements
-- Date: 2026-03-20
-- Purpose: Add RLS policies, audit logging, and constraints
-- =====================================================

-- 1. Enable Row Level Security
ALTER TABLE wrong_mpesa_transactions ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing policies (to avoid conflicts)
DROP POLICY IF EXISTS "Admins can view suspense transactions" ON wrong_mpesa_transactions;
DROP POLICY IF EXISTS "Admins can update suspense transactions" ON wrong_mpesa_transactions;
DROP POLICY IF EXISTS "Service role has full access" ON wrong_mpesa_transactions;

-- 3. Create RLS Policies

-- Allow service role full access
CREATE POLICY "Service role has full access"
  ON wrong_mpesa_transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admins (super_admin, treasurer, chairperson) can view
CREATE POLICY "Admins can view suspense transactions"
  ON wrong_mpesa_transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('super_admin', 'treasurer', 'chairperson')
    )
  );

-- Super admin can update (match, reverse, ignore)
CREATE POLICY "Super admins can update suspense transactions"
  ON wrong_mpesa_transactions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'super_admin'
    )
  );

-- Super admin can insert (for manual entries)
CREATE POLICY "Super admins can insert suspense transactions"
  ON wrong_mpesa_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'super_admin'
    )
  );

-- 4. Add audit tracking columns
ALTER TABLE wrong_mpesa_transactions 
ADD COLUMN IF NOT EXISTS matched_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS ignored_by UUID REFERENCES users(id);

-- 5. Add check constraints
-- Drop existing constraint if it exists (to recreate with correct definition)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'positive_amount' 
    AND conrelid = 'wrong_mpesa_transactions'::regclass
  ) THEN
    ALTER TABLE wrong_mpesa_transactions DROP CONSTRAINT positive_amount;
  END IF;
END $$;

ALTER TABLE wrong_mpesa_transactions 
ADD CONSTRAINT positive_amount CHECK (amount > 0);

-- 6. Create index for audit columns
CREATE INDEX IF NOT EXISTS idx_wrong_mpesa_matched_by ON wrong_mpesa_transactions(matched_by);
CREATE INDEX IF NOT EXISTS idx_wrong_mpesa_reversed_by ON wrong_mpesa_transactions(reversed_by);

-- 7. Add comments
COMMENT ON COLUMN wrong_mpesa_transactions.matched_by IS 'User who performed the match action';
COMMENT ON COLUMN wrong_mpesa_transactions.reversed_by IS 'User who performed the reverse action';
COMMENT ON COLUMN wrong_mpesa_transactions.ignored_by IS 'User who performed the ignore action';
COMMENT ON CONSTRAINT positive_amount ON wrong_mpesa_transactions IS 'Ensure amount is always positive';

-- 8. Create view for suspense aging report
CREATE OR REPLACE VIEW suspense_aging_report AS
SELECT 
  status,
  COUNT(*) as transaction_count,
  SUM(amount) as total_amount,
  ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - transaction_date)) / 86400), 1) as avg_days_in_suspense,
  MIN(transaction_date) as oldest_transaction,
  MAX(transaction_date) as newest_transaction
FROM wrong_mpesa_transactions
GROUP BY status
ORDER BY status;

COMMENT ON VIEW suspense_aging_report IS 'Report showing how long payments have been in suspense';

-- 9. Create function to get suspense statistics
CREATE OR REPLACE FUNCTION get_suspense_stats()
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'pending_count', (SELECT COUNT(*) FROM wrong_mpesa_transactions WHERE status = 'pending'),
    'pending_amount', (SELECT COALESCE(SUM(amount), 0) FROM wrong_mpesa_transactions WHERE status = 'pending'),
    'matched_count', (SELECT COUNT(*) FROM wrong_mpesa_transactions WHERE status = 'matched'),
    'matched_amount', (SELECT COALESCE(SUM(amount), 0) FROM wrong_mpesa_transactions WHERE status = 'matched'),
    'reversed_count', (SELECT COUNT(*) FROM wrong_mpesa_transactions WHERE status = 'reversed'),
    'reversed_amount', (SELECT COALESCE(SUM(amount), 0) FROM wrong_mpesa_transactions WHERE status = 'reversed'),
    'ignored_count', (SELECT COUNT(*) FROM wrong_mpesa_transactions WHERE status = 'ignored'),
    'oldest_pending', (SELECT MIN(transaction_date) FROM wrong_mpesa_transactions WHERE status = 'pending'),
    'avg_days_pending', (
      SELECT COALESCE(
        ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - transaction_date)) / 86400), 1),
        0
      ) FROM wrong_mpesa_transactions WHERE status = 'pending'
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_suspense_stats() IS 'Returns comprehensive statistics for suspense account';

-- 10. Grant execute permission on stats function
GRANT EXECUTE ON FUNCTION get_suspense_stats() TO authenticated;
