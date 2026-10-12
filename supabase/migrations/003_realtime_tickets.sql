-- Additive: let signed-in dashboards receive ticket changes.
-- Existing tickets, roles, and functions are left in place.

DO $publication$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END
$publication$;
