DO $test$
DECLARE
  admin_id uuid;
  agent_id uuid;
  employee_id uuid;
  target_id uuid;
  row public.tickets;
  first_resolved timestamptz;
  second_resolved timestamptz;
  activity_count integer;
BEGIN
  SELECT id INTO admin_id FROM public.profiles WHERE lower(email) = lower('admin@company.com') AND role = 'admin' LIMIT 1;
  SELECT id INTO agent_id FROM public.profiles WHERE lower(email) = lower('agent@company.com') AND role = 'agent' LIMIT 1;
  SELECT id INTO employee_id FROM public.profiles WHERE lower(email) = lower('employee@company.com') AND role = 'employee' LIMIT 1;
  SELECT id INTO target_id FROM public.tickets WHERE ticket_number = 'TKT-000004';
  IF admin_id IS NULL OR agent_id IS NULL OR employee_id IS NULL OR target_id IS NULL THEN
    RAISE EXCEPTION 'workflow fixture missing';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', employee_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', employee_id::text, true);
  BEGIN
    PERFORM public.assign_ticket(target_id, agent_id);
    RAISE EXCEPTION 'employee was able to assign';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Only an admin can assign this ticket%' THEN
      RAISE;
    END IF;
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
  PERFORM public.assign_ticket(target_id, agent_id);
  SELECT * INTO row FROM public.tickets WHERE id = target_id;
  IF row.assigned_to IS DISTINCT FROM agent_id OR row.assigned_by IS DISTINCT FROM admin_id THEN
    RAISE EXCEPTION 'assignment audit fields were not saved';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', employee_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', employee_id::text, true);
  BEGIN
    PERFORM public.resolve_ticket(target_id, 'Employee tried to close this ticket.');
    RAISE EXCEPTION 'employee was able to resolve';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Not authorized%' AND SQLERRM NOT LIKE '%assigned agent%' THEN
      RAISE;
    END IF;
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', agent_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', agent_id::text, true);
  PERFORM public.update_ticket_progress(target_id, 'In Progress');
  SELECT status INTO row.status FROM public.tickets WHERE id = target_id;
  IF row.status IS DISTINCT FROM 'In Progress' THEN
    RAISE EXCEPTION 'agent progress update failed';
  END IF;

  BEGIN
    PERFORM public.resolve_ticket(target_id, 'short');
    RAISE EXCEPTION 'short notes were accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Resolution notes are required%' THEN
      RAISE;
    END IF;
  END;

  PERFORM public.resolve_ticket(target_id, 'Replaced the faulty network cable and confirmed access.');
  SELECT * INTO row FROM public.tickets WHERE id = target_id;
  IF row.status IS DISTINCT FROM 'Closed' OR row.resolved_by IS DISTINCT FROM agent_id OR row.resolved_at IS NULL THEN
    RAISE EXCEPTION 'resolve did not close the ticket as the assigned agent';
  END IF;
  first_resolved := row.resolved_at;

  PERFORM public.resolve_ticket(target_id, 'A second click must not replace the resolver.');
  SELECT resolved_at, resolved_by, status, resolution_notes
  INTO second_resolved, row.resolved_by, row.status, row.resolution_notes
  FROM public.tickets WHERE id = target_id;
  IF second_resolved IS DISTINCT FROM first_resolved
     OR row.resolved_by IS DISTINCT FROM agent_id
     OR row.status IS DISTINCT FROM 'Closed'
     OR row.resolution_notes NOT LIKE 'Replaced the faulty network cable%' THEN
    RAISE EXCEPTION 'second resolve changed the closed ticket';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
  PERFORM public.reopen_ticket(target_id);
  SELECT * INTO row FROM public.tickets WHERE id = target_id;
  IF row.status IS DISTINCT FROM 'Open' OR row.resolved_by IS NOT NULL OR row.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'reopen did not clear the closure fields';
  END IF;
  IF row.assigned_to IS DISTINCT FROM agent_id OR row.assigned_by IS DISTINCT FROM admin_id THEN
    RAISE EXCEPTION 'reopen removed the assignment audit';
  END IF;

  PERFORM public.assign_ticket(target_id, NULL);
  SELECT assigned_to, assigned_by INTO row.assigned_to, row.assigned_by FROM public.tickets WHERE id = target_id;
  IF row.assigned_to IS NOT NULL OR row.assigned_by IS DISTINCT FROM admin_id THEN
    RAISE EXCEPTION 'reassign to unassigned did not keep the admin who changed it';
  END IF;

  SELECT count(*) INTO activity_count
  FROM public.ticket_activity AS activity
  WHERE activity.ticket_id = target_id
    AND activity.event_type IN ('assigned', 'status_changed');
  IF activity_count < 4 THEN
    RAISE EXCEPTION 'audit trail is missing assignment, progress, resolve, or reopen events';
  END IF;

  RAISE EXCEPTION 'WORKFLOW_OK';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'WORKFLOW_OK' THEN
    RAISE;
  END IF;
END
$test$;
