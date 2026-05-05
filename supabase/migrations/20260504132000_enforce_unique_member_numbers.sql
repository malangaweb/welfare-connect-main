-- Enforce unique member numbers (no duplicates)

-- Canonical member number normalization:
-- 1) trim spaces
-- 2) uppercase
-- 3) remove leading 'M' prefix if present
-- 4) keep digits only when digits exist
-- 5) remove leading zeros from numeric values
CREATE OR REPLACE FUNCTION canonical_member_number(p_member_number TEXT)
RETURNS TEXT AS $$
DECLARE
  v TEXT := UPPER(BTRIM(COALESCE(p_member_number, '')));
  v_digits TEXT;
BEGIN
  IF v = '' THEN
    RETURN '';
  END IF;

  IF LEFT(v, 1) = 'M' THEN
    v := BTRIM(SUBSTRING(v FROM 2));
  END IF;

  v_digits := REGEXP_REPLACE(v, '[^0-9]', '', 'g');
  IF v_digits <> '' THEN
    v_digits := REGEXP_REPLACE(v_digits, '^0+', '');
    RETURN CASE WHEN v_digits = '' THEN '0' ELSE v_digits END;
  END IF;

  RETURN v;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION canonical_member_number(TEXT) IS
'Canonical member number key used for duplicate prevention and uniqueness enforcement.';

-- Check for duplicates after canonicalization before applying changes.
DO $$
DECLARE
  v_dup_count INT;
  v_sample TEXT;
BEGIN
  SELECT COUNT(*)::INT
  INTO v_dup_count
  FROM (
    SELECT canonical_member_number(member_number) AS canonical_key
    FROM members
    GROUP BY canonical_member_number(member_number)
    HAVING COUNT(*) > 1
  ) d;

  IF v_dup_count > 0 THEN
    SELECT STRING_AGG(format('%s -> [%s]', canonical_key, originals), '; ')
    INTO v_sample
    FROM (
      SELECT
        canonical_member_number(member_number) AS canonical_key,
        STRING_AGG(member_number, ', ' ORDER BY member_number) AS originals
      FROM members
      GROUP BY canonical_member_number(member_number)
      HAVING COUNT(*) > 1
      ORDER BY canonical_key
      LIMIT 10
    ) s;

    RAISE EXCEPTION 'Cannot enforce unique member_number: % duplicate canonical keys found. Sample: %', v_dup_count, COALESCE(v_sample, 'n/a');
  END IF;
END;
$$;

-- Normalize stored values in-place now that collisions are ruled out.
UPDATE members
SET member_number = canonical_member_number(member_number)
WHERE member_number IS DISTINCT FROM canonical_member_number(member_number);

-- Prevent blanks after normalization.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_members_member_number_not_blank'
  ) THEN
    ALTER TABLE members
      ADD CONSTRAINT chk_members_member_number_not_blank
      CHECK (char_length(BTRIM(member_number)) > 0);
  END IF;
END;
$$;

-- Enforce uniqueness at database level.
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_member_number_unique
  ON members(member_number);

-- Helper RPC for app-side pre-checks.
CREATE OR REPLACE FUNCTION member_number_exists(
  p_member_number TEXT,
  p_exclude_member_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_key TEXT := canonical_member_number(p_member_number);
BEGIN
  IF v_key = '' THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM members m
    WHERE m.member_number = v_key
      AND (p_exclude_member_id IS NULL OR m.id <> p_exclude_member_id)
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION member_number_exists(TEXT, UUID) IS
'Returns true when a canonicalized member number is already in use.';
