-- Migration: Add database indexes for performance optimization
-- Date: 2026-03-07
-- Purpose: Improve query performance by adding strategic indexes
-- Phase: 2 (Performance Improvements)

-- Members table indexes
CREATE INDEX IF NOT EXISTS idx_members_member_number ON members(member_number);
CREATE INDEX IF NOT EXISTS idx_members_phone_number ON members(phone_number);
CREATE INDEX IF NOT EXISTS idx_members_is_active ON members(is_active);
CREATE INDEX IF NOT EXISTS idx_members_wallet_balance ON members(wallet_balance);

-- Transactions table indexes
CREATE INDEX IF NOT EXISTS idx_transactions_member_id ON transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_type ON transactions(transaction_type);

-- Cases table indexes
CREATE INDEX IF NOT EXISTS idx_cases_member_id ON cases(affected_member_id);
CREATE INDEX IF NOT EXISTS idx_cases_is_active ON cases(is_active);

-- Residences table indexes
-- (Indexes for residences removed due to missing columns in DB)

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_transactions_member_type ON transactions(member_id, transaction_type);

-- Foreign key indexes (should already exist but ensuring)
CREATE INDEX IF NOT EXISTS idx_transactions_member_fk ON transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_cases_member_fk ON cases(affected_member_id);