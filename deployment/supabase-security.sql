-- These tables are accessed only by the trusted server connection.
-- Anonymous and browser-authenticated Supabase clients get no direct access.
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
DECLARE cafe_table text;
BEGIN
  FOREACH cafe_table IN ARRAY ARRAY[
    'users','restaurants','categories','menu_items','menu_item_price_variants',
    'global_menu_items','payments','access_audit','sessions','media_objects','rate_limit_buckets',
    'service_bays','guest_orders','pager_tickets','dining_zones','dining_tables',
    'table_reservations','waitlist_entries','aggregator_links','aggregator_clicks',
    'platform_settings','push_subscriptions'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', cafe_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', cafe_table);
  END LOOP;
END $$;

-- Enforce database-level tstzrange exclusion constraint against overlapping table reservations in PostgreSQL 16.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'table_reservations_no_overlap'
  ) THEN
    ALTER TABLE public.table_reservations
      ADD CONSTRAINT table_reservations_no_overlap
      EXCLUDE USING gist (
        table_id WITH =,
        tstzrange(start_at, end_at, '[)') WITH &&
      )
      WHERE (status IN ('confirmed', 'seated'));
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pager-media', 'pager-media', false, 5242880, ARRAY['image/png','image/jpeg','image/gif','image/webp','video/mp4'])
ON CONFLICT (id) DO NOTHING;
-- No browser Storage policies: media goes through our signed, ownership-checked API.
