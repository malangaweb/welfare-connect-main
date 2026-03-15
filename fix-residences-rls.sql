-- Remove Row Level Security from residences table
-- This script disables RLS completely to allow direct access

-- Disable RLS on residences table
ALTER TABLE residences DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies (if any exist)
DROP POLICY IF EXISTS "Allow all operations on residences" ON residences;
DROP POLICY IF EXISTS "Allow authenticated users to manage residences" ON residences;
DROP POLICY IF EXISTS "Allow authenticated users to insert residences" ON residences;
DROP POLICY IF EXISTS "Allow authenticated users to select residences" ON residences;
DROP POLICY IF EXISTS "Allow authenticated users to update residences" ON residences;
DROP POLICY IF EXISTS "Allow authenticated users to delete residences" ON residences;

-- Grant full permissions to authenticated users
GRANT ALL ON residences TO authenticated;
GRANT ALL ON residences TO service_role;
GRANT ALL ON residences TO anon;

-- Ensure the table is accessible without RLS
-- This allows direct inserts, updates, and deletes without security restrictions
