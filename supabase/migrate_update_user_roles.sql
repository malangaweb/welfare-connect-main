-- Migration script to update user roles constraint
-- Run this if you already have a users table with the old role constraint
-- This updates the role CHECK constraint to include the new roles

-- Drop the old constraint if it exists
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Add the new constraint with updated roles
ALTER TABLE users ADD CONSTRAINT users_role_check 
  CHECK (role IN ('super_admin', 'chairperson', 'treasurer', 'secretary', 'member'));

-- Update any existing 'admin' roles to 'chairperson' (or choose another role)
-- Uncomment the line below if you want to migrate existing admin users
-- UPDATE users SET role = 'chairperson' WHERE role = 'admin';

-- Add comment for documentation
COMMENT ON COLUMN users.role IS 'User role: super_admin (full access), chairperson (leadership), treasurer (financial), secretary (administrative), member (limited access)';
