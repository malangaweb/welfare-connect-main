create or replace function public.get_late_payment_aggregate(p_from_date timestamptz)
returns table (
  late_payment_count bigint,
  late_payment_total numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::bigint as late_payment_count,
    coalesce(sum(abs(coalesce(t.amount, 0))), 0)::numeric as late_payment_total
  from public.transactions t
  where t.transaction_type = 'arrears'
    and t.created_at >= p_from_date
    and lower(coalesce(t.status, '')) in ('completed', 'success');
$$;

grant execute on function public.get_late_payment_aggregate(timestamptz) to authenticated, service_role;
