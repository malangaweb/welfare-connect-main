-- Restore dashboard summary RPC access for app clients.
GRANT EXECUTE ON FUNCTION public.get_enhanced_dashboard_summary() TO anon, authenticated, service_role;

