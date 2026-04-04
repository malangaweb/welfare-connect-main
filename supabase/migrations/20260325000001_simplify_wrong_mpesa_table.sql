-- =====================================================
-- MIGRATION: Simplify wrong_mpesa_transactions table
-- Date: 2026-03-25
-- Purpose: Remove complex constraints, use simple flexible schema
-- =====================================================

-- 1. Drop the quarantine table (not needed)
DROP TABLE IF EXISTS wrong_mpesa_transactions_quarantine CASCADE;

-- 2. Drop the unified view (will recreate if needed)
DROP VIEW IF EXISTS unified_wrong_mpesa_transactions CASCADE;

-- 3. Drop the existing table
DROP TABLE IF EXISTS wrong_mpesa_transactions CASCADE;

-- 4. Create simplified table with only essential columns
CREATE TABLE wrong_mpesa_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mpesa_receipt_number VARCHAR(100),
    phone_number VARCHAR(255),
    amount DECIMAL(15,2),
    sender_name VARCHAR(255),
    transaction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'pending',
    matched_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    matched_at TIMESTAMP WITH TIME ZONE,
    matched_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reversed_at TIMESTAMP WITH TIME ZONE,
    reversed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ignored_at TIMESTAMP WITH TIME ZONE,
    ignored_by UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    payment_method VARCHAR(50) DEFAULT 'mpesa',
    source VARCHAR(50) DEFAULT 'c2b',
    reference VARCHAR(255),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create indexes for performance
CREATE INDEX idx_wrong_mpesa_phone ON wrong_mpesa_transactions(phone_number);
CREATE INDEX idx_wrong_mpesa_status ON wrong_mpesa_transactions(status);
CREATE INDEX idx_wrong_mpesa_matched ON wrong_mpesa_transactions(matched_member_id);
CREATE INDEX idx_wrong_mpesa_receipt ON wrong_mpesa_transactions(mpesa_receipt_number);
CREATE INDEX idx_wrong_mpesa_source ON wrong_mpesa_transactions(source);
CREATE INDEX idx_wrong_mpesa_reference ON wrong_mpesa_transactions(reference);

-- 6. Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_wrong_mpesa_transaction_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_wrong_mpesa_transaction_updated_at
    BEFORE UPDATE ON wrong_mpesa_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_wrong_mpesa_transaction_updated_at();

-- 7. Add comment
COMMENT ON TABLE wrong_mpesa_transactions IS 'Suspense account for unmatched M-Pesa payments (simplified schema)';

-- 8. Enable RLS
ALTER TABLE wrong_mpesa_transactions ENABLE ROW LEVEL SECURITY;

-- 9. Add basic policies
DROP POLICY IF EXISTS "Admins can view wrong transactions" ON wrong_mpesa_transactions;
CREATE POLICY "Admins can view wrong transactions"
    ON wrong_mpesa_transactions
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Service role has full access" ON wrong_mpesa_transactions;
CREATE POLICY "Service role has full access"
    ON wrong_mpesa_transactions
    FOR ALL
    USING (true);
