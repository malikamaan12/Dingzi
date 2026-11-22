ALTER TABLE "restaurants" ADD COLUMN "slug" varchar(120);--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "ordering_mode" varchar(40) DEFAULT 'browse_and_pager' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "payment_gateway" varchar(40) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "brand_accent_hex" varchar(7);--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "google_maps_review_url" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "reservations_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "waitlist_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "drive_thru_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "pager_mini_game_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "slot_interval_mins" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "default_turn_duration_mins" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "reservation_deposit_amount" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "restaurants_slug_unique" ON "restaurants" (lower("slug")) WHERE "slug" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_ordering_mode_check" CHECK ("ordering_mode" in ('browse_and_pager', 'cart_pay_at_venue', 'full_online_checkout'));--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_payment_gateway_check" CHECK ("payment_gateway" in ('none', 'skipcash', 'sadad'));--> statement-breakpoint

ALTER TABLE "categories" ADD COLUMN "is_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "available_from" varchar(5);--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "available_until" varchar(5);--> statement-breakpoint

ALTER TABLE "menu_items" ADD COLUMN "allergen_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "prep_time_mins" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "aggregator_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint

CREATE TABLE "service_bays" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "restaurant_id" varchar NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "code" varchar(40) NOT NULL,
  "label" text NOT NULL,
  "bay_type" varchar(20) DEFAULT 'curbside' NOT NULL,
  "qr_token" varchar DEFAULT gen_random_uuid() NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "service_bays_type_check" CHECK ("bay_type" in ('curbside', 'drive_thru'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "service_bays_qr_token_unique" ON "service_bays" ("qr_token");--> statement-breakpoint
CREATE UNIQUE INDEX "service_bays_cafe_code_unique" ON "service_bays" ("restaurant_id", lower(btrim("code")));--> statement-breakpoint

CREATE TABLE "guest_orders" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "restaurant_id" varchar NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "order_number" varchar(32) NOT NULL,
  "channel" varchar(24) DEFAULT 'counter_pickup' NOT NULL,
  "ordering_mode" varchar(40) NOT NULL,
  "payment_status" varchar(24) DEFAULT 'pay_at_venue' NOT NULL,
  "payment_provider" varchar(32) DEFAULT 'venue' NOT NULL,
  "payment_reference" varchar(120),
  "payment_idempotency_key" varchar(120),
  "customer_name" text,
  "customer_phone" varchar(40),
  "table_code" varchar(40),
  "bay_id" varchar REFERENCES "service_bays"("id") ON DELETE SET NULL,
  "vehicle_color" varchar(40),
  "vehicle_type" varchar(40),
  "license_plate" varchar(32),
  "notes" text,
  "currency" varchar(10) NOT NULL,
  "subtotal" numeric(10, 2) NOT NULL,
  "total" numeric(10, 2) NOT NULL,
  "line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "paid_at" timestamp,
  CONSTRAINT "guest_orders_channel_check" CHECK ("channel" in ('dine_in', 'counter_pickup', 'curbside', 'drive_thru')),
  CONSTRAINT "guest_orders_payment_status_check" CHECK ("payment_status" in ('pay_at_venue', 'pending_online', 'paid', 'failed', 'refunded'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "guest_orders_idempotency_unique" ON "guest_orders" ("payment_idempotency_key") WHERE "payment_idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "guest_orders_restaurant_created_idx" ON "guest_orders" ("restaurant_id", "created_at");--> statement-breakpoint

CREATE TABLE "pager_tickets" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tracking_token" varchar DEFAULT gen_random_uuid() NOT NULL,
  "restaurant_id" varchar NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "order_id" varchar REFERENCES "guest_orders"("id") ON DELETE SET NULL,
  "bay_id" varchar REFERENCES "service_bays"("id") ON DELETE SET NULL,
  "ticket_code" varchar(40) NOT NULL,
  "ticket_date" varchar(10) NOT NULL,
  "daily_seq" integer,
  "source" varchar(24) DEFAULT 'auto_number' NOT NULL,
  "status" varchar(24) DEFAULT 'waiting' NOT NULL,
  "customer_name" text,
  "notes" text,
  "estimated_prep_mins" integer DEFAULT 10 NOT NULL,
  "vehicle_color" varchar(40),
  "vehicle_type" varchar(40),
  "license_plate" varchar(32),
  "eta_status" varchar(24),
  "arrived_at" timestamp,
  "buzz_count" integer DEFAULT 0 NOT NULL,
  "last_buzzed_at" timestamp,
  "rating" integer,
  "feedback_comment" text,
  "queued_at" timestamp DEFAULT now() NOT NULL,
  "preparing_at" timestamp,
  "ready_at" timestamp,
  "collected_at" timestamp,
  CONSTRAINT "pager_tickets_source_check" CHECK ("source" in ('auto_number', 'pos_invoice', 'online_order', 'curbside')),
  CONSTRAINT "pager_tickets_status_check" CHECK ("status" in ('waiting', 'preparing', 'ready', 'collected', 'no_show')),
  CONSTRAINT "pager_tickets_rating_check" CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 5))
);--> statement-breakpoint
CREATE UNIQUE INDEX "pager_tickets_tracking_token_unique" ON "pager_tickets" ("tracking_token");--> statement-breakpoint
CREATE INDEX "pager_tickets_restaurant_status_idx" ON "pager_tickets" ("restaurant_id", "status", "queued_at");--> statement-breakpoint

CREATE TABLE "dining_zones" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "restaurant_id" varchar NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "name_ar" text,
  "order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "dining_zones_cafe_name_unique" ON "dining_zones" ("restaurant_id", lower(btrim("name")));--> statement-breakpoint

CREATE TABLE "dining_tables" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "restaurant_id" varchar NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "zone_id" varchar NOT NULL REFERENCES "dining_zones"("id") ON DELETE CASCADE,
  "table_code" varchar(40) NOT NULL,
  "min_covers" integer DEFAULT 1 NOT NULL,
  "max_covers" integer DEFAULT 4 NOT NULL,
  "is_combinable" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "qr_token" varchar DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "dining_tables_covers_check" CHECK ("min_covers" >= 1 AND "max_covers" >= "min_covers")
);--> statement-breakpoint
CREATE UNIQUE INDEX "dining_tables_cafe_code_unique" ON "dining_tables" ("restaurant_id", lower(btrim("table_code")));--> statement-breakpoint
CREATE UNIQUE INDEX "dining_tables_qr_token_unique" ON "dining_tables" ("qr_token");--> statement-breakpoint

CREATE TABLE "table_reservations" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tracking_token" varchar DEFAULT gen_random_uuid() NOT NULL,
  "restaurant_id" varchar NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "zone_id" varchar REFERENCES "dining_zones"("id") ON DELETE SET NULL,
  "table_id" varchar NOT NULL REFERENCES "dining_tables"("id") ON DELETE CASCADE,
  "guest_name" text NOT NULL,
  "guest_phone" varchar(40) NOT NULL,
  "party_size" integer NOT NULL,
  "start_at" timestamp with time zone NOT NULL,
  "end_at" timestamp with time zone NOT NULL,
  "status" varchar(24) DEFAULT 'confirmed' NOT NULL,
  "deposit_status" varchar(24) DEFAULT 'none' NOT NULL,
  "deposit_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "cancelled_at" timestamp,
  CONSTRAINT "table_reservations_party_check" CHECK ("party_size" >= 1 AND "party_size" <= 30),
  CONSTRAINT "table_reservations_window_check" CHECK ("end_at" > "start_at"),
  CONSTRAINT "table_reservations_status_check" CHECK ("status" in ('confirmed', 'seated', 'completed', 'cancelled', 'no_show'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "table_reservations_token_unique" ON "table_reservations" ("tracking_token");--> statement-breakpoint
CREATE INDEX "table_reservations_table_window_idx" ON "table_reservations" ("table_id", "start_at", "end_at");--> statement-breakpoint

CREATE TABLE "waitlist_entries" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tracking_token" varchar DEFAULT gen_random_uuid() NOT NULL,
  "restaurant_id" varchar NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "zone_id" varchar REFERENCES "dining_zones"("id") ON DELETE SET NULL,
  "ticket_code" varchar(24) NOT NULL,
  "guest_name" text NOT NULL,
  "guest_phone" varchar(40),
  "party_size" integer NOT NULL,
  "status" varchar(24) DEFAULT 'waiting' NOT NULL,
  "guest_response" varchar(24),
  "hold_expires_at" timestamp,
  "buzz_count" integer DEFAULT 0 NOT NULL,
  "last_buzzed_at" timestamp,
  "notes" text,
  "joined_at" timestamp DEFAULT now() NOT NULL,
  "ready_at" timestamp,
  "seated_at" timestamp,
  "closed_at" timestamp,
  CONSTRAINT "waitlist_party_check" CHECK ("party_size" >= 1 AND "party_size" <= 30),
  CONSTRAINT "waitlist_status_check" CHECK ("status" in ('waiting', 'ready', 'seated', 'released', 'expired'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_token_unique" ON "waitlist_entries" ("tracking_token");--> statement-breakpoint
CREATE INDEX "waitlist_restaurant_status_idx" ON "waitlist_entries" ("restaurant_id", "status", "joined_at");--> statement-breakpoint

CREATE TABLE "aggregator_links" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "restaurant_id" varchar NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "platform" varchar(40) NOT NULL,
  "display_name" text NOT NULL,
  "url" text NOT NULL,
  "badge_en" varchar(80),
  "badge_ar" varchar(80),
  "is_active" boolean DEFAULT true NOT NULL,
  "order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "aggregator_platform_check" CHECK ("platform" in ('talabat', 'snoonu', 'keeta', 'custom'))
);--> statement-breakpoint
CREATE INDEX "aggregator_links_restaurant_idx" ON "aggregator_links" ("restaurant_id", "order");--> statement-breakpoint

CREATE TABLE "aggregator_clicks" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "restaurant_id" varchar NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "aggregator_id" varchar REFERENCES "aggregator_links"("id") ON DELETE SET NULL,
  "platform" varchar(40) NOT NULL,
  "menu_item_id" varchar REFERENCES "menu_items"("id") ON DELETE SET NULL,
  "locale" varchar(8) DEFAULT 'en' NOT NULL,
  "clicked_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "aggregator_clicks_restaurant_idx" ON "aggregator_clicks" ("restaurant_id", "clicked_at");
