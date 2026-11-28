import { sql, relations } from "drizzle-orm";
import {
  index,
  uniqueIndex,
  check,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  boolean,
  decimal,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type { ResolvedStaffCapabilities, StaffCapabilityOverrides } from "./rbac";
import {
  CATEGORY_MENU_GROUPS,
  SUPPORTED_CURRENCIES,
  venueConfigSchema,
  type VenueConfig,
} from "./venueConfig";

// Database-backed staff sessions.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  password: varchar("password").notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("admin"), // "admin" or "super_admin"
  tenantId: varchar("tenant_id"),
  accountStatus: varchar("account_status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, table => [
  uniqueIndex('users_email_case_unique').on(sql`lower(${table.email})`),
  index('IDX_users_tenant').on(table.tenantId),
  check('users_management_role', sql`${table.role} in ('admin','super_admin')`),
  check('users_account_status', sql`${table.accountStatus} in ('active','frozen','deleted')`),
]);

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export const mediaObjects = pgTable('media_objects', {
  id: varchar('id').primaryKey(),
  ownerId: varchar('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const rateLimitBuckets = pgTable('rate_limit_buckets', {
  id: varchar('id').primaryKey(),
  count: integer('count').notNull(),
  resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
}, table => [index('rate_limit_buckets_expiry').on(table.resetAt)]);

// Login schema for authentication
export const emailSchema = z.string().trim().toLowerCase().max(254).email('Invalid email address');
export const passwordSchema = z.string().min(10, 'Use at least 10 characters').max(72).refine(v => new TextEncoder().encode(v).length <= 72, 'Password must be at most 72 UTF-8 bytes');
export const registrationSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  restaurantName: z.string().trim().min(1).max(150),
}).strict();
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(72).refine(v => new TextEncoder().encode(v).length <= 72, 'Password is too long'),
}).strict();

export const pinLoginSchema = z.object({
  venueCode: z.string().trim().min(1, 'Enter your venue slug or ID').max(120),
  pin: z.string().trim().regex(/^\d{6}$/, 'Enter your 6-digit station PIN'),
}).strict();

export type LoginCredentials = z.infer<typeof loginSchema>;
export type PinLoginCredentials = z.infer<typeof pinLoginSchema>;

export const orderingModes = ['browse_and_pager', 'cart_pay_at_venue', 'full_online_checkout'] as const;
export type OrderingMode = (typeof orderingModes)[number];
export const paymentGateways = ['none', 'skipcash', 'sadad'] as const;
export type PaymentGateway = (typeof paymentGateways)[number];
export const staffRoles = ['tenant_owner', 'branch_manager', 'host_cashier', 'prep_barista'] as const;
export type StaffRole = (typeof staffRoles)[number];
export type EffectiveStaffRole = 'super_admin' | StaffRole;

// Multi-Branch Tenant Brand Groups (PRD §2 & §3)
export const tenants = pgTable("tenants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 120 }).unique(),
  ownerUserId: varchar("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  status: varchar("status", { length: 24 }).notNull().default("active"),
  maxBranches: integer("max_branches").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, table => [
  check("tenants_status_check", sql`${table.status} in ('active', 'suspended')`),
  check("tenants_max_branches_check", sql`${table.maxBranches} >= 1 and ${table.maxBranches} <= 200`),
]);
export type Tenant = typeof tenants.$inferSelect;

// Restaurants / Branches table
export const restaurants = pgTable("restaurants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  slug: varchar("slug", { length: 120 }),
  theme: text("theme").notNull().default("e3"),
  brandAccentHex: varchar("brand_accent_hex", { length: 7 }),
  currency: varchar("currency").notNull().default("QAR"),
  timezone: text("timezone").notNull().default("Asia/Qatar"),
  logoUrl: text("logo_url"),
  coverMediaUrl: text("cover_media_url"),
  coverMediaType: varchar("cover_media_type"),
  cuisineType: text("cuisine_type"),
  cuisineTypeAr: text("cuisine_type_ar"),
  address: text("address"),
  addressAr: text("address_ar"),
  phone: varchar("phone"),
  openingHours: text("opening_hours"),
  openingHoursAr: text("opening_hours_ar"),
  openTime: varchar("open_time", { length: 5 }).notNull().default("08:00"),
  closeTime: varchar("close_time", { length: 5 }).notNull().default("23:00"),
  venueConfig: jsonb("venue_config").$type<VenueConfig>().notNull().default(sql`'{}'::jsonb`),
  qrCodeUrl: text("qr_code_url"),
  status: varchar("status").notNull().default("active"),
  hidden: boolean("hidden").notNull().default(false),
  upiId: text("upi_id"),
  upiQrCodeUrl: text("upi_qr_code_url"),

  // Hospitality Operating Platform v1 configuration
  orderingMode: varchar("ordering_mode", { length: 40 }).notNull().default("browse_and_pager"),
  paymentGateway: varchar("payment_gateway", { length: 40 }).notNull().default("none"),
  googleMapsReviewUrl: text("google_maps_review_url"),
  reservationsEnabled: boolean("reservations_enabled").notNull().default(true),
  waitlistEnabled: boolean("waitlist_enabled").notNull().default(true),
  driveThruEnabled: boolean("drive_thru_enabled").notNull().default(false),
  pagerMiniGameEnabled: boolean("pager_mini_game_enabled").notNull().default(true),
  slotIntervalMins: integer("slot_interval_mins").notNull().default(30),
  defaultTurnDurationMins: integer("default_turn_duration_mins").notNull().default(90),
  reservationDepositAmount: decimal("reservation_deposit_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  version: integer("version").notNull().default(1),

  // Legacy billing fields retained for database compatibility
  activeSince: timestamp("active_since").defaultNow(),
  subscriptionStatus: varchar("subscription_status").notNull().default("trial"),
  subscriptionPlan: varchar("subscription_plan").default("monthly"),
  monthlyFee: decimal("monthly_fee", { precision: 10, scale: 2 }).default("999"),
  lastPaymentDate: timestamp("last_payment_date"),
  nextPaymentDue: timestamp("next_payment_due"),
  suspensionReason: text("suspension_reason"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, table => [
  index('IDX_restaurants_user').on(table.userId),
  index('IDX_restaurants_tenant').on(table.tenantId),
  check('restaurants_status', sql`${table.status} in ('active','suspended','pending')`),
]);

export const restaurantsRelations = relations(restaurants, ({ one, many }) => ({
  user: one(users, {
    fields: [restaurants.userId],
    references: [users.id],
  }),
  categories: many(categories),
}));

export const insertRestaurantSchema = createInsertSchema(restaurants)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    qrCodeUrl: true,
  })
  .extend({
    venueConfig: venueConfigSchema.optional(),
  });

export type InsertRestaurant = z.infer<typeof insertRestaurantSchema>;
export type Restaurant = typeof restaurants.$inferSelect;

const moneySchema = z.string().or(z.number()).refine(
  v => /^\d+(?:\.\d{1,2})?$/.test(String(v)) && Number(v) <= 99999999.99,
  'Use a non-negative price with at most two decimal places',
);
const discountSchema = z.string().or(z.number()).refine(
  v => /^\d+(?:\.\d{1,2})?$/.test(String(v)) && Number(v) <= 100,
  'Discount must be between 0 and 100, with at most two decimal places',
);

export const cafeProfileSchema = insertRestaurantSchema.pick({
  name: true,
  nameAr: true,
  slug: true,
  theme: true,
  brandAccentHex: true,
  currency: true,
  timezone: true,
  logoUrl: true,
  coverMediaUrl: true,
  coverMediaType: true,
  cuisineType: true,
  cuisineTypeAr: true,
  address: true,
  addressAr: true,
  phone: true,
  openingHours: true,
  openingHoursAr: true,
  openTime: true,
  closeTime: true,
  venueConfig: true,
  orderingMode: true,
  paymentGateway: true,
  googleMapsReviewUrl: true,
  reservationsEnabled: true,
  waitlistEnabled: true,
  driveThruEnabled: true,
  pagerMiniGameEnabled: true,
  slotIntervalMins: true,
  defaultTurnDurationMins: true,
  reservationDepositAmount: true,
}).extend({
  name: z.string().trim().min(1).max(150),
  nameAr: z.string().trim().max(150).nullable().optional(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must use lowercase letters, numbers, and hyphens').max(120).nullable().optional(),
  theme: z.enum(['dingzi', 'e3', 'forest', 'terracotta', 'ocean', 'plum']).optional(),
  brandAccentHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex color like #6236FF').nullable().optional(),
  currency: z.enum(SUPPORTED_CURRENCIES).optional(),
  timezone: z.string().max(100).refine(v => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; } }).optional(),
  coverMediaType: z.enum(['image', 'video', 'gif']).nullable().optional(),
  cuisineType: z.string().trim().max(250).nullable().optional(),
  cuisineTypeAr: z.string().trim().max(250).nullable().optional(),
  address: z.string().trim().max(1000).nullable().optional(),
  addressAr: z.string().trim().max(1000).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  openingHours: z.string().trim().max(250).nullable().optional(),
  openingHoursAr: z.string().trim().max(250).nullable().optional(),
  openTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM format').optional(),
  closeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM format').optional(),
  venueConfig: venueConfigSchema.optional(),
  orderingMode: z.enum(orderingModes).optional(),
  paymentGateway: z.enum(paymentGateways).optional(),
  googleMapsReviewUrl: z.string().trim().url('Enter a valid URL').max(500).or(z.literal('')).nullable().optional().transform(v => v === '' ? null : v),
  reservationsEnabled: z.boolean().optional(),
  waitlistEnabled: z.boolean().optional(),
  driveThruEnabled: z.boolean().optional(),
  pagerMiniGameEnabled: z.boolean().optional(),
  slotIntervalMins: z.number().int().min(10).max(180).optional(),
  defaultTurnDurationMins: z.number().int().min(15).max(360).optional(),
  reservationDepositAmount: moneySchema.transform(String).optional(),
}).strict();

export const staffAssignments = pgTable("staff_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  restaurantId: varchar("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  pinTenantId: varchar("pin_tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  staffRole: varchar("staff_role", { length: 32 }).notNull().default("branch_manager"),
  capabilities: jsonb("capabilities").$type<StaffCapabilityOverrides>().notNull().default(sql`'{}'::jsonb`),
  pinHash: text("pin_hash"),
  pinLookupHash: varchar("pin_lookup_hash", { length: 64 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, table => [
  check("staff_assignments_role_check", sql`${table.staffRole} in ('tenant_owner', 'branch_manager', 'host_cashier', 'prep_barista')`),
]);
export type StaffAssignment = typeof staffAssignments.$inferSelect;

export const branchPaymentConfigs = pgTable("branch_payment_configs", {
  restaurantId: varchar("restaurant_id").primaryKey().references(() => restaurants.id, { onDelete: "cascade" }),
  skipcashKeyId: text("skipcash_key_id"),
  skipcashSecretEnc: text("skipcash_secret_enc"),
  skipcashCheckoutUrl: text("skipcash_checkout_url"),
  sadadMerchantId: text("sadad_merchant_id"),
  sadadSecretEnc: text("sadad_secret_enc"),
  sadadCheckoutUrl: text("sadad_checkout_url"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type BranchPaymentConfig = typeof branchPaymentConfigs.$inferSelect;

export type CafeAccessContext = Pick<Restaurant, 'id' | 'name' | 'theme'> & {
  owner: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'> | null;
};
export interface AccessibleBranchSummary {
  id: string;
  name: string;
  slug: string | null;
  tenantId: string | null;
}
export type AuthUser = Omit<User, 'password'> & {
  cafeContext: CafeAccessContext | null;
  staffRole?: EffectiveStaffRole;
  capabilities?: ResolvedStaffCapabilities;
  tenantContext?: Pick<Tenant, 'id' | 'name' | 'slug' | 'status' | 'maxBranches'> | null;
  accessibleBranches?: AccessibleBranchSummary[];
};

export const accessAudit = pgTable('access_audit', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  actorId: varchar('actor_id').notNull(),
  actorEmail: text('actor_email').notNull(),
  actorRole: varchar('actor_role').notNull(),
  tenantId: varchar('tenant_id'),
  cafeId: varchar('cafe_id'),
  cafeName: text('cafe_name'),
  action: text('action').notNull(),
  status: integer('status').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, table => [
  index('access_audit_recent').on(table.createdAt),
  index('IDX_access_audit_tenant_created').on(table.tenantId, table.createdAt),
]);
export type AccessAudit = typeof accessAudit.$inferSelect;

// Categories table
export const categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  titleAr: text("title_ar"),
  menuGroup: varchar("menu_group", { length: 24 }),
  isVisible: boolean("is_visible").notNull().default(true),
  availableFrom: varchar("available_from", { length: 5 }),
  availableUntil: varchar("available_until", { length: 5 }),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, table => [uniqueIndex('categories_cafe_name_unique').on(table.restaurantId, sql`lower(btrim(${table.title}))`)]);

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [categories.restaurantId],
    references: [restaurants.id],
  }),
  menuItems: many(menuItems),
}));

const hhmmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM format').nullable().optional();

export const insertCategorySchema = createInsertSchema(categories).omit({
  id: true,
  createdAt: true,
}).extend({
  title: z.string().trim().min(1).max(100),
  titleAr: z.string().trim().max(100).nullable().optional(),
  menuGroup: z.enum(CATEGORY_MENU_GROUPS).nullable().optional(),
  isVisible: z.boolean().optional(),
  availableFrom: hhmmSchema,
  availableUntil: hhmmSchema,
  order: z.number().int().min(0).optional(),
});

export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;

const arabicOptionLabel = z.string().trim().max(80).optional();
export const menuModifierOptionSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  labelAr: arabicOptionLabel,
  price: moneySchema.transform(String),
  isAvailable: z.boolean().default(true),
}).strict();
export const menuModifierGroupSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(80),
  titleAr: arabicOptionLabel,
  selection: z.enum(['single', 'multiple']),
  minSelections: z.number().int().min(0).max(20),
  maxSelections: z.number().int().min(1).max(20),
  options: z.array(menuModifierOptionSchema).min(1).max(20),
}).strict().superRefine((group, context) => {
  if (group.maxSelections < group.minSelections || group.maxSelections > group.options.length)
    context.addIssue({ code: 'custom', message: 'Selection limits must fit the number of options', path: ['maxSelections'] });
  if (group.selection === 'single' && (group.maxSelections !== 1 || group.minSelections > 1))
    context.addIssue({ code: 'custom', message: 'A single-choice group allows at most one option', path: ['maxSelections'] });
  if (
    new Set(group.options.map(option => option.id)).size !== group.options.length ||
    new Set(group.options.map(option => option.label.toLowerCase())).size !== group.options.length
  )
    context.addIssue({ code: 'custom', message: 'Give every option a unique name and identifier', path: ['options'] });
});
export const menuModifierGroupsSchema = z.array(menuModifierGroupSchema).max(8).superRefine((groups, context) => {
  if (
    new Set(groups.map(group => group.id)).size !== groups.length ||
    new Set(groups.map(group => group.title.toLowerCase())).size !== groups.length
  )
    context.addIssue({ code: 'custom', message: 'Give every option group a unique name and identifier' });
  const optionIds = groups.flatMap(group => group.options.map(option => option.id));
  if (new Set(optionIds).size !== optionIds.length)
    context.addIssue({ code: 'custom', message: 'Every choice must have a unique identifier within the item' });
});
export type MenuModifierOption = z.infer<typeof menuModifierOptionSchema>;
export type MenuModifierGroup = z.infer<typeof menuModifierGroupSchema>;

// Menu Items table
export const menuItems = pgTable("menu_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  categoryId: varchar("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  description: text("description"),
  descriptionAr: text("description_ar"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 5, scale: 2 }).default("0"),
  unit: text("unit").notNull().default("plate"),
  imageUrl: text("image_url"),
  isAvailable: boolean("is_available").notNull().default(true),
  specialDate: varchar("special_date"),
  hasMultiplePricing: boolean("has_multiple_pricing").notNull().default(false),
  modifierGroups: jsonb('modifier_groups').$type<MenuModifierGroup[]>().notNull().default(sql`'[]'::jsonb`),
  tags: text("tags").array().default(sql`ARRAY[]::text[]`),
  allergenTags: text("allergen_tags").array().notNull().default(sql`ARRAY[]::text[]`),
  prepTimeMins: integer("prep_time_mins").notNull().default(10),
  aggregatorOverrides: jsonb("aggregator_overrides").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, table => [
  check('menu_price_valid', sql`${table.price} >= 0`),
  check('menu_discount_valid', sql`${table.discount} between 0 and 100`),
  check('menu_modifier_groups_array', sql`jsonb_typeof(${table.modifierGroups}) = 'array' and jsonb_array_length(${table.modifierGroups}) <= 8`),
]);

export const menuItemsRelations = relations(menuItems, ({ one, many }) => ({
  category: one(categories, {
    fields: [menuItems.categoryId],
    references: [categories.id],
  }),
  priceVariants: many(menuItemPriceVariants),
}));

// Menu Item Price Variants table (up to 3 variants enforced)
export const menuItemPriceVariants = pgTable("menu_item_price_variants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  menuItemId: varchar("menu_item_id").notNull().references(() => menuItems.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  labelAr: text("label_ar"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 5, scale: 2 }).default("0"),
  unit: text("unit").notNull(),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, table => [
  check('option_price_valid', sql`${table.price} >= 0`),
  check('option_discount_valid', sql`${table.discount} between 0 and 100`),
  uniqueIndex('option_item_label_unique').on(table.menuItemId, sql`lower(btrim(${table.label}))`),
]);

export const menuItemPriceVariantsRelations = relations(menuItemPriceVariants, ({ one }) => ({
  menuItem: one(menuItems, {
    fields: [menuItemPriceVariants.menuItemId],
    references: [menuItems.id],
  }),
}));

export const insertMenuItemSchema = createInsertSchema(menuItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().trim().min(1).max(150),
  nameAr: z.string().trim().max(150).nullable().optional(),
  categoryId: z.string().uuid(),
  description: z.string().trim().max(2000).nullable().optional(),
  descriptionAr: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).refine(v => new Set(v.map(t => t.toLowerCase())).size === v.length, 'Tags must be unique').nullable().optional(),
  allergenTags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  prepTimeMins: z.number().int().min(1).max(180).optional(),
  aggregatorOverrides: z.record(z.string().max(40), z.string().url().max(500)).optional(),
  order: z.number().int().min(0).optional(),
  price: moneySchema,
  unit: z.string().trim().min(1).max(30).optional(),
  discount: discountSchema.optional(),
  modifierGroups: menuModifierGroupsSchema.optional(),
  specialDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Invalid date').nullable().optional(),
}).strict();

export type InsertMenuItem = z.infer<typeof insertMenuItemSchema>;
export type MenuItem = typeof menuItems.$inferSelect;

export const insertPriceVariantSchema = createInsertSchema(menuItemPriceVariants).omit({
  id: true,
  createdAt: true,
}).extend({
  menuItemId: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  labelAr: z.string().trim().max(80).nullable().optional(),
  price: moneySchema,
  unit: z.string().trim().min(1).max(30),
  discount: discountSchema.optional(),
  order: z.number().int().min(0).optional(),
}).strict();

export type InsertPriceVariant = z.infer<typeof insertPriceVariantSchema>;
export type PriceVariant = typeof menuItemPriceVariants.$inferSelect;

export type LibraryPriceVariant = { label: string; labelAr?: string | null; price: string; unit: string };

export const globalMenuItems = pgTable("global_menu_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceItemId: varchar("source_item_id").unique().references(() => menuItems.id, { onDelete: "set null" }),
  publisherId: varchar("publisher_id").references(() => users.id, { onDelete: "set null" }),
  sourceCafe: text("source_cafe").notNull(),
  currency: varchar("currency").notNull(),
  categoryTitle: text("category_title").notNull(),
  categoryTitleAr: text("category_title_ar"),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  description: text("description"),
  descriptionAr: text("description_ar"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  unit: text("unit").notNull(),
  imageUrl: text("image_url"),
  sourceImageUrl: text("source_image_url"),
  tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
  allergenTags: text("allergen_tags").array().notNull().default(sql`ARRAY[]::text[]`),
  prepTimeMins: integer("prep_time_mins").notNull().default(10),
  variants: jsonb("variants").$type<LibraryPriceVariant[]>().notNull().default(sql`'[]'::jsonb`),
  modifierGroups: jsonb('modifier_groups').$type<MenuModifierGroup[]>().notNull().default(sql`'[]'::jsonb`),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type GlobalMenuItem = typeof globalMenuItems.$inferSelect;

export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentDate: timestamp("payment_date").notNull().defaultNow(),
  paymentMethod: varchar("payment_method").notNull(),
  transactionId: varchar("transaction_id"),
  requestKey: varchar('request_key').unique(),
  status: varchar("status").notNull().default("completed"),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  notes: text("notes"),
  recordedBy: varchar("recorded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const paymentsRelations = relations(payments, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [payments.restaurantId],
    references: [restaurants.id],
  }),
  recordedByUser: one(users, {
    fields: [payments.recordedBy],
    references: [users.id],
  }),
}));

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
}).extend({
  amount: z.string().or(z.number()),
});

export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

// ===== HOSPITALITY OPERATING PLATFORM TABLES (PILLARS 2-5) =====

// Pillar 4: Drive-Thru Lanes & Curbside Parking Bays
export const serviceBays = pgTable("service_bays", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 40 }).notNull(),
  label: text("label").notNull(),
  bayType: varchar("bay_type", { length: 20 }).notNull().default("curbside"), // 'curbside' | 'drive_thru'
  qrToken: varchar("qr_token").notNull().default(sql`gen_random_uuid()`),
  isActive: boolean("is_active").notNull().default(true),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type ServiceBay = typeof serviceBays.$inferSelect;

export interface OrderLineItem {
  menuItemId: string;
  name: string;
  quantity: number;
  variantId?: string | null;
  variantLabel?: string | null;
  modifiers: { id: string; label: string; labelAr?: string; price: string }[];
  unitTotal: string;
  lineTotal: string;
  notes?: string;
  prepared?: boolean;
  preparedAt?: string | null;
}

// Pillar 1: Guest Orders (Pay at Venue & Online SkipCash/Sadad Checkout)
export const guestOrders = pgTable("guest_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  orderNumber: varchar("order_number", { length: 32 }).notNull(),
  channel: varchar("channel", { length: 24 }).notNull().default("counter_pickup"),
  orderingMode: varchar("ordering_mode", { length: 40 }).notNull(),
  paymentStatus: varchar("payment_status", { length: 24 }).notNull().default("pay_at_venue"),
  paymentProvider: varchar("payment_provider", { length: 32 }).notNull().default("venue"),
  paymentReference: varchar("payment_reference", { length: 120 }),
  paymentIdempotencyKey: varchar("payment_idempotency_key", { length: 120 }),
  customerName: text("customer_name"),
  customerPhone: varchar("customer_phone", { length: 40 }),
  tableCode: varchar("table_code", { length: 40 }),
  bayId: varchar("bay_id").references(() => serviceBays.id, { onDelete: "set null" }),
  vehicleColor: varchar("vehicle_color", { length: 40 }),
  vehicleType: varchar("vehicle_type", { length: 40 }),
  licensePlate: varchar("license_plate", { length: 32 }),
  notes: text("notes"),
  currency: varchar("currency", { length: 10 }).notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  lineItems: jsonb("line_items").$type<OrderLineItem[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  paidAt: timestamp("paid_at"),
});
export type GuestOrder = typeof guestOrders.$inferSelect;

// Pillar 2: Hardware-Free Virtual Pager Tickets
export const pagerTickets = pgTable("pager_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trackingToken: varchar("tracking_token").notNull().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  orderId: varchar("order_id").references(() => guestOrders.id, { onDelete: "set null" }),
  bayId: varchar("bay_id").references(() => serviceBays.id, { onDelete: "set null" }),
  ticketCode: varchar("ticket_code", { length: 40 }).notNull(),
  ticketDate: varchar("ticket_date", { length: 10 }).notNull(),
  dailySeq: integer("daily_seq"),
  source: varchar("source", { length: 24 }).notNull().default("auto_number"),
  status: varchar("status", { length: 24 }).notNull().default("waiting"),
  customerName: text("customer_name"),
  notes: text("notes"),
  estimatedPrepMins: integer("estimated_prep_mins").notNull().default(10),
  vehicleColor: varchar("vehicle_color", { length: 40 }),
  vehicleType: varchar("vehicle_type", { length: 40 }),
  licensePlate: varchar("license_plate", { length: 32 }),
  etaStatus: varchar("eta_status", { length: 24 }),
  arrivedAt: timestamp("arrived_at"),
  buzzCount: integer("buzz_count").notNull().default(0),
  lastBuzzedAt: timestamp("last_buzzed_at"),
  deviceClaimedAt: timestamp("device_claimed_at"),
  acknowledgedAt: timestamp("acknowledged_at"),
  pushArmed: boolean("push_armed").notNull().default(false),
  lastCoasterId: varchar("last_coaster_id"),
  recalledCount: integer("recalled_count").notNull().default(0),
  rating: integer("rating"),
  feedbackComment: text("feedback_comment"),
  queuedAt: timestamp("queued_at").notNull().defaultNow(),
  preparingAt: timestamp("preparing_at"),
  readyAt: timestamp("ready_at"),
  collectedAt: timestamp("collected_at"),
});
export type PagerTicket = typeof pagerTickets.$inferSelect;

// Pillar 3: Floor Dining Zones, Tables, Reservations & Walk-In Waitlist
export const diningZones = pgTable("dining_zones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type DiningZone = typeof diningZones.$inferSelect;

export const diningTables = pgTable("dining_tables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  zoneId: varchar("zone_id").notNull().references(() => diningZones.id, { onDelete: "cascade" }),
  tableCode: varchar("table_code", { length: 40 }).notNull(),
  minCovers: integer("min_covers").notNull().default(1),
  maxCovers: integer("max_covers").notNull().default(4),
  isCombinable: boolean("is_combinable").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  qrToken: varchar("qr_token").notNull().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type DiningTable = typeof diningTables.$inferSelect;

export const tableReservations = pgTable("table_reservations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trackingToken: varchar("tracking_token").notNull().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  zoneId: varchar("zone_id").references(() => diningZones.id, { onDelete: "set null" }),
  tableId: varchar("table_id").notNull().references(() => diningTables.id, { onDelete: "cascade" }),
  combinedTableIds: jsonb("combined_table_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  guestName: text("guest_name").notNull(),
  guestPhone: varchar("guest_phone", { length: 40 }).notNull(),
  partySize: integer("party_size").notNull(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("confirmed"),
  depositStatus: varchar("deposit_status", { length: 24 }).notNull().default("none"),
  depositAmount: decimal("deposit_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  paymentProvider: varchar("payment_provider", { length: 32 }),
  paymentReference: varchar("payment_reference", { length: 120 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  cancelledAt: timestamp("cancelled_at"),
});
export type TableReservation = typeof tableReservations.$inferSelect;

export const waitlistEntries = pgTable("waitlist_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trackingToken: varchar("tracking_token").notNull().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  zoneId: varchar("zone_id").references(() => diningZones.id, { onDelete: "set null" }),
  ticketCode: varchar("ticket_code", { length: 24 }).notNull(),
  guestName: text("guest_name").notNull(),
  guestPhone: varchar("guest_phone", { length: 40 }),
  partySize: integer("party_size").notNull(),
  status: varchar("status", { length: 24 }).notNull().default("waiting"),
  guestResponse: varchar("guest_response", { length: 24 }),
  holdExpiresAt: timestamp("hold_expires_at"),
  buzzCount: integer("buzz_count").notNull().default(0),
  lastBuzzedAt: timestamp("last_buzzed_at"),
  deviceClaimedAt: timestamp("device_claimed_at"),
  acknowledgedAt: timestamp("acknowledged_at"),
  pushArmed: boolean("push_armed").notNull().default(false),
  notes: text("notes"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  readyAt: timestamp("ready_at"),
  seatedAt: timestamp("seated_at"),
  closedAt: timestamp("closed_at"),
});
export type WaitlistEntry = typeof waitlistEntries.$inferSelect;

// Pillar 5: Aggregator Delivery Storefront Handoff & Zero-PII Click Telemetry
export const aggregatorLinks = pgTable("aggregator_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  platform: varchar("platform", { length: 40 }).notNull(), // 'talabat' | 'snoonu' | 'keeta' | 'custom'
  displayName: text("display_name").notNull(),
  url: text("url").notNull(),
  badgeEn: varchar("badge_en", { length: 80 }),
  badgeAr: varchar("badge_ar", { length: 80 }),
  isActive: boolean("is_active").notNull().default(true),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type AggregatorLink = typeof aggregatorLinks.$inferSelect;

export const aggregatorClicks = pgTable("aggregator_clicks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  aggregatorId: varchar("aggregator_id").references(() => aggregatorLinks.id, { onDelete: "set null" }),
  platform: varchar("platform", { length: 40 }).notNull(),
  menuItemId: varchar("menu_item_id").references(() => menuItems.id, { onDelete: "set null" }),
  locale: varchar("locale", { length: 8 }).notNull().default("en"),
  clickedAt: timestamp("clicked_at").notNull().defaultNow(),
});
export type AggregatorClick = typeof aggregatorClicks.$inferSelect;

// Platform Settings & Lock-Screen Web Push / Native Mobile Push Subscriptions
export const platformSettings = pgTable("platform_settings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scope: varchar("scope", { length: 80 }).notNull(),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  platform: varchar("platform", { length: 24 }).notNull().default("web_push"), // 'web_push' | 'android_fcm' | 'ios_apns'
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh"),
  auth: text("auth"),
  nativeToken: text("native_token"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastDeliveredAt: timestamp("last_delivered_at"),
});
export type PushSubscriptionRecord = typeof pushSubscriptions.$inferSelect;

// Dynamic QR & NFC Smart Tags + Reusable Counter Pager Coasters
export const smartTagTargetTypes = [
  "venue_menu",
  "dining_table",
  "curbside_bay",
  "waitlist_join",
  "reservations",
  "reusable_pager",
] as const;
export type SmartTagTargetType = (typeof smartTagTargetTypes)[number];

export const smartTagHardwareKinds = [
  "qr_only",
  "nfc_tag",
  "dual_qr_nfc",
  "coaster_puck",
] as const;
export type SmartTagHardwareKind = (typeof smartTagHardwareKinds)[number];

export const smartTags = pgTable("smart_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  restaurantId: varchar("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
  token: varchar("token").notNull().default(sql`gen_random_uuid()`),
  tagCode: varchar("tag_code", { length: 40 }).notNull(),
  label: text("label").notNull(),
  hardwareKind: varchar("hardware_kind", { length: 24 }).notNull().default("dual_qr_nfc"),
  targetType: varchar("target_type", { length: 32 }).notNull().default("venue_menu"),
  tableId: varchar("table_id").references(() => diningTables.id, { onDelete: "set null" }),
  bayId: varchar("bay_id").references(() => serviceBays.id, { onDelete: "set null" }),
  activeTicketId: varchar("active_ticket_id").references(() => pagerTickets.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  qrScans: integer("qr_scans").notNull().default(0),
  nfcTaps: integer("nfc_taps").notNull().default(0),
  lastScannedAt: timestamp("last_scanned_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type SmartTag = typeof smartTags.$inferSelect;

export type PublicCafe = Pick<
  Restaurant,
  | 'id'
  | 'name'
  | 'nameAr'
  | 'slug'
  | 'theme'
  | 'brandAccentHex'
  | 'currency'
  | 'timezone'
  | 'logoUrl'
  | 'coverMediaUrl'
  | 'coverMediaType'
  | 'cuisineType'
  | 'cuisineTypeAr'
  | 'address'
  | 'addressAr'
  | 'phone'
  | 'openingHours'
  | 'openingHoursAr'
  | 'openTime'
  | 'closeTime'
  | 'venueConfig'
  | 'orderingMode'
  | 'paymentGateway'
  | 'googleMapsReviewUrl'
  | 'reservationsEnabled'
  | 'waitlistEnabled'
  | 'driveThruEnabled'
  | 'pagerMiniGameEnabled'
  | 'slotIntervalMins'
  | 'defaultTurnDurationMins'
  | 'reservationDepositAmount'
>;

export interface PublicMenuData {
  restaurant: PublicCafe;
  categories: Category[];
  items: MenuItem[];
  variants: PriceVariant[];
}

export interface PublicHospitalityConfig {
  restaurant: PublicCafe;
  zones: DiningZone[];
  tables: Pick<DiningTable, 'id' | 'zoneId' | 'tableCode' | 'minCovers' | 'maxCovers' | 'isCombinable'>[];
  bays: Pick<ServiceBay, 'id' | 'code' | 'label' | 'bayType' | 'qrToken'>[];
  aggregators: AggregatorLink[];
}
