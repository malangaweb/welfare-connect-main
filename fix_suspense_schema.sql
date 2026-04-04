-- Run this in Supabase SQL Editor to check and fix the schema
-- https://supabase.com/dashboard/project/hfojxbfcjozguobwtcgt/sql/new

-- 1. Check current schema
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'wrong_mpesa_transactions'
AND column_name = 'phone_number';

-- 2. Make phone_number nullable (to accept hashed/unknown values)
ALTER TABLE wrong_mpesa_transactions 
ALTER COLUMN phone_number DROP NOT NULL;

-- 3. Also check other NOT NULL constraints that might be causing issues
SELECT 
    column_name, 
    is_nullable
FROM information_schema.columns
WHERE table_name = 'wrong_mpesa_transactions'
AND is_nullable = 'NO';

-- 4. Drop any problematic check constraints
DO $$
BEGIN
    -- Drop phone_not_blank constraint if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'wrong_mpesa_transactions_phone_not_blank'
    ) THEN
        ALTER TABLE wrong_mpesa_transactions 
        DROP CONSTRAINT wrong_mpesa_transactions_phone_not_blank;
    END IF;
    
    -- Drop receipt_not_blank constraint if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'wrong_mpesa_transactions_receipt_not_blank'
    ) THEN
        ALTER TABLE wrong_mpesa_transactions 
        DROP CONSTRAINT wrong_mpesa_transactions_receipt_not_blank;
    END IF;
END $$;

-- 5. Verify constraints are dropped
SELECT conname FROM pg_constraint 
WHERE conrelid = 'wrong_mpesa_transactions'::regclass;
