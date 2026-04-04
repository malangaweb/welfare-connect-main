-- =====================================================
-- MIGRATION: Fix Suspense Transaction Statuses
-- Date: 2026-03-21
-- Purpose: Allow new status values for manual recovery
-- =====================================================

-- Drop the old CHECK constraint
ALTER TABLE wrong_mpesa_transactions 
DROP CONSTRAINT IF EXISTS "wrong_mpesa_transactions_status_check";

-- Add new CHECK constraint with additional statuses
ALTER TABLE wrong_mpesa_transactions 
ADD CONSTRAINT "wrong_mpesa_transactions_status_check" 
CHECK (status IN ('pending', 'matched', 'reversed', 'ignored', 'PENDING_REVIEW', 'RESOLVED'));

-- Update comments
COMMENT ON TABLE wrong_mpesa_transactions IS 'Suspense account for unmatched M-Pesa payments. Statuses: pending, matched, reversed, ignored, PENDING_REVIEW (awaiting info), RESOLVED (resolved outside system)';
