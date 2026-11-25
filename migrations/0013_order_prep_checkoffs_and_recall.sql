ALTER TABLE "pager_tickets" ADD COLUMN IF NOT EXISTS "last_coaster_id" varchar REFERENCES "smart_tags"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "pager_tickets" ADD COLUMN IF NOT EXISTS "recalled_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_pager_tickets_last_coaster" ON "pager_tickets" ("last_coaster_id");
