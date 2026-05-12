-- Numeric sort key for member_number to avoid lexicographic ordering (1,10,100,...,2)
-- and enable stable "unique identifier" ordering from the database.
ALTER TABLE public.members
ADD COLUMN IF NOT EXISTS member_number_numeric BIGINT
GENERATED ALWAYS AS (
  NULLIF(regexp_replace(COALESCE(member_number, ''), '\D', '', 'g'), '')::BIGINT
) STORED;

CREATE INDEX IF NOT EXISTS idx_members_member_number_numeric
ON public.members (member_number_numeric, member_number);
