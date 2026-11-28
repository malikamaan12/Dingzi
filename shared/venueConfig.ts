import { z } from 'zod';

export const SUPPORTED_CURRENCIES = [
  'QAR',
  'SAR',
  'AED',
  'KWD',
  'BHD',
  'OMR',
  'JOD',
  'EGP',
  'USD',
  'EUR',
  'GBP',
  'INR',
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_ARABIC_SYMBOLS: Readonly<Record<string, string>> = {
  QAR: 'ر.ق',
  SAR: 'ر.س',
  AED: 'د.إ',
  KWD: 'د.ك',
  BHD: 'د.ب',
  OMR: 'ر.ع',
  JOD: 'د.أ',
  EGP: 'ج.م',
};

export const CATEGORY_MENU_GROUPS = ['auto', 'food', 'snacks', 'drinks', 'sweets'] as const;
export type CategoryMenuGroupSetting = (typeof CATEGORY_MENU_GROUPS)[number];

export const RECEIPT_STYLES = ['editorial_brand', 'classic_thermal', 'minimal_bilingual'] as const;
export type ReceiptStyleSetting = (typeof RECEIPT_STYLES)[number];

export const RECEIPT_PAPER_WIDTHS = ['80mm', '58mm'] as const;
export type ReceiptPaperWidthSetting = (typeof RECEIPT_PAPER_WIDTHS)[number];

export const venueConfigSchema = z
  .object({
    // Queue, Pagers, Waitlist & Reservation Rules
    pagerTicketPrefix: z
      .string()
      .trim()
      .min(1)
      .max(8)
      .regex(/^[A-Za-z0-9]+$/, 'Prefix may contain letters and numbers only')
      .optional(),
    waitlistTicketPrefix: z
      .string()
      .trim()
      .min(1)
      .max(8)
      .regex(/^[A-Za-z0-9]+$/, 'Prefix may contain letters and numbers only')
      .optional(),
    posOrderPrefix: z
      .string()
      .trim()
      .min(1)
      .max(8)
      .regex(/^[A-Za-z0-9]+$/, 'Prefix may contain letters and numbers only')
      .optional(),
    defaultPrepMins: z.number().int().min(1).max(180).optional(),
    rebuzzCooldownSecs: z.number().int().min(5).max(300).optional(),
    waitlistHoldMins: z.number().int().min(2).max(120).optional(),
    depositHoldMins: z.number().int().min(5).max(120).optional(),
    maxPartySize: z.number().int().min(1).max(60).optional(),
    reviewPromptMinStars: z.number().int().min(1).max(5).optional(),

    // Pricing, Tax / VAT & Service Charge
    taxPercent: z.number().min(0).max(50).optional(),
    taxLabel: z.string().trim().max(40).optional(),
    taxLabelAr: z.string().trim().max(40).optional(),
    serviceChargePercent: z.number().min(0).max(30).optional(),
    currencySymbolAr: z.string().trim().max(16).optional(),

    // Branded Receipt & Thermal Slip Customization
    receiptStyle: z.enum(RECEIPT_STYLES).optional(),
    receiptPaperWidth: z.enum(RECEIPT_PAPER_WIDTHS).optional(),
    receiptRegNumber: z.string().trim().max(80).optional(),
    receiptHeaderNote: z.string().trim().max(140).optional(),
    receiptHeaderNoteAr: z.string().trim().max(140).optional(),
    receiptFooterNote: z.string().trim().max(180).optional(),
    receiptFooterNoteAr: z.string().trim().max(180).optional(),
    receiptShowLogo: z.boolean().optional(),
    receiptShowQr: z.boolean().optional(),

    // Catalog, Allergen & Curbside Option Presets
    defaultItemUnit: z.string().trim().min(1).max(30).optional(),
    dietaryTagOptions: z.array(z.string().trim().min(1).max(40)).max(24).optional(),
    allergenOptions: z.array(z.string().trim().min(1).max(40)).max(24).optional(),
    vehicleColors: z.array(z.string().trim().min(1).max(30)).min(1).max(20).optional(),
    vehicleTypes: z.array(z.string().trim().min(1).max(30)).min(1).max(15).optional(),

    // Storefront UI Toggles & Bilingual Guest Copy
    menuEyebrow: z.string().trim().max(80).optional(),
    menuEyebrowAr: z.string().trim().max(80).optional(),
    footerTagline: z.string().trim().max(140).optional(),
    footerTaglineAr: z.string().trim().max(140).optional(),
    allergenNotice: z.string().trim().max(200).optional(),
    allergenNoticeAr: z.string().trim().max(200).optional(),
    pagerReadySubtitle: z.string().trim().max(180).optional(),
    pagerReadySubtitleAr: z.string().trim().max(180).optional(),
    waitlistReadySubtitle: z.string().trim().max(180).optional(),
    waitlistReadySubtitleAr: z.string().trim().max(180).optional(),
    wheelEnabled: z.boolean().optional(),
    wheelMaxItems: z.number().int().min(3).max(12).optional(),
    customTranslations: z.record(z.string().max(120), z.string().max(200)).optional(),
  })
  .strict();

export type VenueConfig = z.infer<typeof venueConfigSchema>;

export interface ResolvedVenueConfig {
  pagerTicketPrefix: string;
  waitlistTicketPrefix: string;
  posOrderPrefix: string;
  defaultPrepMins: number;
  rebuzzCooldownSecs: number;
  waitlistHoldMins: number;
  depositHoldMins: number;
  maxPartySize: number;
  reviewPromptMinStars: number;
  taxPercent: number;
  taxLabel: string;
  taxLabelAr: string;
  serviceChargePercent: number;
  currencySymbolAr: string;
  receiptStyle: ReceiptStyleSetting;
  receiptPaperWidth: ReceiptPaperWidthSetting;
  receiptRegNumber: string;
  receiptHeaderNote: string;
  receiptHeaderNoteAr: string;
  receiptFooterNote: string;
  receiptFooterNoteAr: string;
  receiptShowLogo: boolean;
  receiptShowQr: boolean;
  defaultItemUnit: string;
  dietaryTagOptions: string[];
  allergenOptions: string[];
  vehicleColors: string[];
  vehicleTypes: string[];
  menuEyebrow: string;
  menuEyebrowAr: string;
  footerTagline: string;
  footerTaglineAr: string;
  allergenNotice: string;
  allergenNoticeAr: string;
  pagerReadySubtitle: string;
  pagerReadySubtitleAr: string;
  waitlistReadySubtitle: string;
  waitlistReadySubtitleAr: string;
  wheelEnabled: boolean;
  wheelMaxItems: number;
  customTranslations: Record<string, string>;
}

export const DEFAULT_VENUE_CONFIG: ResolvedVenueConfig = {
  pagerTicketPrefix: 'A',
  waitlistTicketPrefix: 'W',
  posOrderPrefix: 'POS',
  defaultPrepMins: 10,
  rebuzzCooldownSecs: 20,
  waitlistHoldMins: 10,
  depositHoldMins: 15,
  maxPartySize: 12,
  reviewPromptMinStars: 4,
  taxPercent: 0,
  taxLabel: 'VAT',
  taxLabelAr: 'ضريبة القيمة المضافة',
  serviceChargePercent: 0,
  currencySymbolAr: '',
  receiptStyle: 'editorial_brand',
  receiptPaperWidth: '80mm',
  receiptRegNumber: '',
  receiptHeaderNote: '',
  receiptHeaderNoteAr: '',
  receiptFooterNote: 'Thank you for visiting — see you again soon.',
  receiptFooterNoteAr: 'شكراً لزيارتكم — نسعد بلقائكم مجدداً.',
  receiptShowLogo: true,
  receiptShowQr: true,
  defaultItemUnit: 'serving',
  dietaryTagOptions: ['Bestseller', 'New', 'Spicy', 'Vegetarian', 'Vegan', 'Gluten-Free'],
  allergenOptions: ['Dairy', 'Gluten', 'Nuts', 'Peanuts', 'Eggs', 'Soy', 'Sesame', 'Shellfish'],
  vehicleColors: ['White', 'Black', 'Silver', 'Gray', 'Blue', 'Red', 'Gold', 'Green'],
  vehicleTypes: ['SUV', 'Sedan', 'Pickup', 'Coupe', 'Other'],
  menuEyebrow: 'THE CAFÉ MENU',
  menuEyebrowAr: 'قائمة المقهى',
  footerTagline: 'A little pause, a good moment.',
  footerTaglineAr: 'استراحة صغيرة، ولحظة جميلة.',
  allergenNotice: 'Questions about ingredients or allergens?',
  allergenNoticeAr: 'لديك سؤال عن المكونات أو مسببات الحساسية؟',
  pagerReadySubtitle: 'Your order is hot and ready for pickup!',
  pagerReadySubtitleAr: 'طلبك ساخن وجاهز للاستلام!',
  waitlistReadySubtitle: 'Your table is ready! Held for {mins} minutes at the host stand.',
  waitlistReadySubtitleAr: 'طاولتك جاهزة! محتفظ بها لمدة {mins} دقائق عند مكتب الاستقبال.',
  wheelEnabled: true,
  wheelMaxItems: 8,
  customTranslations: {},
};

export function resolveVenueConfig(raw?: VenueConfig | null): ResolvedVenueConfig {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_VENUE_CONFIG,
      dietaryTagOptions: [...DEFAULT_VENUE_CONFIG.dietaryTagOptions],
      allergenOptions: [...DEFAULT_VENUE_CONFIG.allergenOptions],
      vehicleColors: [...DEFAULT_VENUE_CONFIG.vehicleColors],
      vehicleTypes: [...DEFAULT_VENUE_CONFIG.vehicleTypes],
      customTranslations: {},
    };
  }
  return {
    pagerTicketPrefix: (raw.pagerTicketPrefix || DEFAULT_VENUE_CONFIG.pagerTicketPrefix).toUpperCase(),
    waitlistTicketPrefix: (raw.waitlistTicketPrefix || DEFAULT_VENUE_CONFIG.waitlistTicketPrefix).toUpperCase(),
    posOrderPrefix: (raw.posOrderPrefix || DEFAULT_VENUE_CONFIG.posOrderPrefix).toUpperCase(),
    defaultPrepMins: raw.defaultPrepMins ?? DEFAULT_VENUE_CONFIG.defaultPrepMins,
    rebuzzCooldownSecs: raw.rebuzzCooldownSecs ?? DEFAULT_VENUE_CONFIG.rebuzzCooldownSecs,
    waitlistHoldMins: raw.waitlistHoldMins ?? DEFAULT_VENUE_CONFIG.waitlistHoldMins,
    depositHoldMins: raw.depositHoldMins ?? DEFAULT_VENUE_CONFIG.depositHoldMins,
    maxPartySize: raw.maxPartySize ?? DEFAULT_VENUE_CONFIG.maxPartySize,
    reviewPromptMinStars: raw.reviewPromptMinStars ?? DEFAULT_VENUE_CONFIG.reviewPromptMinStars,
    taxPercent: raw.taxPercent ?? DEFAULT_VENUE_CONFIG.taxPercent,
    taxLabel: raw.taxLabel || DEFAULT_VENUE_CONFIG.taxLabel,
    taxLabelAr: raw.taxLabelAr || DEFAULT_VENUE_CONFIG.taxLabelAr,
    serviceChargePercent: raw.serviceChargePercent ?? DEFAULT_VENUE_CONFIG.serviceChargePercent,
    currencySymbolAr: raw.currencySymbolAr ?? DEFAULT_VENUE_CONFIG.currencySymbolAr,
    receiptStyle: raw.receiptStyle ?? DEFAULT_VENUE_CONFIG.receiptStyle,
    receiptPaperWidth: raw.receiptPaperWidth ?? DEFAULT_VENUE_CONFIG.receiptPaperWidth,
    receiptRegNumber: raw.receiptRegNumber ?? DEFAULT_VENUE_CONFIG.receiptRegNumber,
    receiptHeaderNote: raw.receiptHeaderNote ?? DEFAULT_VENUE_CONFIG.receiptHeaderNote,
    receiptHeaderNoteAr: raw.receiptHeaderNoteAr ?? DEFAULT_VENUE_CONFIG.receiptHeaderNoteAr,
    receiptFooterNote: raw.receiptFooterNote || DEFAULT_VENUE_CONFIG.receiptFooterNote,
    receiptFooterNoteAr: raw.receiptFooterNoteAr || DEFAULT_VENUE_CONFIG.receiptFooterNoteAr,
    receiptShowLogo: raw.receiptShowLogo ?? DEFAULT_VENUE_CONFIG.receiptShowLogo,
    receiptShowQr: raw.receiptShowQr ?? DEFAULT_VENUE_CONFIG.receiptShowQr,
    defaultItemUnit: raw.defaultItemUnit || DEFAULT_VENUE_CONFIG.defaultItemUnit,
    dietaryTagOptions: raw.dietaryTagOptions?.length
      ? raw.dietaryTagOptions
      : [...DEFAULT_VENUE_CONFIG.dietaryTagOptions],
    allergenOptions: raw.allergenOptions?.length
      ? raw.allergenOptions
      : [...DEFAULT_VENUE_CONFIG.allergenOptions],
    vehicleColors: raw.vehicleColors?.length ? raw.vehicleColors : [...DEFAULT_VENUE_CONFIG.vehicleColors],
    vehicleTypes: raw.vehicleTypes?.length ? raw.vehicleTypes : [...DEFAULT_VENUE_CONFIG.vehicleTypes],
    menuEyebrow: raw.menuEyebrow || DEFAULT_VENUE_CONFIG.menuEyebrow,
    menuEyebrowAr: raw.menuEyebrowAr || DEFAULT_VENUE_CONFIG.menuEyebrowAr,
    footerTagline: raw.footerTagline || DEFAULT_VENUE_CONFIG.footerTagline,
    footerTaglineAr: raw.footerTaglineAr || DEFAULT_VENUE_CONFIG.footerTaglineAr,
    allergenNotice: raw.allergenNotice || DEFAULT_VENUE_CONFIG.allergenNotice,
    allergenNoticeAr: raw.allergenNoticeAr || DEFAULT_VENUE_CONFIG.allergenNoticeAr,
    pagerReadySubtitle: raw.pagerReadySubtitle || DEFAULT_VENUE_CONFIG.pagerReadySubtitle,
    pagerReadySubtitleAr: raw.pagerReadySubtitleAr || DEFAULT_VENUE_CONFIG.pagerReadySubtitleAr,
    waitlistReadySubtitle: raw.waitlistReadySubtitle || DEFAULT_VENUE_CONFIG.waitlistReadySubtitle,
    waitlistReadySubtitleAr: raw.waitlistReadySubtitleAr || DEFAULT_VENUE_CONFIG.waitlistReadySubtitleAr,
    wheelEnabled: raw.wheelEnabled ?? DEFAULT_VENUE_CONFIG.wheelEnabled,
    wheelMaxItems: raw.wheelMaxItems ?? DEFAULT_VENUE_CONFIG.wheelMaxItems,
    customTranslations: raw.customTranslations ? { ...raw.customTranslations } : {},
  };
}

export function formatCurrencyForLocale(
  currency: string,
  language: 'en' | 'ar',
  overrideSymbolAr?: string | null,
): string {
  if (language === 'ar') {
    if (overrideSymbolAr && overrideSymbolAr.trim()) return overrideSymbolAr.trim();
    return CURRENCY_ARABIC_SYMBOLS[currency] || currency;
  }
  return currency;
}

export function computeOrderTotalsWithVenueFees(
  subtotalCents: number,
  cfg: Pick<ResolvedVenueConfig, 'taxPercent' | 'serviceChargePercent'>,
): {
  subtotalCents: number;
  taxCents: number;
  serviceCents: number;
  totalCents: number;
  subtotal: string;
  taxAmount: string;
  serviceChargeAmount: string;
  total: string;
} {
  const taxCents = cfg.taxPercent > 0 ? Math.round((subtotalCents * cfg.taxPercent) / 100) : 0;
  const serviceCents =
    cfg.serviceChargePercent > 0 ? Math.round((subtotalCents * cfg.serviceChargePercent) / 100) : 0;
  const totalCents = subtotalCents + taxCents + serviceCents;
  return {
    subtotalCents,
    taxCents,
    serviceCents,
    totalCents,
    subtotal: (subtotalCents / 100).toFixed(2),
    taxAmount: (taxCents / 100).toFixed(2),
    serviceChargeAmount: (serviceCents / 100).toFixed(2),
    total: (totalCents / 100).toFixed(2),
  };
}

export function partySizeOptionsForVenue(maxPartySize = 12): number[] {
  const cap = Math.max(1, Math.min(60, Math.round(maxPartySize)));
  const opts: number[] = [];
  for (let i = 1; i <= Math.min(cap, 8); i++) opts.push(i);
  for (let i = 10; i <= cap; i += i < 20 ? 2 : 5) opts.push(i);
  if (!opts.includes(cap)) opts.push(cap);
  return opts;
}

// ===== PLATFORM-WIDE SUPER-ADMIN CMS & PROVISIONING DEFAULTS =====

export const platformConfigSchema = z
  .object({
    directoryBadgeEn: z.string().trim().min(1).max(160).optional(),
    directoryBadgeAr: z.string().trim().min(1).max(160).optional(),
    heroTitleLine1En: z.string().trim().min(1).max(120).optional(),
    heroTitleLine1Ar: z.string().trim().min(1).max(120).optional(),
    heroTitleLine2En: z.string().trim().min(1).max(120).optional(),
    heroTitleLine2Ar: z.string().trim().min(1).max(120).optional(),
    heroSubtitleEn: z.string().trim().min(1).max(320).optional(),
    heroSubtitleAr: z.string().trim().min(1).max(320).optional(),
    pagerCardTitleEn: z.string().trim().min(1).max(140).optional(),
    pagerCardTitleAr: z.string().trim().min(1).max(140).optional(),
    pagerCardSubtitleEn: z.string().trim().min(1).max(200).optional(),
    pagerCardSubtitleAr: z.string().trim().min(1).max(200).optional(),
    footerTextEn: z.string().trim().min(1).max(160).optional(),
    footerTextAr: z.string().trim().min(1).max(160).optional(),
    loginHeadline: z.string().trim().min(1).max(120).optional(),
    loginSubtitle: z.string().trim().min(1).max(240).optional(),
    loginHelpText: z.string().trim().min(1).max(240).optional(),
    defaultNewTenantMaxBranches: z.number().int().min(1).max(200).optional(),
    defaultCurrency: z.enum(SUPPORTED_CURRENCIES).optional(),
    defaultTimezone: z.string().trim().min(1).max(100).optional(),
    showStaffSignInLinkOnDirectory: z.boolean().optional(),
  })
  .strict();

export type PlatformConfig = z.infer<typeof platformConfigSchema>;
export type ResolvedPlatformConfig = Required<PlatformConfig>;

export const DEFAULT_PLATFORM_CONFIG: ResolvedPlatformConfig = {
  directoryBadgeEn: 'Menus, tables, and pickup — made dingzi.',
  directoryBadgeAr: 'المنيو والطاولات والاستلام.. بكل سهولة مع دِنغزي.',
  heroTitleLine1En: 'Scan the table.',
  heroTitleLine1Ar: 'امسح رمز الطاولة.',
  heroTitleLine2En: 'Skip the crowd.',
  heroTitleLine2Ar: 'وتجاوز طابور الانتظار.',
  heroSubtitleEn:
    "Sit easy. We'll ding your phone when it's hot. Browse live English & Arabic menus, reserve tables, or check into a curbside pickup bay right in your browser.",
  heroSubtitleAr:
    'استرح مكانك، بننبهك أول ما يجهز طلبك. تصفح القوائم الحية بالعربية والإنجليزية، احجز طاولتك، أو سجّل وصول سيارتك مباشرة من المتصفح.',
  pagerCardTitleEn: 'Have a Pager or Receipt Code?',
  pagerCardTitleAr: 'لديك رقم نداء أو فاتورة؟',
  pagerCardSubtitleEn: 'Open your live lock-screen virtual pager in one tap.',
  pagerCardSubtitleAr: 'افتح بطاقة النداء الحية على شاشة القفل بضغطة واحدة.',
  footerTextEn: 'Menus, tables, and pickup — made dingzi.',
  footerTextAr: 'المنيو والطاولات والاستلام.. بكل سهولة مع دِنغزي.',
  loginHeadline: 'Welcome back.',
  loginSubtitle: 'Menus, tables, and pickup — made dingzi. Sign in as Tenant Admin, Reception, or Station Staff.',
  loginHelpText: 'Need access? Contact your Tenant Admin or dingzi platform administrator.',
  defaultNewTenantMaxBranches: 1,
  defaultCurrency: 'QAR',
  defaultTimezone: 'Asia/Qatar',
  showStaffSignInLinkOnDirectory: true,
};

export function resolvePlatformConfig(raw?: Partial<PlatformConfig> | null): ResolvedPlatformConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PLATFORM_CONFIG };
  return {
    directoryBadgeEn: raw.directoryBadgeEn || DEFAULT_PLATFORM_CONFIG.directoryBadgeEn,
    directoryBadgeAr: raw.directoryBadgeAr || DEFAULT_PLATFORM_CONFIG.directoryBadgeAr,
    heroTitleLine1En: raw.heroTitleLine1En || DEFAULT_PLATFORM_CONFIG.heroTitleLine1En,
    heroTitleLine1Ar: raw.heroTitleLine1Ar || DEFAULT_PLATFORM_CONFIG.heroTitleLine1Ar,
    heroTitleLine2En: raw.heroTitleLine2En || DEFAULT_PLATFORM_CONFIG.heroTitleLine2En,
    heroTitleLine2Ar: raw.heroTitleLine2Ar || DEFAULT_PLATFORM_CONFIG.heroTitleLine2Ar,
    heroSubtitleEn: raw.heroSubtitleEn || DEFAULT_PLATFORM_CONFIG.heroSubtitleEn,
    heroSubtitleAr: raw.heroSubtitleAr || DEFAULT_PLATFORM_CONFIG.heroSubtitleAr,
    pagerCardTitleEn: raw.pagerCardTitleEn || DEFAULT_PLATFORM_CONFIG.pagerCardTitleEn,
    pagerCardTitleAr: raw.pagerCardTitleAr || DEFAULT_PLATFORM_CONFIG.pagerCardTitleAr,
    pagerCardSubtitleEn: raw.pagerCardSubtitleEn || DEFAULT_PLATFORM_CONFIG.pagerCardSubtitleEn,
    pagerCardSubtitleAr: raw.pagerCardSubtitleAr || DEFAULT_PLATFORM_CONFIG.pagerCardSubtitleAr,
    footerTextEn: raw.footerTextEn || DEFAULT_PLATFORM_CONFIG.footerTextEn,
    footerTextAr: raw.footerTextAr || DEFAULT_PLATFORM_CONFIG.footerTextAr,
    loginHeadline: raw.loginHeadline || DEFAULT_PLATFORM_CONFIG.loginHeadline,
    loginSubtitle: raw.loginSubtitle || DEFAULT_PLATFORM_CONFIG.loginSubtitle,
    loginHelpText: raw.loginHelpText || DEFAULT_PLATFORM_CONFIG.loginHelpText,
    defaultNewTenantMaxBranches:
      raw.defaultNewTenantMaxBranches ?? DEFAULT_PLATFORM_CONFIG.defaultNewTenantMaxBranches,
    defaultCurrency: raw.defaultCurrency || DEFAULT_PLATFORM_CONFIG.defaultCurrency,
    defaultTimezone: raw.defaultTimezone || DEFAULT_PLATFORM_CONFIG.defaultTimezone,
    showStaffSignInLinkOnDirectory:
      raw.showStaffSignInLinkOnDirectory ?? DEFAULT_PLATFORM_CONFIG.showStaffSignInLinkOnDirectory,
  };
}
