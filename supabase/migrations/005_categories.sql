-- Additive category list for the existing ticket project.
-- Ticket rows stay as they are. Category remains a text value on each ticket.

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_name_len CHECK (char_length(name) BETWEEN 2 AND 40),
  CONSTRAINT categories_description_len CHECK (char_length(description) <= 300)
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories FORCE ROW LEVEL SECURITY;

DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'categories' AND policyname = 'categories_select'
  ) THEN
    CREATE POLICY categories_select ON public.categories
    FOR SELECT TO authenticated
    USING (is_active OR public.is_admin());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'categories' AND policyname = 'categories_insert'
  ) THEN
    CREATE POLICY categories_insert ON public.categories
    FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'categories' AND policyname = 'categories_update'
  ) THEN
    CREATE POLICY categories_update ON public.categories
    FOR UPDATE TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'categories' AND policyname = 'categories_delete'
  ) THEN
    CREATE POLICY categories_delete ON public.categories
    FOR DELETE TO authenticated
    USING (public.is_admin());
  END IF;
END
$policy$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;

INSERT INTO public.categories (name)
VALUES
  ('Hardware'),
  ('Software'),
  ('Network'),
  ('Email'),
  ('Account Access'),
  ('Security'),
  ('Other')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.categories (name)
SELECT DISTINCT btrim(category)
FROM public.tickets
WHERE category IS NOT NULL
  AND char_length(btrim(category)) BETWEEN 2 AND 40
ON CONFLICT (name) DO NOTHING;

NOTIFY pgrst, 'reload schema';
