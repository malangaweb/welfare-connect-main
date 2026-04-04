-- =====================================================
-- RECOVER & VIEW SUSPENSE TRANSACTIONS
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/hfojxbfcjozguobwtcgt/sql/new
-- =====================================================

-- STEP 1: Check if there's an old/backup table with data
SELECT 'Checking for backup tables...' as step;

SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE '%wrong%mpesa%' 
OR table_name LIKE '%suspense%';

-- STEP 2: Check if data exists in main table
SELECT 'Current wrong_mpesa_transactions count' as info, COUNT(*) as count
FROM wrong_mpesa_transactions;

-- STEP 3: Show all records (if any exist)
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
ORDER BY created_at DESC;

-- STEP 4: Check mpesa_transactions table (might have rejected payments logged there)
SELECT 'Checking mpesa_transactions for rejected payments...' as step;

SELECT COUNT(*) as total_mpesa_transactions
FROM mpesa_transactions;

-- STEP 5: Show recent mpesa transactions that might be suspense candidates
SELECT 
    trans_id,
    bill_ref_number,
    trans_amount,
    msisdn,
    first_name,
    trans_time
FROM mpesa_transactions
WHERE bill_ref_number NOT IN (SELECT member_number FROM members)
ORDER BY trans_time DESC
LIMIT 20;

-- STEP 6: If you want to manually re-insert failed transactions from logs,
-- here's a template. Replace the values with actual data from your PHP logs.
-- Example from your log: TransID: UCPMWAEC6K, BillRef: 4, Amount: 1.00, Sender: Preston

-- First, create a temp table with manual entries (uncomment and modify as needed)
-- INSERT INTO wrong_mpesa_transactions (
--     mpesa_receipt_number, phone_number, amount, sender_name, reference, 
--     reference_type, status, source, notes, transaction_date
-- ) VALUES 
--     ('UCPMWAEC6K', 'hash_fd553e87b47948a894fc9128f884d0284ae7d1ec6472523e9299f9d566db895f', 1.00, 'Preston', '4', 'member_only', 'pending', 'c2b', 'Re-inserted from log - member 4 not found', NOW());

-- Auto-recover from mpesa_transactions table
INSERT INTO wrong_mpesa_transactions (
    mpesa_receipt_number,
    phone_number,
    amount,
    sender_name,
    reference,
    reference_type,
    status,
    source,
    notes,
    transaction_date
)
SELECT 
    'RECOVER_' || trans_id, 
    COALESCE(NULLIF(msisdn, ''), 'unknown_' || SUBSTRING(trans_id FROM 1 FOR 8)),
    trans_amount,
    COALESCE(NULLIF(CONCAT(first_name, ' ', last_name), ''), 'Unknown'),
    bill_ref_number,
    CASE 
        WHEN bill_ref_number LIKE 'C%' THEN 'case_only'
        WHEN bill_ref_number LIKE 'M%' THEN 'member_only'
        WHEN bill_ref_number LIKE '%#%' THEN 'member_and_case'
        ELSE 'unknown'
    END,
    'pending',
    'recovered_from_mpesa_transactions',
    'Recovered from mpesa_transactions table',
    trans_time
FROM mpesa_transactions mp
WHERE NOT EXISTS (
    SELECT 1 FROM wrong_mpesa_transactions w 
    WHERE w.mpesa_receipt_number = mp.trans_id
)
AND NOT EXISTS (
    SELECT 1 FROM members m 
    WHERE m.member_number = REGEXP_REPLACE(UPPER(REPLACE(mp.bill_ref_number, 'M', '')), '[^0-9]', '', 'g')
)
AND mp.trans_id NOT LIKE 'RECOVER_%'
LIMIT 50; -- Limit to 50 records for safety

-- STEP 7: Show recovered records
SELECT 
    'Recovered records' as info,
    COUNT(*) as count
FROM wrong_mpesa_transactions
WHERE mpesa_receipt_number LIKE 'RECOVER_%';

-- STEP 8: Show ALL suspense transactions (old + recovered + new)
SELECT 
    id,
    mpesa_receipt_number,
    phone_number,
    amount,
    sender_name,
    reference,
    reference_type,
    status,
    source,
    notes,
    created_at
FROM wrong_mpesa_transactions
ORDER BY created_at DESC
LIMIT 100;

-- STEP 9: Summary by status
SELECT 
    status,
    COUNT(*) as count,
    SUM(amount) as total_amount,
    MIN(created_at) as oldest,
    MAX(created_at) as newest
FROM wrong_mpesa_transactions
GROUP BY status
ORDER BY status;

-- STEP 10: Test auto-match on recovered records
SELECT 'Running auto-match...' as step;
SELECT match_suspense_transactions() as matched_count;

-- STEP 11: Show results after auto-match
SELECT 
    status,
    COUNT(*) as count,
    SUM(amount) as total_amount
FROM wrong_mpesa_transactions
GROUP BY status
ORDER BY status;

-- STEP 12: Show what was matched
SELECT 
    w.mpesa_receipt_number,
    w.reference,
    w.amount,
    w.sender_name,
    m.member_number,
    m.name as member_name,
    w.matched_at
FROM wrong_mpesa_transactions w
LEFT JOIN members m ON w.matched_member_id = m.id
WHERE w.status = 'matched'
ORDER BY w.matched_at DESC
LIMIT 20;
