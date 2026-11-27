ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "status" varchar(24) DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tenants" DROP CONSTRAINT IF EXISTS "tenants_status_check";
--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_status_check" CHECK ("status" IN ('active', 'suspended'));
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "max_branches" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "tenants" DROP CONSTRAINT IF EXISTS "tenants_max_branches_check";
--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_max_branches_check" CHECK ("max_branches" >= 1 AND "max_branches" <= 200);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "restaurants_one_owner";
--> statement-breakpoint
ALTER TABLE "restaurants" DROP CONSTRAINT IF EXISTS "restaurants_one_owner";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_restaurants_user" ON "restaurants" ("user_id");
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tenant_id" varchar REFERENCES "tenants"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_users_tenant" ON "users" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD COLUMN IF NOT EXISTS "pin_tenant_id" varchar REFERENCES "tenants"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD COLUMN IF NOT EXISTS "capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD COLUMN IF NOT EXISTS "pin_hash" text;
--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD COLUMN IF NOT EXISTS "pin_lookup_hash" varchar(64);
--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_staff_assignments_pin_tenant" ON "staff_assignments" ("pin_tenant_id");
--> statement-breakpoint
UPDATE "staff_assignments" sa
SET "is_active" = false
WHERE sa."is_active" = true
  AND sa."restaurant_id" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "staff_assignments" newer
    WHERE newer."is_active" = true
      AND newer."user_id" = sa."user_id"
      AND newer."restaurant_id" = sa."restaurant_id"
      AND (newer."created_at" > sa."created_at" OR (newer."created_at" = sa."created_at" AND newer."id" > sa."id"))
  );
--> statement-breakpoint
UPDATE "staff_assignments" sa
SET "is_active" = false
WHERE sa."is_active" = true
  AND sa."tenant_id" IS NOT NULL
  AND sa."restaurant_id" IS NULL
  AND EXISTS (
    SELECT 1 FROM "staff_assignments" newer
    WHERE newer."is_active" = true
      AND newer."user_id" = sa."user_id"
      AND newer."tenant_id" = sa."tenant_id"
      AND newer."restaurant_id" IS NULL
      AND (newer."created_at" > sa."created_at" OR (newer."created_at" = sa."created_at" AND newer."id" > sa."id"))
  );
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_staff_assignments_active_branch" ON "staff_assignments" ("user_id", "restaurant_id") WHERE "is_active" = true AND "restaurant_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_staff_assignments_active_tenant" ON "staff_assignments" ("user_id", "tenant_id") WHERE "is_active" = true AND "tenant_id" IS NOT NULL AND "restaurant_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_staff_assignments_active_pin" ON "staff_assignments" ("pin_tenant_id", "pin_lookup_hash") WHERE "is_active" = true AND "pin_lookup_hash" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "access_audit" ADD COLUMN IF NOT EXISTS "tenant_id" varchar REFERENCES "tenants"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_access_audit_tenant_created" ON "access_audit" ("tenant_id", "created_at" DESC);
--> statement-breakpoint
INSERT INTO "tenants" ("name", "slug", "owner_user_id", "status", "max_branches")
SELECT r."name", 'org-' || substring(r."id", 1, 12), r."user_id", 'active', 1
FROM "restaurants" r
WHERE r."tenant_id" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "tenants" t WHERE t."owner_user_id" = r."user_id");
--> statement-breakpoint
UPDATE "restaurants" r
SET "tenant_id" = t."id"
FROM "tenants" t
WHERE r."tenant_id" IS NULL AND t."owner_user_id" = r."user_id";
--> statement-breakpoint
UPDATE "tenants" t
SET "max_branches" = GREATEST(t."max_branches", sub.cnt)
FROM (
  SELECT "tenant_id", count(*)::int AS cnt
  FROM "restaurants"
  WHERE "tenant_id" IS NOT NULL
  GROUP BY "tenant_id"
) sub
WHERE t."id" = sub."tenant_id" AND t."max_branches" < sub.cnt;
--> statement-breakpoint
UPDATE "users" u
SET "tenant_id" = t."id"
FROM "tenants" t
WHERE u."role" = 'admin' AND u."tenant_id" IS NULL AND t."owner_user_id" = u."id";
--> statement-breakpoint
UPDATE "users" u
SET "tenant_id" = COALESCE(sa."tenant_id", r."tenant_id")
FROM "staff_assignments" sa
LEFT JOIN "restaurants" r ON r."id" = sa."restaurant_id"
WHERE u."role" = 'admin'
  AND u."tenant_id" IS NULL
  AND sa."user_id" = u."id"
  AND sa."is_active" = true
  AND COALESCE(sa."tenant_id", r."tenant_id") IS NOT NULL;
--> statement-breakpoint
INSERT INTO "staff_assignments" ("user_id", "tenant_id", "pin_tenant_id", "staff_role", "is_active")
SELECT t."owner_user_id", t."id", t."id", 'tenant_owner', true
FROM "tenants" t
JOIN "users" u ON u."id" = t."owner_user_id"
WHERE t."owner_user_id" IS NOT NULL
  AND u."role" = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM "staff_assignments" sa
    WHERE sa."user_id" = t."owner_user_id"
      AND sa."tenant_id" = t."id"
      AND sa."restaurant_id" IS NULL
      AND sa."is_active" = true
  );
--> statement-breakpoint
UPDATE "staff_assignments" sa
SET "pin_tenant_id" = COALESCE(sa."tenant_id", r."tenant_id")
FROM "restaurants" r
WHERE sa."pin_tenant_id" IS NULL
  AND (sa."tenant_id" IS NOT NULL OR sa."restaurant_id" = r."id");
