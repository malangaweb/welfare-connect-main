-- Migration: Add PIN-based authentication to members table
-- Date: 2026-03-07
-- Purpose: Replace phone-based authentication with secure PIN

ALTER TABLE members ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255);
ALTER TABLE members ADD COLUMN IF NOT EXISTS pin_attempts INT DEFAULT 0;
ALTER TABLE members ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMP WITH TIME ZONE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_members_pin_locked ON members(pin_locked_until);
CREATE INDEX IF NOT EXISTS idx_members_last_login ON members(last_login DESC);

-- Add comments for documentation
COMMENT ON COLUMN members.pin_hash IS 'Hashed 6-digit PIN for member login (bcrypt hashed)';
COMMENT ON COLUMN members.pin_attempts IS 'Failed PIN attempt counter (resets on successful login)';
COMMENT ON COLUMN members.pin_locked_until IS 'Account lockout time after 5 failed PIN attempts';
COMMENT ON COLUMN members.last_login IS 'Timestamp of last successful member login';
