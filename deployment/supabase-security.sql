-- These tables are accessed only by the trusted server connection.
-- Anonymous and browser-authenticated Supabase clients get no direct access.
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO PUBLIC;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'btree_gist' AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION btree_gist SET SCHEMA extensions;
  ELSE
    CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
  END IF;
END $$;

DO $$
DECLARE cafe_table text;
BEGIN
  FOREACH cafe_table IN ARRAY ARRAY[
    'users','tenants','restaurants','staff_assignments','branch_payment_configs',
    'categories','menu_items','menu_item_price_variants',
    'global_menu_items','payments','access_audit','sessions','media_objects','rate_limit_buckets',
    'service_bays','guest_orders','pager_tickets','dining_zones','dining_tables',
    'table_reservations','waitlist_entries','aggregator_links','aggregator_clicks',
    'platform_settings','push_subscriptions','smart_tags','table_service_requests'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', cafe_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', cafe_table);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dingzi_app') THEN
      EXECUTE format('GRANT ALL ON TABLE public.%I TO dingzi_app', cafe_table);
      EXECUTE format('DROP POLICY IF EXISTS dingzi_server_access ON public.%I', cafe_table);
      EXECUTE format('CREATE POLICY dingzi_server_access ON public.%I FOR ALL TO dingzi_app USING (true) WITH CHECK (true)', cafe_table);
    END IF;
  END LOOP;
END $$;

-- Application-scoped defense-in-depth RLS helper function with immutable search_path.
CREATE OR REPLACE FUNCTION public.dingzi_branch_allowed(target_restaurant_id varchar)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT
    coalesce(pg_catalog.current_setting('app.current_role', true), '') IN ('', 'super_admin', 'public')
    OR pg_catalog.current_setting('app.current_branch_id', true) = target_restaurant_id;
$$;

-- Enforce database-level tstzrange exclusion constraint against overlapping table reservations.
DO $$
BEGIN
  PERFORM set_config('search_path', 'public, extensions', true);
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'table_reservations_no_overlap'
  ) THEN
    ALTER TABLE public.table_reservations
      ADD CONSTRAINT table_reservations_no_overlap
      EXCLUDE USING gist (
        table_id WITH =,
        tstzrange(start_at, end_at, '[)') WITH &&
      )
      WHERE (status IN ('confirmed', 'seated', 'pending_deposit'));
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pager-media', 'pager-media', false, 5242880, ARRAY['image/png','image/jpeg','image/gif','image/webp','video/mp4'])
ON CONFLICT (id) DO NOTHING;
-- No browser Storage policies: media goes through our signed, ownership-checked API.
