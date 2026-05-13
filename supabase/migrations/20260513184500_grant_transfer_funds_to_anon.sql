-- Custom app auth uses Supabase anon key for PostgREST RPC calls.
-- transfer_funds is invoked from frontend without Supabase Auth sessions.
-- Grant execute to anon to avoid 401 permission errors.

GRANT EXECUTE ON FUNCTION public.transfer_funds(uuid, uuid, numeric, text) TO anon;
GRANT EXECUTE ON FUNCTION public.transfer_funds(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_funds(uuid, uuid, numeric, text) TO service_role;
