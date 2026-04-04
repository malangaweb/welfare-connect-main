-- Run this in Supabase SQL Editor to check if data exists
-- https://supabase.com/dashboard/project/hfojxbfcjozguobwtcgt/sql/new

-- 1. Check if table has any data
SELECT COUNT(*) as total_records FROM wrong_mpesa_transactions;

-- 2. Check records by status
SELECT 
    status, 
    COUNT(*) as count, 
    SUM(amount) as total_amount
FROM wrong_mpesa_transactions
GROUP BY status;

-- 3. Show recent pending transactions
SELECT 
    id,
    mpesa_receipt_number,
    phone_number,
    amount,
    sender_name,
    reference,
    reference_type,
    status,
    created_at
FROM wrong_mpesa_transactions
WHERE status = 'pending'
ORDER BY created_at DESC
LIMIT 10;

-- 4. Check RLS status
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'wrong_mpesa_transactions';

-- 5. Check if any policies exist
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE tablename = 'wrong_mpesa_transactions';
