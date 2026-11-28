ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "name_ar" text;
--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "cuisine_type_ar" text;
--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "address_ar" text;
--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "opening_hours_ar" text;
--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "venue_config" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "title_ar" text;
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "menu_group" varchar(24);
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "name_ar" text;
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "description_ar" text;
--> statement-breakpoint
ALTER TABLE "menu_item_price_variants" ADD COLUMN IF NOT EXISTS "label_ar" text;
--> statement-breakpoint
ALTER TABLE "global_menu_items" ADD COLUMN IF NOT EXISTS "category_title_ar" text;
--> statement-breakpoint
ALTER TABLE "global_menu_items" ADD COLUMN IF NOT EXISTS "name_ar" text;
--> statement-breakpoint
ALTER TABLE "global_menu_items" ADD COLUMN IF NOT EXISTS "description_ar" text;
