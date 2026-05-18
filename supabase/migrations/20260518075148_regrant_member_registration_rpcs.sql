-- Restore member registration RPC access for custom app auth frontend flows.
-- These functions are invoked directly by the admin UI during new member onboarding.
GRANT EXECUTE ON FUNCTION public.insert_member(
  text, text, text, date, text, text, text, text, jsonb, numeric, boolean, date, jsonb, text
) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.member_number_exists(text, uuid)
TO anon, authenticated, service_role;
