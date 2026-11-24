CREATE TABLE "platform_settings" (
  "key" varchar(80) PRIMARY KEY NOT NULL,
  "value" jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "push_subscriptions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope" varchar(80) NOT NULL,
  "restaurant_id" varchar NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "platform" varchar(24) DEFAULT 'web_push' NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh" text,
  "auth" text,
  "native_token" text,
  "user_agent" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "last_delivered_at" timestamp,
  CONSTRAINT "push_subscriptions_platform_check" CHECK ("platform" in ('web_push', 'android_fcm', 'ios_apns'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_scope_endpoint_unique" ON "push_subscriptions" ("scope", "endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_scope_idx" ON "push_subscriptions" ("scope");--> statement-breakpoint
CREATE INDEX "push_subscriptions_restaurant_idx" ON "push_subscriptions" ("restaurant_id");
