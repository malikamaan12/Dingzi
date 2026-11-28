CREATE TABLE IF NOT EXISTS "table_service_requests" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "restaurant_id" varchar NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "table_code" varchar(40) NOT NULL,
  "request_type" varchar(32) DEFAULT 'call_server' NOT NULL,
  "note" text,
  "status" varchar(24) DEFAULT 'open' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "table_service_requests_restaurant_status_idx" ON "table_service_requests" ("restaurant_id", "status");
