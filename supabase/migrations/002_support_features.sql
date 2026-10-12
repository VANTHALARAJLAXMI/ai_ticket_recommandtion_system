-- Additive Northline upgrade. Safe to review and run on the existing project.
-- It does not drop tickets, profiles, or ticket numbers such as TKT-000002.
-- It does not backfill activity history or invent timestamps for older tickets.

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO postgres, service_role, supabase_auth_admin, authenticated;

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

ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS business_impact text;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS urgency text;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS affected_system text;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comments_body_len CHECK (char_length(body) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS comments_ticket_id_idx ON public.ticket_comments (ticket_id, created_at);

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
  IF NOT private.can_access_ticket(NEW.ticket_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  NEW.author_id := auth.uid();
  NEW.body := trim(NEW.body);
  IF NOT private.is_staff() THEN
    NEW.is_internal := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_prepare_insert ON public.ticket_comments;
CREATE TRIGGER comments_prepare_insert
BEFORE INSERT ON public.ticket_comments
FOR EACH ROW EXECUTE FUNCTION private.prepare_comment_insert();

-- ---------------------------------------------------------------------------
-- Knowledge articles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.knowledge_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  summary text NOT NULL,
  content text NOT NULL,
  troubleshooting_steps text NOT NULL DEFAULT '',
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_articles_title_len CHECK (char_length(title) BETWEEN 5 AND 140),
  CONSTRAINT knowledge_articles_summary_len CHECK (char_length(summary) BETWEEN 20 AND 500),
  CONSTRAINT knowledge_articles_content_len CHECK (char_length(content) BETWEEN 20 AND 5000),
  CONSTRAINT knowledge_articles_steps_len CHECK (char_length(troubleshooting_steps) <= 4000)
);

CREATE INDEX IF NOT EXISTS knowledge_articles_category_idx ON public.knowledge_articles (category, is_published);

CREATE OR REPLACE FUNCTION private.prepare_knowledge_article()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_admin() THEN
    RAISE EXCEPTION 'Only admins can change knowledge articles';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.created_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS knowledge_articles_prepare ON public.knowledge_articles;
CREATE TRIGGER knowledge_articles_prepare
BEFORE INSERT OR UPDATE ON public.knowledge_articles
FOR EACH ROW EXECUTE FUNCTION private.prepare_knowledge_article();

-- ---------------------------------------------------------------------------
-- Notifications, history, feedback, SLA, attachments
-- ---------------------------------------------------------------------------

-- This project already has a notifications table from the older helpdesk.
-- That table has no user_id column, so creating an index on user_id fails.
-- Keep the old rows under a new name, then create the table this app uses.
DO $rename_notifications$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'notifications'
         AND column_name = 'user_id'
     ) THEN
    IF to_regclass('public.notifications_legacy') IS NOT NULL THEN
      RAISE EXCEPTION 'public.notifications has no user_id column, and public.notifications_legacy already exists. Rename one of those tables, then run this script again.';
    END IF;
    ALTER TABLE public.notifications RENAME TO notifications_legacy;
  END IF;
END
$rename_notifications$;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES public.tickets (id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_kind_check CHECK (kind IN ('assigned', 'status_changed', 'comment', 'resolved')),
  CONSTRAINT notifications_title_len CHECK (char_length(title) BETWEEN 1 AND 140),
  CONSTRAINT notifications_body_len CHECK (char_length(body) <= 500)
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ticket_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets (id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  event_type text NOT NULL,
  from_value text,
  to_value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_activity_type_check CHECK (event_type IN ('status_changed', 'assigned'))
);

CREATE INDEX IF NOT EXISTS ticket_activity_ticket_idx ON public.ticket_activity (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS public.ticket_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL UNIQUE REFERENCES public.tickets (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  rating smallint NOT NULL,
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_feedback_rating_check CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT ticket_feedback_comment_len CHECK (char_length(comment) <= 1000)
);

CREATE TABLE IF NOT EXISTS public.sla_targets (
  priority text PRIMARY KEY,
  response_minutes integer NOT NULL,
  resolution_minutes integer NOT NULL,
  CONSTRAINT sla_targets_priority_check CHECK (priority IN ('Critical', 'High', 'Medium', 'Low')),
  CONSTRAINT sla_targets_positive CHECK (response_minutes > 0 AND resolution_minutes >= response_minutes)
);

INSERT INTO public.sla_targets (priority, response_minutes, resolution_minutes)
VALUES
  ('Critical', 30, 240),
  ('High', 120, 1440),
  ('Medium', 480, 4320),
  ('Low', 1440, 10080)
ON CONFLICT (priority) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets (id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_attachments_name_len CHECK (char_length(file_name) BETWEEN 1 AND 180),
  CONSTRAINT ticket_attachments_size_check CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  CONSTRAINT ticket_attachments_mime_check CHECK (mime_type IN (
    'image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ))
);

CREATE INDEX IF NOT EXISTS ticket_attachments_ticket_idx ON public.ticket_attachments (ticket_id, created_at);

-- ---------------------------------------------------------------------------
-- Real events: future status, assignment, and comment changes only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.notify_user(
  p_user_id uuid,
  p_ticket_id uuid,
  p_kind text,
  p_title text,
  p_body text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_user_id = auth.uid() THEN
    RETURN;
  END IF;
  INSERT INTO public.notifications (user_id, ticket_id, kind, title, body)
  VALUES (p_user_id, p_ticket_id, p_kind, left(p_title, 140), left(COALESCE(p_body, ''), 500));
END;
$$;

CREATE OR REPLACE FUNCTION private.record_ticket_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  number text := COALESCE(NEW.ticket_number, 'Ticket');
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.ticket_activity (ticket_id, actor_id, event_type, from_value, to_value)
    VALUES (NEW.id, auth.uid(), 'status_changed', OLD.status, NEW.status);
    PERFORM private.notify_user(
      NEW.user_id,
      NEW.id,
      CASE WHEN NEW.status IN ('Resolved', 'Closed') THEN 'resolved' ELSE 'status_changed' END,
      number || ' is now ' || NEW.status,
      'Status changed from ' || OLD.status || ' to ' || NEW.status || '.'
    );
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.ticket_activity (ticket_id, actor_id, event_type, from_value, to_value)
    VALUES (NEW.id, auth.uid(), 'assigned', OLD.assigned_to::text, NEW.assigned_to::text);
    PERFORM private.notify_user(
      NEW.assigned_to,
      NEW.id,
      'assigned',
      number || ' was assigned to you',
      COALESCE(NEW.title, 'A ticket needs attention.')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_record_change ON public.tickets;
CREATE TRIGGER tickets_record_change
AFTER UPDATE OF status, assigned_to ON public.tickets
FOR EACH ROW EXECUTE FUNCTION private.record_ticket_change();

CREATE OR REPLACE FUNCTION private.notify_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent public.tickets;
BEGIN
  SELECT * INTO parent FROM public.tickets WHERE id = NEW.ticket_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF NOT NEW.is_internal THEN
    PERFORM private.notify_user(
      parent.user_id,
      parent.id,
      'comment',
      COALESCE(parent.ticket_number, 'Ticket') || ' has a new reply',
      left(NEW.body, 180)
    );
  END IF;
  PERFORM private.notify_user(
    parent.assigned_to,
    parent.id,
    'comment',
    COALESCE(parent.ticket_number, 'Ticket') || ' has a new comment',
    left(NEW.body, 180)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_notify ON public.ticket_comments;
CREATE TRIGGER comments_notify
AFTER INSERT ON public.ticket_comments
FOR EACH ROW EXECUTE FUNCTION private.notify_comment();

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
  SET read_at = now()
  WHERE id = p_id AND user_id = auth.uid() AND read_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
  SET read_at = now()
  WHERE user_id = auth.uid() AND read_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

-- ---------------------------------------------------------------------------
-- AI save, granted only to the Edge Function service role
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ticket_ai_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL UNIQUE REFERENCES public.tickets (id) ON DELETE CASCADE,
  category text NOT NULL,
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
  IF p_category NOT IN ('Hardware', 'Software', 'Network', 'Email', 'Account Access', 'Security', 'Other') THEN
    IF to_regclass('public.categories') IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.categories WHERE name = p_category
    ) THEN
      RAISE EXCEPTION 'AI returned an invalid category';
    END IF;
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
    IF jsonb_typeof(step) <> 'string' OR char_length(trim(step #>> '{}')) < 3 OR char_length(trim(step #>> '{}')) > 300 THEN
      RAISE EXCEPTION 'AI returned invalid troubleshooting steps';
    END IF;
  END LOOP;

  INSERT INTO public.ticket_ai_analysis (
    ticket_id, category, suggested_priority, sentiment, suggested_team,
    summary, probable_cause, troubleshooting_steps, confidence, escalation_recommended
  )
  VALUES (
    p_ticket_id, p_category, p_suggested_priority, p_sentiment, trim(p_suggested_team),
    trim(p_summary), trim(p_probable_cause), p_steps, p_confidence, COALESCE(p_escalation, false)
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
    escalation_recommended = EXCLUDED.escalation_recommended
  RETURNING id INTO saved;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'ai_summary'
  ) THEN
    UPDATE public.tickets SET ai_summary = trim(p_summary) WHERE id = p_ticket_id;
  END IF;

  RETURN saved;
END;
$$;

REVOKE ALL ON FUNCTION public.save_ticket_ai_analysis(uuid, text, text, text, text, text, text, jsonb, numeric, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_ticket_ai_analysis(uuid, text, text, text, text, text, text, jsonb, numeric, boolean, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_articles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_activity FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_feedback FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sla_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_targets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_attachments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_ai_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_ai_analysis FORCE ROW LEVEL SECURITY;

DO $policy$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ticket_comments' AND policyname = 'comments_select') THEN
    CREATE POLICY comments_select ON public.ticket_comments
    FOR SELECT TO authenticated
    USING (private.can_access_ticket(ticket_id) AND (NOT is_internal OR private.is_staff()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ticket_comments' AND policyname = 'comments_insert') THEN
    CREATE POLICY comments_insert ON public.ticket_comments
    FOR INSERT TO authenticated
    WITH CHECK (author_id = auth.uid() AND private.can_access_ticket(ticket_id));
  END IF;
END
$policy$;

DO $policy$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'knowledge_articles' AND policyname = 'knowledge_articles_select') THEN
    CREATE POLICY knowledge_articles_select ON public.knowledge_articles
    FOR SELECT TO authenticated
    USING (is_published OR private.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'knowledge_articles' AND policyname = 'knowledge_articles_insert') THEN
    CREATE POLICY knowledge_articles_insert ON public.knowledge_articles
    FOR INSERT TO authenticated
    WITH CHECK (private.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'knowledge_articles' AND policyname = 'knowledge_articles_update') THEN
    CREATE POLICY knowledge_articles_update ON public.knowledge_articles
    FOR UPDATE TO authenticated
    USING (private.is_admin())
    WITH CHECK (private.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'knowledge_articles' AND policyname = 'knowledge_articles_delete') THEN
    CREATE POLICY knowledge_articles_delete ON public.knowledge_articles
    FOR DELETE TO authenticated
    USING (private.is_admin());
  END IF;
END
$policy$;

DO $policy$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'notifications_select_own') THEN
    CREATE POLICY notifications_select_own ON public.notifications
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ticket_activity' AND policyname = 'ticket_activity_select') THEN
    CREATE POLICY ticket_activity_select ON public.ticket_activity
    FOR SELECT TO authenticated
    USING (private.can_access_ticket(ticket_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ticket_feedback' AND policyname = 'ticket_feedback_select') THEN
    CREATE POLICY ticket_feedback_select ON public.ticket_feedback
    FOR SELECT TO authenticated
    USING (private.can_access_ticket(ticket_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ticket_feedback' AND policyname = 'ticket_feedback_insert') THEN
    CREATE POLICY ticket_feedback_insert ON public.ticket_feedback
    FOR INSERT TO authenticated
    WITH CHECK (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.tickets t
        WHERE t.id = ticket_id AND t.user_id = auth.uid() AND t.status IN ('Resolved', 'Closed')
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ticket_feedback' AND policyname = 'ticket_feedback_update') THEN
    CREATE POLICY ticket_feedback_update ON public.ticket_feedback
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.tickets t
        WHERE t.id = ticket_id AND t.user_id = auth.uid() AND t.status IN ('Resolved', 'Closed')
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sla_targets' AND policyname = 'sla_targets_select') THEN
    CREATE POLICY sla_targets_select ON public.sla_targets
    FOR SELECT TO authenticated
    USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sla_targets' AND policyname = 'sla_targets_update') THEN
    CREATE POLICY sla_targets_update ON public.sla_targets
    FOR UPDATE TO authenticated
    USING (private.is_admin())
    WITH CHECK (private.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ticket_attachments' AND policyname = 'ticket_attachments_select') THEN
    CREATE POLICY ticket_attachments_select ON public.ticket_attachments
    FOR SELECT TO authenticated
    USING (private.can_access_ticket(ticket_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ticket_attachments' AND policyname = 'ticket_attachments_insert') THEN
    CREATE POLICY ticket_attachments_insert ON public.ticket_attachments
    FOR INSERT TO authenticated
    WITH CHECK (uploaded_by = auth.uid() AND private.can_access_ticket(ticket_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ticket_attachments' AND policyname = 'ticket_attachments_delete') THEN
    CREATE POLICY ticket_attachments_delete ON public.ticket_attachments
    FOR DELETE TO authenticated
    USING (uploaded_by = auth.uid() OR private.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ticket_ai_analysis' AND policyname = 'ticket_ai_select') THEN
    CREATE POLICY ticket_ai_select ON public.ticket_ai_analysis
    FOR SELECT TO authenticated
    USING (private.can_access_ticket(ticket_id));
  END IF;
END
$policy$;

REVOKE ALL ON TABLE public.ticket_comments FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.knowledge_articles FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.notifications FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.ticket_activity FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.ticket_feedback FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.sla_targets FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.ticket_attachments FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.ticket_ai_analysis FROM PUBLIC, anon;

GRANT SELECT, INSERT ON public.ticket_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_articles TO authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT SELECT ON public.ticket_activity TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ticket_feedback TO authenticated;
GRANT SELECT, UPDATE ON public.sla_targets TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.ticket_attachments TO authenticated;
GRANT SELECT ON public.ticket_ai_analysis TO authenticated;

-- ---------------------------------------------------------------------------
-- Private storage bucket. Paths are ticket-id/file-name.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ticket-attachments',
  'ticket-attachments',
  false,
  5242880,
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS ticket_attachments_storage_select ON storage.objects;
CREATE POLICY ticket_attachments_storage_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'ticket-attachments'
  AND private.can_access_ticket(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS ticket_attachments_storage_insert ON storage.objects;
CREATE POLICY ticket_attachments_storage_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'ticket-attachments'
  AND private.can_access_ticket(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS ticket_attachments_storage_delete ON storage.objects;
CREATE POLICY ticket_attachments_storage_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'ticket-attachments'
  AND (
    owner = auth.uid()
    OR private.can_access_ticket(((storage.foldername(name))[1])::uuid) AND private.is_admin()
  )
);

DO $publication$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END
$publication$;

NOTIFY pgrst, 'reload schema';
