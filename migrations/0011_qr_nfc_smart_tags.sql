CREATE TABLE IF NOT EXISTS "smart_tags" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "restaurant_id" varchar NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "token" varchar DEFAULT gen_random_uuid() NOT NULL,
  "tag_code" varchar(40) NOT NULL,
  "label" text NOT NULL,
  "hardware_kind" varchar(24) DEFAULT 'dual_qr_nfc' NOT NULL,
  "target_type" varchar(32) DEFAULT 'venue_menu' NOT NULL,
  "table_id" varchar REFERENCES "dining_tables"("id") ON DELETE SET NULL,
  "bay_id" varchar REFERENCES "service_bays"("id") ON DELETE SET NULL,
  "active_ticket_id" varchar REFERENCES "pager_tickets"("id") ON DELETE SET NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "qr_scans" integer DEFAULT 0 NOT NULL,
  "nfc_taps" integer DEFAULT 0 NOT NULL,
  "last_scanned_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "smart_tags_hardware_kind_check" CHECK ("hardware_kind" IN ('qr_only', 'nfc_tag', 'dual_qr_nfc', 'coaster_puck')),
  CONSTRAINT "smart_tags_target_type_check" CHECK ("target_type" IN ('venue_menu', 'dining_table', 'curbside_bay', 'waitlist_join', 'reservations', 'reusable_pager'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_smart_tags_token" ON "smart_tags" ("token");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_smart_tags_restaurant_code" ON "smart_tags" ("restaurant_id", upper("tag_code"));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_smart_tags_restaurant" ON "smart_tags" ("restaurant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_smart_tags_table" ON "smart_tags" ("table_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_smart_tags_bay" ON "smart_tags" ("bay_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_smart_tags_active_ticket" ON "smart_tags" ("active_ticket_id");
