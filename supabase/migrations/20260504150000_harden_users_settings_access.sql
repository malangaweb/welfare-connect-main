-- Harden direct browser access to sensitive tables.
-- Trusted access path: Supabase Edge Functions using service-role key.

begin;

alter table if exists public.users enable row level security;
alter table if exists public.settings enable row level security;

-- Remove direct PostgREST table access from public clients.
revoke all privileges on table public.users from anon;
revoke all privileges on table public.users from authenticated;
revoke all privileges on table public.settings from anon;
revoke all privileges on table public.settings from authenticated;

-- Defensive deny policies in case grants are reintroduced later.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'users_deny_all_anon'
  ) then
    create policy users_deny_all_anon
      on public.users
      for all
      to anon
      using (false)
      with check (false);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'users_deny_all_authenticated'
  ) then
    create policy users_deny_all_authenticated
      on public.users
      for all
      to authenticated
      using (false)
      with check (false);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'settings'
      and policyname = 'settings_deny_all_anon'
  ) then
    create policy settings_deny_all_anon
      on public.settings
      for all
      to anon
      using (false)
      with check (false);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'settings'
      and policyname = 'settings_deny_all_authenticated'
  ) then
    create policy settings_deny_all_authenticated
      on public.settings
      for all
      to authenticated
      using (false)
      with check (false);
  end if;
end
$$;

commit;
