CREATE TABLE IF NOT EXISTS "tenants" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" varchar(120) UNIQUE,
  "owner_user_id" varchar REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "tenant_id" varchar REFERENCES "tenants"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "open_time" varchar(5) DEFAULT '08:00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "close_time" varchar(5) DEFAULT '23:00' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_restaurants_tenant" ON "restaurants" ("tenant_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_assignments" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "restaurant_id" varchar REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "tenant_id" varchar REFERENCES "tenants"("id") ON DELETE CASCADE,
  "staff_role" varchar(32) DEFAULT 'branch_manager' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "staff_assignments_role_check" CHECK ("staff_role" IN ('tenant_owner', 'branch_manager', 'host_cashier', 'kds_barista'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_staff_assignments_user" ON "staff_assignments" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_staff_assignments_restaurant" ON "staff_assignments" ("restaurant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_staff_assignments_tenant" ON "staff_assignments" ("tenant_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "branch_payment_configs" (
  "restaurant_id" varchar PRIMARY KEY REFERENCES "restaurants"("id") ON DELETE CASCADE NOT NULL,
  "skipcash_key_id" text,
  "skipcash_secret_enc" text,
  "skipcash_checkout_url" text,
  "sadad_merchant_id" text,
  "sadad_secret_enc" text,
  "sadad_checkout_url" text,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "table_reservations" DROP CONSTRAINT IF EXISTS "table_reservations_status_check";
--> statement-breakpoint
ALTER TABLE "table_reservations" ADD CONSTRAINT "table_reservations_status_check" CHECK ("status" IN ('pending_deposit', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'));
--> statement-breakpoint
ALTER TABLE "table_reservations" ADD COLUMN IF NOT EXISTS "combined_table_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "table_reservations" ADD COLUMN IF NOT EXISTS "payment_provider" varchar(32);
--> statement-breakpoint
ALTER TABLE "table_reservations" ADD COLUMN IF NOT EXISTS "payment_reference" varchar(120);
--> statement-breakpoint
ALTER TABLE "global_menu_items" ADD COLUMN IF NOT EXISTS "allergen_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "global_menu_items" ADD COLUMN IF NOT EXISTS "prep_time_mins" integer DEFAULT 10 NOT NULL;
