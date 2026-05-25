-- Purge legacy cases with numeric case number <= 46.
-- Example matches: "46", "C046", "case-45".
-- Deletes dependent transactions first, then deletes cases.

WITH target_cases AS (
  SELECT id
  FROM public.cases
  WHERE NULLIF(regexp_replace(COALESCE(case_number, ''), '\D', '', 'g'), '') IS NOT NULL
    AND (regexp_replace(COALESCE(case_number, ''), '\D', '', 'g'))::int <= 46
)
DELETE FROM public.transactions t
USING target_cases tc
WHERE t.case_id = tc.id;

WITH target_cases AS (
  SELECT id
  FROM public.cases
  WHERE NULLIF(regexp_replace(COALESCE(case_number, ''), '\D', '', 'g'), '') IS NOT NULL
    AND (regexp_replace(COALESCE(case_number, ''), '\D', '', 'g'))::int <= 46
)
DELETE FROM public.cases c
USING target_cases tc
WHERE c.id = tc.id;
