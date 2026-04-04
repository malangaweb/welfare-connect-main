-- =====================================================
-- MIGRATION: Create Wrong M-Pesa Transactions Table
-- Date: 2026-03-15
-- Purpose: Create suspense account table for unmatched M-Pesa payments
-- =====================================================

-- Create wrong_mpesa_transactions table if it doesn't exist
CREATE TABLE IF NOT EXISTS wrong_mpesa_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mpesa_receipt_number VARCHAR(100) UNIQUE NOT NULL,
    phone_number VARCHAR(50) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    sender_name VARCHAR(255),
    transaction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'reversed', 'ignored')),
    matched_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    matched_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_wrong_mpesa_phone ON wrong_mpesa_transactions(phone_number);
CREATE INDEX IF NOT EXISTS idx_wrong_mpesa_status ON wrong_mpesa_transactions(status);
CREATE INDEX IF NOT EXISTS idx_wrong_mpesa_matched ON wrong_mpesa_transactions(matched_member_id);
CREATE INDEX IF NOT EXISTS idx_wrong_mpesa_receipt ON wrong_mpesa_transactions(mpesa_receipt_number);

-- Add updated_at trigger
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_wrong_mpesa_updated_at') THEN
        CREATE TRIGGER update_wrong_mpesa_updated_at
            BEFORE UPDATE ON wrong_mpesa_transactions
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Add comment
COMMENT ON TABLE wrong_mpesa_transactions IS 'Suspense account for unmatched M-Pesa payments';
