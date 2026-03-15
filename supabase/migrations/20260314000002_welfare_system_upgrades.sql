-- =====================================================
-- MIGRATION: Welfare System Upgrades (Phase 5)
-- Date: 2026-03-14
-- Purpose: Add M-Pesa suspense tracking, transaction reversal,
--          member probation, and better management features.
-- =====================================================

-- 1. WRONG M-PESA TRANSACTIONS (Suspense Account Log)
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

-- Ensure all columns exist (in case table was created without them)
ALTER TABLE wrong_mpesa_transactions ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE wrong_mpesa_transactions ADD COLUMN IF NOT EXISTS mpesa_receipt_number VARCHAR(100) UNIQUE NOT NULL;
ALTER TABLE wrong_mpesa_transactions ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50);
ALTER TABLE wrong_mpesa_transactions ADD COLUMN IF NOT EXISTS amount DECIMAL(15,2);
ALTER TABLE wrong_mpesa_transactions ADD COLUMN IF NOT EXISTS sender_name VARCHAR(255);
ALTER TABLE wrong_mpesa_transactions ADD COLUMN IF NOT EXISTS transaction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE wrong_mpesa_transactions ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'reversed', 'ignored'));
ALTER TABLE wrong_mpesa_transactions ADD COLUMN IF NOT EXISTS matched_member_id UUID REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE wrong_mpesa_transactions ADD COLUMN IF NOT EXISTS matched_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE wrong_mpesa_transactions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE wrong_mpesa_transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE wrong_mpesa_transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_wrong_mpesa_phone ON wrong_mpesa_transactions(phone_number);
CREATE INDEX IF NOT EXISTS idx_wrong_mpesa_status ON wrong_mpesa_transactions(status);

-- 2. ADD PROBATION FIELDS TO MEMBERS
ALTER TABLE members ADD COLUMN IF NOT EXISTS probation_end_date DATE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'probation' CHECK (status IN ('probation', 'active', 'inactive', 'deceased'));

-- Update existing members status based on registration date (90 days probation)
UPDATE members 
SET status = CASE 
    WHEN registration_date + INTERVAL '90 days' <= CURRENT_DATE THEN 'active'
    ELSE 'probation'
END
WHERE status = 'probation' OR status IS NULL;

-- 3. TRANSACTION REVERSAL LOGIC
CREATE OR REPLACE FUNCTION revert_transaction(p_transaction_id UUID, p_admin_id UUID, p_reason TEXT)
RETURNS JSONB AS $$
DECLARE
    v_tx RECORD;
    v_member RECORD;
    v_reversal_id UUID;
BEGIN
    -- 1. Get original transaction
    SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Transaction not found');
    END IF;
    
    IF v_tx.status = 'reversed' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Transaction already reversed');
    END IF;
    
    -- 2. Create reversal transaction
    INSERT INTO transactions (
        member_id,
        amount,
        transaction_type,
        description,
        status,
        metadata,
        reference,
        created_at
    ) VALUES (
        v_tx.member_id,
        -v_tx.amount, -- Opposite amount
        v_tx.transaction_type,
        'REVERSAL: ' || COALESCE(v_tx.description, '') || ' (Reason: ' || p_reason || ')',
        'completed',
        jsonb_build_object('reversed_transaction_id', p_transaction_id, 'reversal_reason', p_reason, 'admin_id', p_admin_id),
        'REV-' || v_tx.id,
        NOW()
    ) RETURNING id INTO v_reversal_id;
    
    -- 3. Update original transaction status
    UPDATE transactions SET status = 'reversed' WHERE id = p_transaction_id;
    
    -- 4. Update member balance
    UPDATE members 
    SET wallet_balance = wallet_balance - v_tx.amount
    WHERE id = v_tx.member_id;
    
    -- 5. Log audit trail
    INSERT INTO audit_logs (user_id, action, table_name, record_id, metadata)
    VALUES (p_admin_id, 'UPDATE', 'transactions', p_transaction_id, jsonb_build_object('action', 'reversal', 'reversal_id', v_reversal_id));
    
    RETURN jsonb_build_object('success', true, 'message', 'Transaction reversed successfully', 'reversal_id', v_reversal_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. AUTO-MATCH SUSPENSE TRANSACTIONS
CREATE OR REPLACE FUNCTION match_suspense_transactions()
RETURNS INT AS $$
DECLARE
    v_match_count INT := 0;
    v_row RECORD;
    v_member_id UUID;
BEGIN
    FOR v_row IN SELECT * FROM wrong_mpesa_transactions WHERE status = 'pending' LOOP
        -- Try to match by phone number (standardized)
        SELECT id INTO v_member_id 
        FROM members 
        WHERE phone_number = v_row.phone_number 
           OR phone_number LIKE '%' || SUBSTRING(v_row.phone_number FROM 2) -- Handles +254 vs 07...
        LIMIT 1;
        
        IF v_member_id IS NOT NULL THEN
            -- Update suspense record
            UPDATE wrong_mpesa_transactions 
            SET status = 'matched', matched_member_id = v_member_id, matched_at = NOW()
            WHERE id = v_row.id;
            
            -- Create wallet funding transaction
            INSERT INTO transactions (
                member_id,
                amount,
                transaction_type,
                mpesa_reference,
                description,
                status,
                created_at
            ) VALUES (
                v_member_id,
                v_row.amount,
                'wallet_funding',
                v_row.mpesa_receipt_number,
                'M-Pesa Payment matched from suspense (' || v_row.phone_number || ')',
                'completed',
                v_row.transaction_date
            );
            
            -- Update member balance
            UPDATE members SET wallet_balance = wallet_balance + v_row.amount WHERE id = v_member_id;
            
            v_match_count := v_match_count + 1;
        END IF;
    END LOOP;
    
    RETURN v_match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. REVERT MEMBER ACTION (Super Admin only - logical delete etc)
CREATE OR REPLACE FUNCTION safe_delete_member(p_member_id UUID, p_admin_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_balance DECIMAL(15,2);
BEGIN
    SELECT wallet_balance INTO v_balance FROM members WHERE id = p_member_id;
    
    IF v_balance <> 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Cannot delete member with non-zero balance. Please settle or transfer funds first.');
    END IF;
    
    -- Check for associated records
    IF EXISTS (SELECT 1 FROM cases WHERE affected_member_id = p_member_id) THEN
        -- Instead of deleting, mark as deceased or inactive
        UPDATE members SET is_active = false, status = 'inactive' WHERE id = p_member_id;
        RETURN jsonb_build_object('success', true, 'message', 'Member has associated cases. Marked as inactive instead of deleting.');
    END IF;
    
    DELETE FROM members WHERE id = p_member_id;
    
    RETURN jsonb_build_object('success', true, 'message', 'Member deleted successfully');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. INSERT MEMBER RPC (Secure backend insertion)
CREATE OR REPLACE FUNCTION insert_member(
    p_member_number TEXT,
    p_name TEXT,
    p_gender TEXT,
    p_date_of_birth DATE,
    p_national_id_number TEXT,
    p_phone_number TEXT,
    p_email_address TEXT,
    p_residence TEXT,
    p_next_of_kin JSONB,
    p_wallet_balance NUMERIC,
    p_is_active BOOLEAN,
    p_registration_date DATE,
    p_pin TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_member_id UUID;
    v_pin_hash TEXT;
BEGIN
    -- Hash PIN if provided
    IF p_pin IS NOT NULL AND p_pin <> '' THEN
        v_pin_hash := crypt(p_pin, gen_salt('bf', 12));
    END IF;

    INSERT INTO members (
        member_number,
        name,
        gender,
        date_of_birth,
        national_id_number,
        phone_number,
        email_address,
        residence,
        next_of_kin,
        wallet_balance,
        is_active,
        registration_date,
        pin_hash,
        status,
        probation_end_date
    ) VALUES (
        p_member_number,
        p_name,
        p_gender,
        p_date_of_birth,
        p_national_id_number,
        p_phone_number,
        p_email_address,
        p_residence,
        p_next_of_kin,
        p_wallet_balance,
        p_is_active,
        p_registration_date,
        v_pin_hash,
        CASE 
            WHEN p_registration_date + INTERVAL '90 days' <= CURRENT_DATE THEN 'active'
            ELSE 'probation'
        END,
        p_registration_date + INTERVAL '90 days'
    ) RETURNING id INTO v_member_id;

    RETURN jsonb_build_object('success', true, 'id', v_member_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. UPDATE MEMBER PIN (Secure PIN change)
CREATE OR REPLACE FUNCTION update_member_pin(
    p_member_id UUID,
    p_old_pin TEXT,
    p_new_pin TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_stored_hash TEXT;
BEGIN
    -- Get current PIN hash
    SELECT pin_hash INTO v_stored_hash FROM members WHERE id = p_member_id;
    
    -- If no PIN set (legacy), allow setting new one without old one check if admin (but here for member self-service)
    -- If old PIN provided, verify it first
    IF v_stored_hash IS NOT NULL AND v_stored_hash <> '' THEN
        IF NOT (v_stored_hash = crypt(p_old_pin, v_stored_hash)) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Current PIN is incorrect');
        END IF;
    END IF;

    -- Update to new PIN
    UPDATE members 
    SET pin_hash = crypt(p_new_pin, gen_salt('bf', 12)),
        pin_attempts = 0,
        pin_locked_until = NULL
    WHERE id = p_member_id;

    RETURN jsonb_build_object('success', true, 'message', 'PIN updated successfully');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
