-- Apply the registration probation policy centrally so web, Flutter, and
-- membership application activations all receive the same age-based period.
CREATE OR REPLACE FUNCTION public.set_registration_probation_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_registration_date DATE := COALESCE(NEW.registration_date, CURRENT_DATE);
  v_probation_end DATE;
BEGIN
  IF NEW.status = 'probation' THEN
    v_probation_end := v_registration_date + CASE
      WHEN NEW.date_of_birth IS NOT NULL
        AND EXTRACT(YEAR FROM AGE(v_registration_date, NEW.date_of_birth)) >= 65
        THEN INTERVAL '6 months'
      ELSE INTERVAL '180 days'
    END;

    NEW.probation_end_date := v_probation_end;
    NEW.status := CASE
      WHEN v_probation_end <= CURRENT_DATE THEN 'active'
      ELSE 'probation'
    END;
    NEW.is_active := TRUE;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_registration_probation_period ON public.members;
CREATE TRIGGER set_registration_probation_period
  BEFORE INSERT ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_registration_probation_period();

-- Correct any saved registration SMS templates that still contain the old
-- portal host. Runtime SMS handling also canonicalizes old customized text.
UPDATE public.sms_templates
SET raw_template = regexp_replace(
      raw_template,
      '(https?://)?(www\.)?malangawelfare\.org',
      'https://malangawelfare.co.ke',
      'gi'
    ),
    updated_at = now()
WHERE raw_template ~* 'malangawelfare\.org';

UPDATE public.sms_templates
SET raw_template = rtrim(raw_template) || ' Member portal: {portalLink}',
    updated_at = now()
WHERE trigger_key = 'welcome_member'
  AND raw_template !~* 'malangawelfare\.(org|co\.ke)';

COMMENT ON VIEW public.members_on_probation IS
  'Members on probation: 180 days when registered under age 65, or six calendar months when registered at age 65 or older.';
