-- =====================================================
-- MIGRATION: Add dependants column to members table
-- Date: 2026-03-22
-- Purpose: Fix missing dependants column that causes
--          EditCase.tsx to fail when loading members
-- =====================================================

-- Add the dependants JSONB column to members table if it doesn't exist
ALTER TABLE members ADD COLUMN IF NOT EXISTS dependants JSONB DEFAULT '[]';

-- Verify the column exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'members' AND column_name = 'dependants'
    ) THEN
        RAISE EXCEPTION 'Failed to add dependants column';
    END IF;
END $$;

-- Comment for documentation
COMMENT ON COLUMN members.dependants IS 'Array of dependant objects stored as JSONB [{id, name, gender, relationship, date_of_birth, is_disabled, is_eligible}]';
