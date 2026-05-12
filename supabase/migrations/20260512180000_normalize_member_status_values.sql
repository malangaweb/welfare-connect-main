-- One-time cleanup: normalize legacy/typo member statuses and align is_active.
-- This is safe to rerun.

BEGIN;

-- 1) Normalize status text variants to canonical enum values.
UPDATE members
SET status = CASE
  WHEN status IS NULL THEN CASE WHEN COALESCE(is_active, false) THEN 'active' ELSE 'inactive' END
  WHEN lower(trim(status)) IN ('probation', 'probabation') THEN 'probation'
  WHEN lower(trim(status)) IN ('deceased', 'deaceased', 'dead') THEN 'deceased'
  WHEN lower(trim(status)) = 'inactive' THEN 'inactive'
  WHEN lower(trim(status)) = 'active' THEN 'active'
  ELSE CASE WHEN COALESCE(is_active, false) THEN 'active' ELSE 'inactive' END
END
WHERE status IS DISTINCT FROM CASE
  WHEN status IS NULL THEN CASE WHEN COALESCE(is_active, false) THEN 'active' ELSE 'inactive' END
  WHEN lower(trim(status)) IN ('probation', 'probabation') THEN 'probation'
  WHEN lower(trim(status)) IN ('deceased', 'deaceased', 'dead') THEN 'deceased'
  WHEN lower(trim(status)) = 'inactive' THEN 'inactive'
  WHEN lower(trim(status)) = 'active' THEN 'active'
  ELSE CASE WHEN COALESCE(is_active, false) THEN 'active' ELSE 'inactive' END
END;

-- 2) Align is_active with status semantics.
-- active/probation => true; inactive/deceased => false
UPDATE members
SET is_active = CASE
  WHEN status IN ('active', 'probation') THEN true
  ELSE false
END
WHERE is_active IS DISTINCT FROM CASE
  WHEN status IN ('active', 'probation') THEN true
  ELSE false
END;

COMMIT;

