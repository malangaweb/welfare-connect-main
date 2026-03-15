-- ============================================================
-- Fix: Bcrypt-hash all plain-text passwords in the users table
-- Only the `users` table has passwords (used for admin login).
-- Members log in with their phone number — no passwords there.
-- ============================================================

-- 1. Enable pgcrypto (required for crypt / gen_salt functions)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Preview: see which users still have plain-text passwords before we fix them
SELECT
  id,
  username,
  name,
  role,
  is_active,
  CASE
    WHEN password LIKE '$2%' THEN 'Already bcrypt-hashed ✓'
    WHEN password IS NULL    THEN 'NULL — no password set!'
    ELSE 'Plain-text: ' || LEFT(password, 30)
  END AS password_status
FROM users
ORDER BY created_at;

-- 3. Hash ALL plain-text passwords in one shot.
--    For each row where the password is NOT already a bcrypt hash,
--    we read the existing plain-text value and replace it with its bcrypt hash.
--    (cost factor 12 = same as the app's bcryptjs.hash(..., 12))
UPDATE users
SET password = crypt(password, gen_salt('bf', 12))
WHERE password NOT LIKE '$2%'
  AND password IS NOT NULL;

-- 4. Confirm: all passwords should now show "Already bcrypt-hashed"
SELECT
  id,
  username,
  name,
  role,
  is_active,
  CASE
    WHEN password LIKE '$2%' THEN 'bcrypt-hashed ✓'
    WHEN password IS NULL    THEN 'NULL — still no password!'
    ELSE 'STILL plain-text — check manually: ' || LEFT(password, 20)
  END AS password_status
FROM users
ORDER BY created_at;
