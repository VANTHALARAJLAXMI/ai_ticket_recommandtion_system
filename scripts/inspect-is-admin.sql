select jsonb_build_object(
  'is_admin', (
    select pg_get_functiondef(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin'
    limit 1
  ),
  'profile_policies', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', polname,
      'cmd', polcmd,
      'using', pg_get_expr(polqual, polrelid)
    )), '[]'::jsonb)
    from pg_policy
    where polrelid = 'public.profiles'::regclass
  ),
  'activity_check', (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.ticket_activity'::regclass
      and contype = 'c'
  )
) as inspection;
