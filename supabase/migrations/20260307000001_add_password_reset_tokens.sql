-- Migration: Add password reset token support to users table
-- Date: 2026-03-07
-- Purpose: Implement secure password reset functionality

ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_password_change TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false;

-- Create indexes for token lookups and expiration checks
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);
CREATE INDEX IF NOT EXISTS idx_users_reset_token_expires ON users(reset_token_expires);

-- Add comment for documentation
COMMENT ON COLUMN users.reset_token IS 'Secure token for password reset (hashed)';
COMMENT ON COLUMN users.reset_token_expires IS 'Expiration time for reset token (typically 1 hour)';
COMMENT ON COLUMN users.force_password_change IS 'Flag to require password change on next login';
COMMENT ON COLUMN users.last_password_change IS 'Timestamp of last successful password change';
