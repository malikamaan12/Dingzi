CREATE INDEX IF NOT EXISTS "IDX_aggregator_clicks_aggregator" ON "aggregator_clicks" ("aggregator_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_aggregator_clicks_menu_item" ON "aggregator_clicks" ("menu_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_dining_tables_zone" ON "dining_tables" ("zone_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_global_menu_items_publisher" ON "global_menu_items" ("publisher_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_guest_orders_bay" ON "guest_orders" ("bay_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_media_objects_owner" ON "media_objects" ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_menu_items_category_order" ON "menu_items" ("category_id", "order");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_pager_tickets_bay" ON "pager_tickets" ("bay_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_pager_tickets_order" ON "pager_tickets" ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_payments_recorded_by" ON "payments" ("recorded_by");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_payments_restaurant" ON "payments" ("restaurant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_table_reservations_restaurant_start" ON "table_reservations" ("restaurant_id", "start_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_table_reservations_zone" ON "table_reservations" ("zone_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_tenants_owner_user" ON "tenants" ("owner_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_waitlist_entries_zone" ON "waitlist_entries" ("zone_id");
