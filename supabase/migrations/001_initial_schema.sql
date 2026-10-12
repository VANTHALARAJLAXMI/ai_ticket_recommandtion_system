-- Northline IT Support schema, row level security, and trusted ticket operations.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role, supabase_auth_admin, authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'employee',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_role_check CHECK (role IN ('employee', 'agent', 'admin')),
  CONSTRAINT profiles_name_len CHECK (char_length(full_name) BETWEEN 2 AND 80),
  CONSTRAINT profiles_email_len CHECK (char_length(email) BETWEEN 3 AND 320)
);

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_name_len CHECK (char_length(name) BETWEEN 2 AND 40),
  CONSTRAINT categories_description_len CHECK (char_length(description) <= 300)
);

CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL DEFAULT '' UNIQUE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  assigned_to uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL REFERENCES public.categories (name) ON UPDATE CASCADE,
  priority text NOT NULL DEFAULT 'Medium',
  priority_rank smallint GENERATED ALWAYS AS (
    CASE priority
      WHEN 'Critical' THEN 1
      WHEN 'High' THEN 2
      WHEN 'Medium' THEN 3
      ELSE 4
    END
  ) STORED,
  status text NOT NULL DEFAULT 'Open',
  business_impact text NOT NULL,
  urgency text NOT NULL,
  affected_system text NOT NULL DEFAULT '',
  resolution_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT tickets_number_format CHECK (ticket_number ~ '^TKT-[0-9]{6,}$'),
  CONSTRAINT tickets_title_len CHECK (char_length(title) BETWEEN 5 AND 160),
  CONSTRAINT tickets_description_len CHECK (char_length(description) BETWEEN 20 AND 5000),
  CONSTRAINT tickets_priority_check CHECK (priority IN ('Critical', 'High', 'Medium', 'Low')),
  CONSTRAINT tickets_status_check CHECK (status IN ('Open', 'In Progress', 'Waiting for User', 'Resolved', 'Closed')),
  CONSTRAINT tickets_impact_check CHECK (business_impact IN ('Low', 'Medium', 'High', 'Organization-wide')),
  CONSTRAINT tickets_urgency_check CHECK (urgency IN ('Low', 'Medium', 'High', 'Critical')),
  CONSTRAINT tickets_affected_len CHECK (char_length(affected_system) <= 200),
  CONSTRAINT tickets_resolution_len CHECK (char_length(resolution_notes) <= 4000)
);

CREATE TABLE public.ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comments_body_len CHECK (char_length(body) BETWEEN 1 AND 2000)
);

CREATE TABLE public.ticket_ai_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL UNIQUE REFERENCES public.tickets (id) ON DELETE CASCADE,
  category text NOT NULL REFERENCES public.categories (name) ON UPDATE CASCADE,
  suggested_priority text NOT NULL,
  sentiment text NOT NULL,
  suggested_team text NOT NULL,
  summary text NOT NULL,
  probable_cause text NOT NULL,
  troubleshooting_steps jsonb NOT NULL,
  confidence numeric(4, 3) NOT NULL,
  escalation_recommended boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_priority_check CHECK (suggested_priority IN ('Critical', 'High', 'Medium', 'Low')),
  CONSTRAINT ai_sentiment_check CHECK (sentiment IN ('Polite', 'Neutral', 'Concerned', 'Frustrated', 'Urgent')),
  CONSTRAINT ai_team_len CHECK (char_length(suggested_team) BETWEEN 2 AND 80),
  CONSTRAINT ai_summary_len CHECK (char_length(summary) BETWEEN 10 AND 600),
  CONSTRAINT ai_cause_len CHECK (char_length(probable_cause) BETWEEN 10 AND 600),
  CONSTRAINT ai_confidence_range CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT ai_steps_array CHECK (jsonb_typeof(troubleshooting_steps) = 'array')
);

CREATE TABLE public.knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL REFERENCES public.categories (name) ON UPDATE CASCADE,
  summary text NOT NULL,
  content text NOT NULL,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kb_title_len CHECK (char_length(title) BETWEEN 5 AND 140),
  CONSTRAINT kb_summary_len CHECK (char_length(summary) BETWEEN 20 AND 500),
  CONSTRAINT kb_content_len CHECK (char_length(content) BETWEEN 20 AND 5000)
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE private.ticket_number_seq START WITH 1001;

CREATE INDEX tickets_user_id_idx ON public.tickets (user_id);
CREATE INDEX tickets_assigned_to_idx ON public.tickets (assigned_to);
CREATE INDEX tickets_status_idx ON public.tickets (status);
CREATE INDEX tickets_priority_idx ON public.tickets (priority);
CREATE INDEX tickets_created_at_idx ON public.tickets (created_at DESC);
CREATE INDEX comments_ticket_id_idx ON public.ticket_comments (ticket_id, created_at);
CREATE INDEX kb_category_idx ON public.knowledge_base (category);
CREATE INDEX audit_created_idx ON public.audit_logs (created_at DESC);

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION private.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('agent', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_ticket(p_ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tickets t
    WHERE t.id = p_ticket_id
      AND (
        t.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role = 'admin'
        )
        OR (
          EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'agent'
          )
          AND (t.assigned_to = auth.uid() OR t.assigned_to IS NULL)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.ticket_is_closed(p_ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tickets
    WHERE id = p_ticket_id AND status = 'Closed'
  );
$$;

CREATE OR REPLACE FUNCTION private.write_audit(
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_metadata jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_action, p_entity, p_entity_id, COALESCE(p_metadata, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION private.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.force_employee_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.role := 'employee';
  IF NEW.full_name IS NULL OR char_length(trim(NEW.full_name)) < 2 THEN
    NEW.full_name := 'Employee';
  ELSE
    NEW.full_name := left(trim(NEW.full_name), 80);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Profile id cannot be changed';
  END IF;
  NEW.full_name := trim(NEW.full_name);
  IF auth.uid() IS NOT NULL THEN
    NEW.email := OLD.email;
  END IF;
  IF char_length(NEW.full_name) < 2 OR char_length(NEW.full_name) > 80 THEN
    RAISE EXCEPTION 'Name must be between 2 and 80 characters';
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.uid() IS NULL AND current_user IN ('postgres', 'supabase_admin') THEN
      NULL;
    ELSIF current_setting('app.allow_role_change', true) = 'on' AND private.is_admin() THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Only admins can change roles';
    END IF;
    IF NEW.role NOT IN ('employee', 'agent', 'admin') THEN
      RAISE EXCEPTION 'Unknown role';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.prepare_ticket_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.categories
    WHERE name = NEW.category AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Choose an active category';
  END IF;
  NEW.user_id := auth.uid();
  NEW.assigned_to := NULL;
  NEW.status := 'Open';
  NEW.resolution_notes := '';
  NEW.resolved_at := NULL;
  NEW.priority := CASE NEW.urgency
    WHEN 'Critical' THEN 'Critical'
    WHEN 'High' THEN 'High'
    WHEN 'Medium' THEN 'Medium'
    ELSE 'Low'
  END;
  NEW.ticket_number := 'TKT-' || lpad(nextval('private.ticket_number_seq')::text, 6, '0');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.prepare_comment_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  NEW.author_id := auth.uid();
  NEW.body := trim(NEW.body);
  IF NOT private.is_staff() THEN
    NEW.is_internal := false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.prepare_article_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by := auth.uid();
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''), 'Employee'),
    COALESCE(NEW.email, ''),
    'employee'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_force_employee
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.force_employee_on_insert();

CREATE TRIGGER profiles_guard_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.guard_profile_update();

CREATE TRIGGER categories_touch
BEFORE UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

CREATE TRIGGER tickets_prepare_insert
BEFORE INSERT ON public.tickets
FOR EACH ROW EXECUTE FUNCTION private.prepare_ticket_insert();

CREATE TRIGGER comments_prepare_insert
BEFORE INSERT ON public.ticket_comments
FOR EACH ROW EXECUTE FUNCTION private.prepare_comment_insert();

CREATE TRIGGER knowledge_prepare_write
BEFORE INSERT OR UPDATE ON public.knowledge_base
FOR EACH ROW EXECUTE FUNCTION private.prepare_article_write();

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Trusted operations
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.assert_ticket_access(p_ticket_id uuid)
RETURNS public.tickets
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found public.tickets;
BEGIN
  IF NOT private.can_access_ticket(p_ticket_id) THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;
  SELECT * INTO found FROM public.tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;
  RETURN found;
END;
$$;

CREATE OR REPLACE FUNCTION private.apply_status(
  p_ticket_id uuid,
  p_status text,
  p_resolution_notes text,
  p_allow_employee_reopen boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current public.tickets;
  notes text := trim(COALESCE(p_resolution_notes, ''));
BEGIN
  current := private.assert_ticket_access(p_ticket_id);
  IF p_status NOT IN ('Open', 'In Progress', 'Waiting for User', 'Resolved', 'Closed') THEN
    RAISE EXCEPTION 'Unknown status';
  END IF;

  IF p_allow_employee_reopen THEN
    IF current.user_id <> auth.uid() OR current.status <> 'Resolved' OR p_status <> 'Open' THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  ELSE
    IF NOT private.is_staff() THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
    IF NOT (
      (current.status = 'Open' AND p_status IN ('In Progress', 'Waiting for User', 'Resolved', 'Closed')) OR
      (current.status = 'In Progress' AND p_status IN ('Waiting for User', 'Resolved', 'Closed', 'Open')) OR
      (current.status = 'Waiting for User' AND p_status IN ('In Progress', 'Resolved', 'Closed')) OR
      (current.status = 'Resolved' AND p_status IN ('Open', 'Closed')) OR
      (current.status = 'Closed' AND p_status = 'Open')
    ) THEN
      RAISE EXCEPTION 'That status change is not allowed';
    END IF;
  END IF;

  IF p_status IN ('Resolved', 'Closed') AND (char_length(notes) < 10 OR char_length(notes) > 4000) THEN
    RAISE EXCEPTION 'Resolution notes are required';
  END IF;

  UPDATE public.tickets
  SET
    status = p_status,
    resolution_notes = CASE
      WHEN p_status IN ('Resolved', 'Closed') THEN notes
      ELSE resolution_notes
    END,
    resolved_at = CASE
      WHEN p_status IN ('Resolved', 'Closed') THEN COALESCE(resolved_at, now())
      WHEN p_status = 'Open' THEN NULL
      ELSE resolved_at
    END,
    assigned_to = CASE
      WHEN assigned_to IS NULL AND private.is_staff() AND NOT p_allow_employee_reopen THEN auth.uid()
      ELSE assigned_to
    END,
    updated_at = now()
  WHERE id = p_ticket_id;

  PERFORM private.write_audit(
    'status_changed',
    'ticket',
    p_ticket_id,
    jsonb_build_object('from', current.status, 'to', p_status)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_ticket(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.apply_status(p_ticket_id, 'Open', '', true);
  RETURN jsonb_build_object('id', p_ticket_id, 'status', 'Open');
END;
$$;

CREATE OR REPLACE FUNCTION public.update_ticket_status(
  p_ticket_id uuid,
  p_status text,
  p_resolution_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.apply_status(p_ticket_id, p_status, p_resolution_notes, false);
  RETURN jsonb_build_object('id', p_ticket_id, 'status', p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_ticket_priority(p_ticket_id uuid, p_priority text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.assert_ticket_access(p_ticket_id);
  IF NOT private.is_staff() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_priority NOT IN ('Critical', 'High', 'Medium', 'Low') THEN
    RAISE EXCEPTION 'Unknown priority';
  END IF;
  UPDATE public.tickets
  SET priority = p_priority, updated_at = now()
  WHERE id = p_ticket_id;
  PERFORM private.write_audit('priority_changed', 'ticket', p_ticket_id, jsonb_build_object('priority', p_priority));
  RETURN jsonb_build_object('id', p_ticket_id, 'priority', p_priority);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_ticket_category(p_ticket_id uuid, p_category text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.assert_ticket_access(p_ticket_id);
  IF NOT private.is_staff() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE name = p_category AND is_active = true) THEN
    RAISE EXCEPTION 'Choose an active category';
  END IF;
  UPDATE public.tickets
  SET category = p_category, updated_at = now()
  WHERE id = p_ticket_id;
  PERFORM private.write_audit('category_changed', 'ticket', p_ticket_id, jsonb_build_object('category', p_category));
  RETURN jsonb_build_object('id', p_ticket_id, 'category', p_category);
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_ticket(p_ticket_id uuid, p_agent_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current public.tickets;
BEGIN
  current := private.assert_ticket_access(p_ticket_id);
  IF NOT private.is_staff() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_agent_id IS NULL THEN
    IF NOT private.is_admin() THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = p_agent_id AND role IN ('agent', 'admin')
    ) THEN
      RAISE EXCEPTION 'Choose a support agent';
    END IF;
    IF NOT private.is_admin() AND p_agent_id <> auth.uid() THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
    IF NOT private.is_admin() AND current.assigned_to IS NOT NULL AND current.assigned_to <> auth.uid() THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  END IF;

  UPDATE public.tickets
  SET assigned_to = p_agent_id, updated_at = now()
  WHERE id = p_ticket_id;
  PERFORM private.write_audit(
    'assignment_changed',
    'ticket',
    p_ticket_id,
    jsonb_build_object('assigned_to', p_agent_id)
  );
  RETURN jsonb_build_object('id', p_ticket_id, 'assigned_to', p_agent_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated jsonb;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Only admins can change roles';
  END IF;
  IF p_role NOT IN ('employee', 'agent', 'admin') THEN
    RAISE EXCEPTION 'Unknown role';
  END IF;
  IF p_user_id = auth.uid() AND p_role <> 'admin' THEN
    RAISE EXCEPTION 'You cannot remove your own admin access';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  PERFORM set_config('app.allow_role_change', 'on', true);
  UPDATE public.profiles SET role = p_role WHERE id = p_user_id;
  PERFORM private.write_audit('role_changed', 'profile', p_user_id, jsonb_build_object('role', p_role));
  SELECT to_jsonb(p) INTO updated FROM public.profiles p WHERE p.id = p_user_id;
  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_first_admin(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') THEN
    RAISE EXCEPTION 'An admin already exists';
  END IF;
  SELECT id INTO target FROM auth.users WHERE lower(email) = lower(trim(p_email));
  IF target IS NULL THEN
    RAISE EXCEPTION 'No account exists for that email';
  END IF;
  PERFORM set_config('app.allow_role_change', 'on', true);
  UPDATE public.profiles SET role = 'admin' WHERE id = target;
  PERFORM private.write_audit('role_changed', 'profile', target, jsonb_build_object('role', 'admin', 'bootstrap', true));
END;
$$;

CREATE OR REPLACE FUNCTION public.save_ticket_ai_analysis(
  p_ticket_id uuid,
  p_category text,
  p_suggested_priority text,
  p_sentiment text,
  p_suggested_team text,
  p_summary text,
  p_probable_cause text,
  p_steps jsonb,
  p_confidence numeric,
  p_escalation boolean,
  p_actor uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saved uuid;
  step jsonb;
  step_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tickets WHERE id = p_ticket_id) THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE name = p_category) THEN
    RAISE EXCEPTION 'AI returned an invalid category';
  END IF;
  IF p_suggested_priority NOT IN ('Critical', 'High', 'Medium', 'Low') THEN
    RAISE EXCEPTION 'AI returned an invalid priority';
  END IF;
  IF p_sentiment NOT IN ('Polite', 'Neutral', 'Concerned', 'Frustrated', 'Urgent') THEN
    RAISE EXCEPTION 'AI returned an invalid sentiment';
  END IF;
  IF char_length(trim(p_suggested_team)) < 2 OR char_length(trim(p_suggested_team)) > 80 THEN
    RAISE EXCEPTION 'AI returned an invalid support team';
  END IF;
  IF char_length(trim(p_summary)) < 10 OR char_length(trim(p_summary)) > 600 THEN
    RAISE EXCEPTION 'AI returned an invalid summary';
  END IF;
  IF char_length(trim(p_probable_cause)) < 10 OR char_length(trim(p_probable_cause)) > 600 THEN
    RAISE EXCEPTION 'AI returned an invalid probable cause';
  END IF;
  IF p_confidence < 0 OR p_confidence > 1 THEN
    RAISE EXCEPTION 'AI returned an invalid confidence score';
  END IF;
  IF jsonb_typeof(p_steps) <> 'array' THEN
    RAISE EXCEPTION 'AI returned invalid troubleshooting steps';
  END IF;
  step_count := jsonb_array_length(p_steps);
  IF step_count < 2 OR step_count > 6 THEN
    RAISE EXCEPTION 'AI returned invalid troubleshooting steps';
  END IF;
  FOR step IN SELECT value FROM jsonb_array_elements(p_steps)
  LOOP
    IF jsonb_typeof(step) <> 'string' THEN
      RAISE EXCEPTION 'AI returned invalid troubleshooting steps';
    END IF;
    IF char_length(trim(step #>> '{}')) < 3 OR char_length(trim(step #>> '{}')) > 300 THEN
      RAISE EXCEPTION 'AI returned invalid troubleshooting steps';
    END IF;
  END LOOP;

  INSERT INTO public.ticket_ai_analysis (
    ticket_id, category, suggested_priority, sentiment, suggested_team,
    summary, probable_cause, troubleshooting_steps, confidence, escalation_recommended
  )
  VALUES (
    p_ticket_id, p_category, p_suggested_priority, p_sentiment, trim(p_suggested_team),
    trim(p_summary), trim(p_probable_cause), p_steps, p_confidence, p_escalation
  )
  ON CONFLICT (ticket_id) DO UPDATE SET
    category = EXCLUDED.category,
    suggested_priority = EXCLUDED.suggested_priority,
    sentiment = EXCLUDED.sentiment,
    suggested_team = EXCLUDED.suggested_team,
    summary = EXCLUDED.summary,
    probable_cause = EXCLUDED.probable_cause,
    troubleshooting_steps = EXCLUDED.troubleshooting_steps,
    confidence = EXCLUDED.confidence,
    escalation_recommended = EXCLUDED.escalation_recommended,
    created_at = now()
  RETURNING id INTO saved;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (p_actor, 'ai_analysis_saved', 'ticket', p_ticket_id, jsonb_build_object('category', p_category));
  RETURN saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.employee_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'total', count(*),
      'open', count(*) FILTER (WHERE status = 'Open'),
      'in_progress', count(*) FILTER (WHERE status = 'In Progress'),
      'waiting', count(*) FILTER (WHERE status = 'Waiting for User'),
      'resolved', count(*) FILTER (WHERE status = 'Resolved')
    )
    FROM public.tickets
    WHERE user_id = uid
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF NOT private.is_staff() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'assigned', count(*) FILTER (
        WHERE assigned_to = uid AND status NOT IN ('Resolved', 'Closed')
      ),
      'unassigned', count(*) FILTER (
        WHERE assigned_to IS NULL AND status NOT IN ('Resolved', 'Closed')
      ),
      'open', count(*) FILTER (
        WHERE status = 'Open' AND (assigned_to = uid OR assigned_to IS NULL)
      ),
      'in_progress', count(*) FILTER (
        WHERE status = 'In Progress' AND (assigned_to = uid OR assigned_to IS NULL)
      ),
      'urgent', count(*) FILTER (
        WHERE priority IN ('Critical', 'High')
          AND status NOT IN ('Resolved', 'Closed')
          AND (assigned_to = uid OR assigned_to IS NULL)
      ),
      'resolved', count(*) FILTER (
        WHERE assigned_to = uid AND status = 'Resolved'
      )
    )
    FROM public.tickets
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN jsonb_build_object(
    'total', (SELECT count(*) FROM public.tickets),
    'open', (SELECT count(*) FROM public.tickets WHERE status = 'Open'),
    'in_progress', (SELECT count(*) FROM public.tickets WHERE status = 'In Progress'),
    'resolved', (SELECT count(*) FROM public.tickets WHERE status = 'Resolved'),
    'critical', (
      SELECT count(*) FROM public.tickets
      WHERE priority = 'Critical' AND status NOT IN ('Resolved', 'Closed')
    ),
    'average_resolution_hours', (
      SELECT round(avg(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0)::numeric, 1)
      FROM public.tickets
      WHERE resolved_at IS NOT NULL
    ),
    'by_category', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name', c.name, 'count', c.cnt) ORDER BY c.cnt DESC), '[]'::jsonb)
      FROM (
        SELECT category AS name, count(*) AS cnt
        FROM public.tickets
        GROUP BY category
      ) c
    ),
    'by_priority', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name', p.name, 'count', p.cnt) ORDER BY p.rank), '[]'::jsonb)
      FROM (
        SELECT priority AS name, count(*) AS cnt,
          CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END AS rank
        FROM public.tickets
        GROUP BY priority
      ) p
    ),
    'by_status', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name', s.name, 'count', s.cnt)), '[]'::jsonb)
      FROM (
        SELECT status AS name, count(*) AS cnt
        FROM public.tickets
        GROUP BY status
      ) s
    ),
    'high_priority', (
      SELECT COALESCE(jsonb_agg(to_jsonb(h)), '[]'::jsonb)
      FROM (
        SELECT id, ticket_number, title, priority, status, created_at
        FROM public.tickets
        WHERE priority IN ('Critical', 'High')
          AND status NOT IN ('Resolved', 'Closed')
        ORDER BY priority_rank, created_at
        LIMIT 6
      ) h
    ),
    'overdue', (
      SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
      FROM (
        SELECT id, ticket_number, title, priority, status, created_at
        FROM public.tickets
        WHERE status NOT IN ('Resolved', 'Closed')
          AND now() > created_at + (
            CASE priority
              WHEN 'Critical' THEN interval '4 hours'
              WHEN 'High' THEN interval '1 day'
              WHEN 'Medium' THEN interval '3 days'
              ELSE interval '7 days'
            END
          )
        ORDER BY created_at
        LIMIT 6
      ) o
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.categories FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tickets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ticket_comments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ticket_ai_analysis FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.knowledge_base FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC, anon, authenticated;

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT SELECT, INSERT ON public.tickets TO authenticated;
GRANT SELECT, INSERT ON public.ticket_comments TO authenticated;
GRANT SELECT ON public.ticket_ai_analysis TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_base TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;

GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_ticket(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.ticket_is_closed(uuid) TO authenticated;
GRANT USAGE ON SCHEMA private TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION private.handle_new_user() TO supabase_auth_admin;

REVOKE ALL ON FUNCTION public.reopen_ticket(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_ticket_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_ticket_priority(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_ticket_category(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_ticket(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.employee_dashboard_stats() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agent_dashboard_stats() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_dashboard_stats() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bootstrap_first_admin(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_ticket_ai_analysis(uuid, text, text, text, text, text, text, jsonb, numeric, boolean, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.write_audit(text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reopen_ticket(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_ticket_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_ticket_priority(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_ticket_category(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_ticket(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employee_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_ticket_ai_analysis(uuid, text, text, text, text, text, text, jsonb, numeric, boolean, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_ai_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tickets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_ai_analysis FORCE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY profiles_select ON public.profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR private.is_staff()
  OR EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.user_id = auth.uid()
      AND t.assigned_to = profiles.id
  )
  OR EXISTS (
    SELECT 1
    FROM public.ticket_comments c
    JOIN public.tickets t ON t.id = c.ticket_id
    WHERE t.user_id = auth.uid()
      AND c.author_id = profiles.id
      AND c.is_internal = false
  )
);

CREATE POLICY profiles_update_own ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid() OR private.is_admin())
WITH CHECK (id = auth.uid() OR private.is_admin());

CREATE POLICY categories_select ON public.categories
FOR SELECT TO authenticated
USING (is_active OR private.is_admin());

CREATE POLICY categories_write ON public.categories
FOR INSERT TO authenticated
WITH CHECK (private.is_admin());

CREATE POLICY categories_update ON public.categories
FOR UPDATE TO authenticated
USING (private.is_admin())
WITH CHECK (private.is_admin());

CREATE POLICY categories_delete ON public.categories
FOR DELETE TO authenticated
USING (private.is_admin());

CREATE POLICY tickets_select ON public.tickets
FOR SELECT TO authenticated
USING (private.can_access_ticket(id));

CREATE POLICY tickets_insert ON public.tickets
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY comments_select ON public.ticket_comments
FOR SELECT TO authenticated
USING (
  private.can_access_ticket(ticket_id)
  AND (NOT is_internal OR private.is_staff())
);

CREATE POLICY comments_insert ON public.ticket_comments
FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND private.can_access_ticket(ticket_id)
  AND (
    (
      NOT is_internal
      AND EXISTS (
        SELECT 1 FROM public.tickets t
        WHERE t.id = ticket_id AND t.user_id = auth.uid()
      )
      AND NOT private.ticket_is_closed(ticket_id)
    )
    OR private.is_staff()
  )
);

CREATE POLICY ai_select ON public.ticket_ai_analysis
FOR SELECT TO authenticated
USING (private.can_access_ticket(ticket_id));

CREATE POLICY knowledge_select ON public.knowledge_base
FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY knowledge_insert ON public.knowledge_base
FOR INSERT TO authenticated
WITH CHECK (private.is_admin());

CREATE POLICY knowledge_update ON public.knowledge_base
FOR UPDATE TO authenticated
USING (private.is_admin())
WITH CHECK (private.is_admin());

CREATE POLICY knowledge_delete ON public.knowledge_base
FOR DELETE TO authenticated
USING (private.is_admin());

CREATE POLICY audit_select ON public.audit_logs
FOR SELECT TO authenticated
USING (private.is_admin());

-- ---------------------------------------------------------------------------
-- Seed categories and real knowledge-base articles
-- ---------------------------------------------------------------------------

INSERT INTO public.categories (name, description) VALUES
  ('Hardware', 'Computers, monitors, docks, printers, and peripherals'),
  ('Software', 'Applications, installations, and errors'),
  ('Network', 'Connectivity, VPN, and wireless access'),
  ('Email', 'Mailbox, calendar, and message delivery'),
  ('Account Access', 'Passwords, accounts, and permissions'),
  ('Security', 'Suspicious activity and device security'),
  ('Other', 'Requests that do not fit another category');

INSERT INTO public.knowledge_base (title, category, summary, content) VALUES
  (
    'Reconnect a company laptop to the network',
    'Network',
    'Steps for an employee who cannot reach internal sites or shared drives from a company laptop.',
    E'1. Confirm other websites load. If nothing loads, reconnect Wi-Fi or the dock.\n2. Disconnect from VPN, wait 10 seconds, and connect again.\n3. Restart the laptop if the adapter still shows limited access.\n4. If only internal sites fail, tell support the office or home location and the time the connection last worked.'
  ),
  (
    'Regain access to a mailbox',
    'Email',
    'What to try before opening a ticket when Outlook or webmail will not sign in.',
    E'1. Check that the mailbox password was not changed on another device.\n2. Sign in through the browser mail page to separate an app problem from an account problem.\n3. Remove and re-add the mailbox profile only after support asks you to.\n4. Include any exact error text and whether mail works on a phone.'
  ),
  (
    'Request application access',
    'Account Access',
    'How to ask for access to a business application without sharing your password.',
    E'1. Write the application name, the task you need to complete, and your manager.\n2. Never send a password in a ticket or chat.\n3. Support will confirm the request through the normal approval path.\n4. Access is not granted automatically from the ticket text.'
  ),
  (
    'Report a suspicious message',
    'Security',
    'How employees should report a message that asks for credentials or payment changes.',
    E'1. Do not open attachments or enter credentials from the message.\n2. Use the mail client''s report option if it is available.\n3. Create a security ticket and include the sender address and the time you received it.\n4. If you already clicked a link or entered a password, say so in the first line so support can prioritize the ticket.'
  );

NOTIFY pgrst, 'reload schema';
