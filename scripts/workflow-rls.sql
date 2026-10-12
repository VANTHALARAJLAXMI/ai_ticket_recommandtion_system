DO $rls$
DECLARE
  employee_id uuid;
  target uuid;
  changed integer := -1;
  err text := '';
  after_status text;
BEGIN
  SELECT id INTO employee_id FROM public.profiles WHERE lower(email) = lower('employee@company.com') AND role = 'employee' LIMIT 1;
  SELECT id INTO target FROM public.tickets WHERE ticket_number = 'TKT-000004';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', employee_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', employee_id::text, true);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.tickets
    SET status = 'Closed', resolution_notes = 'An employee must not close this ticket.'
    WHERE id = target;
    GET DIAGNOSTICS changed = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    err := SQLERRM;
    changed := 0;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT status INTO after_status FROM public.tickets WHERE id = target;
  IF changed > 0 OR after_status IS DISTINCT FROM 'Open' THEN
    RAISE EXCEPTION 'employee update was allowed (rows %, status %)', changed, after_status;
  END IF;
  IF err <> '' AND err NOT LIKE '%row-level security%' AND err NOT LIKE '%Not authorized%' AND err NOT LIKE '%permission denied%' THEN
    RAISE EXCEPTION 'unexpected employee update error: %', err;
  END IF;
END
$rls$;
