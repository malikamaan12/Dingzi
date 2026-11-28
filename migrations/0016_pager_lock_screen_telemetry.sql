ALTER TABLE "pager_tickets" ADD COLUMN IF NOT EXISTS "device_claimed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "pager_tickets" ADD COLUMN IF NOT EXISTS "acknowledged_at" timestamp;
--> statement-breakpoint
ALTER TABLE "pager_tickets" ADD COLUMN IF NOT EXISTS "push_armed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "device_claimed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "acknowledged_at" timestamp;
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "push_armed" boolean DEFAULT false NOT NULL;
