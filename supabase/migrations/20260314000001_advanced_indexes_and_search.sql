-- =====================================================
-- MIGRATION: Advanced Indexing & Performance
-- Date: 2026-03-14
-- Purpose: Fill gaps in existing indexes, fix dashboard
--          summary function, and add full-text search.
-- Run this in the Supabase SQL editor.
-- =====================================================

-- -------------------------------------------------------
-- 0. SCHEMA ENFORCEMENT (Ensure basic columns exist)
-- -------------------------------------------------------
ALTER TABLE members ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE members ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';
ALTER TABLE cases ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE cases ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE cases ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- -------------------------------------------------------
-- 1. COMPOSITE INDEXES  (most impactful for real queries)
-- -------------------------------------------------------

-- Dashboard: "active cases ordered by start_date DESC"
CREATE INDEX IF NOT EXISTS idx_cases_active_start_date
    ON cases(is_active, start_date DESC)
    WHERE is_active = true;

-- Dashboard / Reports: "active members ordered by created_at DESC"
ALTER TABLE members ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_members_active_created
    ON members(is_active, created_at DESC);

-- Members page: filter defaulters (wallet_balance < 0)
CREATE INDEX IF NOT EXISTS idx_members_wallet_balance
    ON members(wallet_balance);

-- Members page: active members ordered by member_number
-- Covers the most common Members list query
CREATE INDEX IF NOT EXISTS idx_members_active_number
    ON members(is_active, member_number);

-- Transactions: per-member ordered list (used by MemberDetails)
CREATE INDEX IF NOT EXISTS idx_transactions_member_created
    ON transactions(member_id, created_at DESC);

-- Transactions: per-case ordered list
CREATE INDEX IF NOT EXISTS idx_transactions_case_created
    ON transactions(case_id, created_at DESC);

-- Transactions: filter by type AND status simultaneously
CREATE INDEX IF NOT EXISTS idx_transactions_type_status
    ON transactions(transaction_type, status);

-- -------------------------------------------------------
-- 2. PARTIAL INDEXES  (smaller, faster for common filters)
-- -------------------------------------------------------

-- Only index active members (avoids scanning inactive rows)
CREATE INDEX IF NOT EXISTS idx_members_active_only
    ON members(member_number, name, created_at DESC)
    WHERE is_active = true;

-- Only completed transactions (the vast majority)
CREATE INDEX IF NOT EXISTS idx_transactions_completed
    ON transactions(member_id, transaction_type, amount)
    WHERE status = 'completed';

-- -------------------------------------------------------
-- 3. FULL-TEXT SEARCH INDEX on members.name
--    Replaces slow ILIKE '%...%' with indexed GIN search
-- -------------------------------------------------------

-- Enable pg_trgm for trigram similarity search (supports ILIKE efficiently)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index on name — makes ILIKE queries fast
CREATE INDEX IF NOT EXISTS idx_members_name_trgm
    ON members USING GIN (name gin_trgm_ops);

-- Trigram index on member_number
CREATE INDEX IF NOT EXISTS idx_members_number_trgm
    ON members USING GIN (member_number gin_trgm_ops);

-- Trigram index on phone_number
CREATE INDEX IF NOT EXISTS idx_members_phone_trgm
    ON members USING GIN (phone_number gin_trgm_ops);

-- -------------------------------------------------------
-- 4. FIX get_dashboard_summary()
--    The old version had a broken GROUP BY that returned
--    zero rows when there were no correlated subquery hits.
--    This version uses a single efficient multi-table scan.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION get_dashboard_summary()
RETURNS TABLE (
  total_members        INT,
  active_members       INT,
  defaulters_count     INT,
  total_wallet_balance NUMERIC,
  active_cases         INT,
  total_contributions  NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Member counts (single scan)
    COUNT(*)::INT                                                           AS total_members,
    COUNT(*) FILTER (WHERE m.is_active = true)::INT                        AS active_members,
    COUNT(*) FILTER (WHERE m.wallet_balance < 0)::INT                      AS defaulters_count,
    COALESCE(SUM(m.wallet_balance), 0)::NUMERIC                            AS total_wallet_balance,

    -- Active cases count (scalar subquery — efficient with idx_cases_active_start_date)
    (SELECT COUNT(*)::INT FROM cases WHERE is_active = true)               AS active_cases,

    -- Total contributions (scalar subquery — uses idx_transactions_type_status)
    (SELECT COALESCE(SUM(ABS(t.amount)), 0)::NUMERIC
       FROM transactions t
      WHERE t.transaction_type = 'contribution'
        AND t.status = 'completed')                                         AS total_contributions

  FROM members m;
END;
$$ LANGUAGE plpgsql STABLE;

-- -------------------------------------------------------
-- 5. FIX get_defaulters() — use stored wallet_balance
--    The old version called calculate_wallet_balance(m.id)
--    per row which is an N+1 query inside the function.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION get_defaulters(limit_count INT DEFAULT 100)
RETURNS TABLE (
  member_id         UUID,
  member_number     TEXT,
  name              TEXT,
  phone_number      TEXT,
  wallet_balance    NUMERIC,
  transaction_count INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.member_number::TEXT,
    m.name::TEXT,
    m.phone_number::TEXT,
    m.wallet_balance::NUMERIC,
    -- Count of transactions for this member (uses idx_transactions_member_created)
    (SELECT COUNT(*)::INT FROM transactions t WHERE t.member_id = m.id) AS transaction_count
  FROM members m
  WHERE m.wallet_balance < 0
    AND m.is_active = true
  ORDER BY m.wallet_balance ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- -------------------------------------------------------
-- 6. MEMBER FULL-TEXT SEARCH FUNCTION
--    Fast trigram search called from the front-end
--    instead of a slow ILIKE on the client.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION search_members(
  search_term   TEXT,
  p_is_active   BOOLEAN DEFAULT NULL,
  p_limit       INT     DEFAULT 100,
  p_offset      INT     DEFAULT 0
)
RETURNS TABLE (
  id                  UUID,
  member_number       TEXT,
  name                TEXT,
  phone_number        TEXT,
  email_address       TEXT,
  residence           TEXT,
  is_active           BOOLEAN,
  wallet_balance      NUMERIC,
  registration_date   DATE,
  gender              TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.member_number::TEXT,
    m.name::TEXT,
    m.phone_number::TEXT,
    m.email_address::TEXT,
    m.residence::TEXT,
    m.is_active,
    m.wallet_balance::NUMERIC,
    m.registration_date,
    m.gender::TEXT
  FROM members m
  WHERE
    -- Trigram similarity search (uses GIN indexes above)
    (
      search_term = ''
      OR m.name         ILIKE '%' || search_term || '%'
      OR m.member_number ILIKE '%' || search_term || '%'
      OR m.phone_number  ILIKE '%' || search_term || '%'
      OR m.national_id_number ILIKE '%' || search_term || '%'
    )
    AND (p_is_active IS NULL OR m.is_active = p_is_active)
  ORDER BY m.member_number
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- -------------------------------------------------------
-- 7. UPDATE STATISTICS so query planner uses new indexes
-- -------------------------------------------------------
ANALYZE members;
ANALYZE transactions;
ANALYZE cases;
ANALYZE users;
ANALYZE residences;
ANALYZE accounts;
ANALYZE audit_logs;
