ALTER TABLE "staff_assignments" DROP CONSTRAINT IF EXISTS "staff_assignments_role_check";
--> statement-breakpoint
UPDATE "staff_assignments" SET "staff_role" = 'prep_barista' WHERE "staff_role" = 'kds_barista';
--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_role_check" CHECK ("staff_role" IN ('tenant_owner', 'branch_manager', 'host_cashier', 'prep_barista'));
