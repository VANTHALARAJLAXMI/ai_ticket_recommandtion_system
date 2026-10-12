select jsonb_build_object(
  'columns', (
    select coalesce(jsonb_agg(jsonb_build_object('name', column_name, 'type', data_type) order by ordinal_position), '[]'::jsonb)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'tickets'
  ),
  'policies', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', polname,
      'cmd', polcmd,
      'using', pg_get_expr(polqual, polrelid),
      'check', pg_get_expr(polwithcheck, polrelid)
    )), '[]'::jsonb)
    from pg_policy
    where polrelid = 'public.tickets'::regclass
  ),
  'functions', (
    select coalesce(jsonb_agg(n.nspname || '.' || p.proname order by n.nspname, p.proname), '[]'::jsonb)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.proname in (
        'assign_ticket', 'update_ticket_status', 'reopen_ticket',
        'is_admin', 'is_staff', 'can_access_ticket', 'apply_status', 'write_audit',
        'record_ticket_change'
      )
  ),
  'activity_types', (
    select coalesce(jsonb_agg(jsonb_build_object('event_type', event_type, 'count', n)), '[]'::jsonb)
    from (
      select event_type, count(*) as n from public.ticket_activity group by event_type
    ) s
  )
) as inspection;
