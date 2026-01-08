-- Migration script to add password column to existing users table
-- Run this if you already have a users table without the password column

-- Check if password column exists, if not add it
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'password'
  ) THEN
    ALTER TABLE users ADD COLUMN password VARCHAR(255);
    
    -- Update existing users with a default password (users should change this)
    -- In production, you should set proper passwords for existing users
    UPDATE users SET password = 'changeme123' WHERE password IS NULL;
    
    -- Make password NOT NULL after setting defaults
    ALTER TABLE users ALTER COLUMN password SET NOT NULL;
    
    RAISE NOTICE 'Password column added to users table';
  ELSE
    RAISE NOTICE 'Password column already exists in users table';
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN users.password IS 'User password (should be hashed in production)';
