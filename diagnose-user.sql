-- Diagnostic: Check user Malingi in both tables
-- Run this in the Supabase SQL Editor to understand the state

-- Check if Malingi is an admin user
SELECT 
  'users' AS table_name,
  id,
  username,
  name,
  role,
  is_active,
  member_id,
  LEFT(password, 20) AS password_preview,
  CASE 
    WHEN password LIKE '$2%' THEN 'bcrypt hash ✓'
    WHEN password IS NULL THEN 'NULL (no password!)'
    ELSE 'plain-text: ' || LEFT(password, 20)
  END AS password_type
FROM users
WHERE username ILIKE '%Malingi%' OR name ILIKE '%Malingi%';

-- Check if Malingi is a member (member login uses phone number, not password)
SELECT 
  'members' AS table_name,
  id,
  member_number,
  name,
  is_active,
  phone_number,
  email_address
FROM members
WHERE name ILIKE '%Malingi%';
