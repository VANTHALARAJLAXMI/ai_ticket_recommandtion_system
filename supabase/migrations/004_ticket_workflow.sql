-- Additive workflow rules for the existing ticket table.
-- Does not delete tickets, rewrite roles, or invent history for older rows.

ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS assigned_by uuid;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS resolved_by uuid;

DO $fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_assigned_by_fkey') THEN
    ALTER TABLE public.tickets
      ADD CONSTRAINT tickets_assigned_by_fkey
      FOREIGN KEY (assigned_by) REFERENCES public.profiles (id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_resolved_by_fkey') THEN
    ALTER TABLE public.tickets
      ADD CONSTRAINT tickets_resolved_by_fkey
      FOREIGN KEY (resolved_by) REFERENCES public.profiles (id) ON DELETE SET NULL;
  END IF;
END
$fk$;

CREATE OR REPLACE FUNCTION private.guard_ticket_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role text;
  notes text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO actor_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.ticket_number IS DISTINCT FROM OLD.ticket_number
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  NEW.updated_at := now();

  IF actor_role IS DISTINCT FROM 'admin' AND actor_role IS DISTINCT FROM 'agent' THEN
    IF actor_role = 'employee'
       AND OLD.user_id = auth.uid()
       AND OLD.status = 'Resolved'
       AND NEW.status = 'Open'
       AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to
       AND NEW.resolution_notes IS NOT DISTINCT FROM OLD.resolution_notes THEN
      NEW.assigned_by := OLD.assigned_by;
      NEW.resolved_by := NULL;
      NEW.resolved_at := NULL;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    IF actor_role <> 'admin' THEN
      RAISE EXCEPTION 'Only an admin can assign this ticket';
    END IF;
    IF NEW.assigned_to IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = NEW.assigned_to
        AND role = 'agent'
        AND coalesce(is_active, true)
    ) THEN
      RAISE EXCEPTION 'Choose a support agent';
    END IF;
    NEW.assigned_by := auth.uid();
  ELSE
    NEW.assigned_by := OLD.assigned_by;
  END IF;

  IF OLD.status IS DISTINCT FROM 'Closed' AND NEW.status IN ('Resolved', 'Closed') THEN
    IF actor_role <> 'admin' AND OLD.assigned_to IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Only the assigned agent or an admin can resolve this ticket';
    END IF;
    notes := trim(coalesce(NEW.resolution_notes, ''));
    IF char_length(notes) < 10 OR char_length(notes) > 4000 THEN
      RAISE EXCEPTION 'Resolution notes are required';
    END IF;
    NEW.status := 'Closed';
    NEW.resolution_notes := notes;
    NEW.resolved_by := auth.uid();
    NEW.resolved_at := now();
    RETURN NEW;
  END IF;

  IF OLD.status = 'Closed' AND NEW.status = 'Closed' THEN
    NEW.status := 'Closed';
    NEW.resolution_notes := OLD.resolution_notes;
    NEW.resolved_by := OLD.resolved_by;
    NEW.resolved_at := OLD.resolved_at;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('Closed', 'Resolved') AND NEW.status = 'Open' THEN
    IF actor_role <> 'admin' AND OLD.assigned_to IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
    NEW.status := 'Open';
    NEW.resolved_by := NULL;
    NEW.resolved_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('Open', 'In Progress', 'Waiting for User') THEN
    RAISE EXCEPTION 'That status change is not allowed';
  END IF;
  IF actor_role = 'agent' AND OLD.assigned_to IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF NEW.resolution_notes IS DISTINCT FROM OLD.resolution_notes
     OR NEW.resolved_by IS DISTINCT FROM OLD.resolved_by
     OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  NEW.resolved_by := OLD.resolved_by;
  NEW.resolved_at := OLD.resolved_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_guard_update ON public.tickets;
CREATE TRIGGER tickets_guard_update
BEFORE UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION private.guard_ticket_update();

REVOKE ALL ON FUNCTION private.guard_ticket_update() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS tickets_update_role_based ON public.tickets;
DROP POLICY IF EXISTS tickets_update_staff ON public.tickets;
CREATE POLICY tickets_update_staff ON public.tickets
FOR UPDATE TO authenticated
USING (
  public.is_admin()
  OR (
    assigned_to = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'agent' AND coalesce(is_active, true)
    )
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    assigned_to = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'agent' AND coalesce(is_active, true)
    )
  )
);

CREATE OR REPLACE FUNCTION public.assign_ticket(p_ticket_id uuid, p_agent_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current public.tickets;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin can assign this ticket';
  END IF;
  SELECT * INTO current FROM public.tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;
  IF p_agent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_agent_id AND role = 'agent' AND coalesce(is_active, true)
  ) THEN
    RAISE EXCEPTION 'Choose a support agent';
  END IF;
  IF current.assigned_to IS NOT DISTINCT FROM p_agent_id THEN
    RETURN jsonb_build_object('id', current.id, 'assigned_to', current.assigned_to, 'unchanged', true);
  END IF;
  UPDATE public.tickets
  SET assigned_to = p_agent_id
  WHERE id = p_ticket_id;
  RETURN jsonb_build_object('id', p_ticket_id, 'assigned_to', p_agent_id, 'assigned_by', auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.update_ticket_progress(p_ticket_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current public.tickets;
  updated_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_status NOT IN ('Open', 'In Progress', 'Waiting for User') THEN
    RAISE EXCEPTION 'That status change is not allowed';
  END IF;
  SELECT * INTO current FROM public.tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;
  IF current.status IN ('Closed', 'Resolved') THEN
    RAISE EXCEPTION 'That status change is not allowed';
  END IF;
  IF current.status = p_status THEN
    RETURN jsonb_build_object('id', current.id, 'status', current.status, 'unchanged', true);
  END IF;
  UPDATE public.tickets
  SET status = p_status
  WHERE id = p_ticket_id
    AND status = current.status
    AND status NOT IN ('Closed', 'Resolved');
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count = 0 THEN
    RAISE EXCEPTION 'This ticket was updated. Refresh and try again.';
  END IF;
  RETURN jsonb_build_object('id', p_ticket_id, 'status', p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_ticket(p_ticket_id uuid, p_notes text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current public.tickets;
  updated_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT * INTO current FROM public.tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;
  IF current.status = 'Closed' THEN
    RETURN jsonb_build_object(
      'id', current.id,
      'status', 'Closed',
      'resolved_by', current.resolved_by,
      'resolved_at', current.resolved_at,
      'unchanged', true
    );
  END IF;
  UPDATE public.tickets
  SET status = 'Closed',
      resolution_notes = trim(coalesce(p_notes, ''))
  WHERE id = p_ticket_id
    AND status <> 'Closed';
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count = 0 THEN
    SELECT * INTO current FROM public.tickets WHERE id = p_ticket_id;
    RETURN jsonb_build_object(
      'id', current.id,
      'status', current.status,
      'resolved_by', current.resolved_by,
      'resolved_at', current.resolved_at,
      'unchanged', true
    );
  END IF;
  SELECT * INTO current FROM public.tickets WHERE id = p_ticket_id;
  RETURN jsonb_build_object(
    'id', current.id,
    'status', current.status,
    'resolved_by', current.resolved_by,
    'resolved_at', current.resolved_at,
    'unchanged', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_ticket(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current public.tickets;
  updated_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT * INTO current FROM public.tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;
  IF current.status = 'Open' THEN
    RETURN jsonb_build_object('id', current.id, 'status', 'Open', 'unchanged', true);
  END IF;
  IF current.status NOT IN ('Closed', 'Resolved') THEN
    RAISE EXCEPTION 'That status change is not allowed';
  END IF;
  UPDATE public.tickets
  SET status = 'Open'
  WHERE id = p_ticket_id
    AND status IN ('Closed', 'Resolved');
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count = 0 THEN
    RAISE EXCEPTION 'This ticket was updated. Refresh and try again.';
  END IF;
  RETURN jsonb_build_object('id', p_ticket_id, 'status', 'Open');
END;
$$;

REVOKE ALL ON FUNCTION public.assign_ticket(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_ticket_progress(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_ticket(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reopen_ticket(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_ticket(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_ticket_progress(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_ticket(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_ticket(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
