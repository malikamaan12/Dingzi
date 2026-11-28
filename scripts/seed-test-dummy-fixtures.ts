export interface StaffMemberSeedSpec {
  email: string;
  firstName: string;
  lastName: string;
  staffRole: 'tenant_owner' | 'branch_manager' | 'host_cashier' | 'prep_barista';
  scope: 'all_branches' | 'selected_branches';
  branchIds?: string[];
  capabilities?: Record<string, boolean>;
  pin: string;
}

export function buildUrbanLusailProfile(existingRestaurant: any) {
  return {
    name: 'Urban Café',
    nameAr: 'أوربان كافيه · مرسى لوسيل',
    slug: 'urban-cafe',
    theme: 'dingzi',
    brandAccentHex: '#6236FF',
    currency: 'QAR',
    timezone: 'Asia/Qatar',
    cuisineType: 'Artisan Wood-Fired Pizza · Specialty Coffee · Desserts',
    cuisineTypeAr: 'بيتزا مختصة · قهوة مختصة · حلويات طازجة',
    address: 'Lusail Marina Promenade, Doha, Qatar',
    addressAr: 'ممشى مرسى لوسيل، الدوحة، قطر',
    phone: '+974 4400 1100',
    openingHours: 'Daily · 07:00 AM – 11:30 PM',
    openingHoursAr: 'يومياً · 7:00 ص – 11:30 م',
    openTime: '07:00',
    closeTime: '23:30',
    logoUrl: existingRestaurant?.logoUrl || null,
    coverMediaUrl: existingRestaurant?.coverMediaUrl || null,
    coverMediaType: existingRestaurant?.coverMediaType || null,
    orderingMode: 'cart_pay_at_venue',
    paymentGateway: 'none',
    reservationsEnabled: true,
    waitlistEnabled: true,
    driveThruEnabled: true,
    pagerMiniGameEnabled: true,
    slotIntervalMins: 30,
    defaultTurnDurationMins: 90,
    reservationDepositAmount: '0.00',
    googleMapsReviewUrl: 'https://maps.google.com/?q=Lusail+Marina+Doha',
    venueConfig: {
      pagerTicketPrefix: 'A',
      waitlistTicketPrefix: 'W',
      posOrderPrefix: 'POS',
      defaultPrepMins: 10,
      rebuzzCooldownSecs: 20,
      waitlistHoldMins: 12,
      depositHoldMins: 15,
      maxPartySize: 12,
      reviewPromptMinStars: 4,
      taxPercent: 0,
      taxLabel: 'VAT',
      taxLabelAr: 'ضريبة القيمة المضافة',
      serviceChargePercent: 0,
      currencySymbolAr: 'ر.ق',
      defaultItemUnit: 'serving',
      dietaryTagOptions: ['Bestseller', 'Chef Pick', 'Wood-Fired', 'Spicy', 'Vegetarian', 'Vegan'],
      allergenOptions: ['Dairy', 'Gluten', 'Nuts', 'Pistachio', 'Sesame', 'Eggs'],
      vehicleColors: ['White', 'Black', 'Silver', 'Gray', 'Blue', 'Red', 'Pearl Sand', 'Green'],
      vehicleTypes: ['SUV', 'Sedan', 'Pickup', 'Coupe', 'Other'],
      menuEyebrow: 'LUSAIL MARINA MENU',
      menuEyebrowAr: 'قائمة مرسى لوسيل',
      footerTagline: 'Fresh off the stone oven & espresso bar.',
      footerTaglineAr: 'طازج من الفرن الحجري وبار الإسبريسو.',
      wheelEnabled: true,
      wheelMaxItems: 8,
      customTranslations: {
        'Wood-Fired': 'مخبوز على الحطب',
        'Chef Pick': 'اختيار الشيف',
      },
    },
  };
}

export function buildQstrawberryProfile(existingRestaurant: any) {
  return {
    name: 'Qstrawberry',
    nameAr: 'كيو ستروبيري · كتارا',
    slug: 'qstrawberry',
    theme: 'terracotta',
    brandAccentHex: '#6236FF',
    currency: 'QAR',
    timezone: 'Asia/Qatar',
    cuisineType: 'Belgian Chocolate Strawberries & Specialty Coffee',
    cuisineTypeAr: 'فراولة بالشوكولاتة البلجيكية وقهوة مختصة',
    address: 'Katara Cultural Village, Doha, Qatar',
    addressAr: 'الحي الثقافي كتارا، الدوحة، قطر',
    phone: '+974 4400 2200',
    openingHours: 'Daily · 02:00 PM – 01:00 AM',
    openingHoursAr: 'يومياً · 2:00 م – 1:00 ص',
    openTime: '14:00',
    closeTime: '01:00',
    logoUrl: existingRestaurant?.logoUrl || null,
    coverMediaUrl: existingRestaurant?.coverMediaUrl || null,
    coverMediaType: existingRestaurant?.coverMediaType || null,
    orderingMode: 'full_online_checkout',
    paymentGateway: 'skipcash',
    reservationsEnabled: true,
    waitlistEnabled: true,
    driveThruEnabled: true,
    pagerMiniGameEnabled: true,
    slotIntervalMins: 30,
    defaultTurnDurationMins: 75,
    reservationDepositAmount: '25.00',
    googleMapsReviewUrl: 'https://maps.google.com/?q=Katara+Cultural+Village+Doha',
    venueConfig: {
      pagerTicketPrefix: 'QS',
      waitlistTicketPrefix: 'QW',
      posOrderPrefix: 'QPOS',
      defaultPrepMins: 6,
      rebuzzCooldownSecs: 20,
      waitlistHoldMins: 10,
      depositHoldMins: 15,
      maxPartySize: 8,
      reviewPromptMinStars: 4,
      taxPercent: 0,
      currencySymbolAr: 'ر.ق',
      menuEyebrow: 'KATARA DESSERT LOUNGE',
      menuEyebrowAr: 'لاونج الحلويات · كتارا',
      footerTagline: 'Dipped fresh to order in warm Belgian chocolate.',
      footerTaglineAr: 'تُحضّر طازجة عند الطلب بالشوكولاتة البلجيكية الدافئة.',
      wheelEnabled: true,
      wheelMaxItems: 6,
    },
  };
}

export function buildWestBayProfile(coverImageUrl: string | null) {
  return {
    name: 'Urban Café · West Bay',
    nameAr: 'أوربان كافيه · الخليج الغربي',
    slug: 'urban-west-bay',
    theme: 'ocean',
    brandAccentHex: '#6236FF',
    currency: 'QAR',
    timezone: 'Asia/Qatar',
    cuisineType: 'Executive Espresso Bar & Artisan Bakery',
    cuisineTypeAr: 'بار إسبريسو تنفيذي ومخبوزات مختصة',
    address: 'West Bay Diplomatic Area, Doha',
    addressAr: 'منطقة الأبراج، الخليج الغربي، الدوحة',
    phone: '+974 4400 1188',
    openingHours: 'Sun–Thu · 06:30 AM – 10:00 PM',
    openingHoursAr: 'الأحد–الخميس · 6:30 ص – 10:00 م',
    openTime: '06:30',
    closeTime: '22:00',
    coverMediaUrl: coverImageUrl,
    coverMediaType: coverImageUrl ? 'image' : null,
    orderingMode: 'cart_pay_at_venue',
    reservationsEnabled: true,
    waitlistEnabled: true,
    driveThruEnabled: true,
    pagerMiniGameEnabled: true,
    venueConfig: {
      pagerTicketPrefix: 'WB',
      waitlistTicketPrefix: 'WT',
      posOrderPrefix: 'WBPOS',
      defaultPrepMins: 8,
      serviceChargePercent: 5,
      currencySymbolAr: 'ر.ق',
      menuEyebrow: 'WEST BAY TOWER MENU',
      menuEyebrowAr: 'قائمة فرع الخليج الغربي',
      footerTagline: 'Crafted for West Bay mornings.',
      footerTaglineAr: 'قهوة صباحية مختصة في قلب الخليج الغربي.',
    },
  };
}

export function buildSaffronMajlisProfile(coverImageUrl: string | null) {
  return {
    name: 'Saffron Majlis · Msheireb',
    nameAr: 'مجلس الزعفران · مشيرب',
    slug: 'saffron-majlis',
    theme: 'forest',
    brandAccentHex: '#6236FF',
    currency: 'QAR',
    timezone: 'Asia/Qatar',
    cuisineType: 'Qatari Karak, Saffron Sweets & Roastery',
    cuisineTypeAr: 'كرك قطري وحلويات الزعفران ومحمصة مختصة',
    address: 'Barahat Msheireb Downtown, Doha',
    addressAr: 'براحة مشيرب قلب الدوحة',
    phone: '+974 4400 3300',
    openingHours: 'Daily · 08:00 AM – 12:00 AM',
    openingHoursAr: 'يومياً · 8:00 ص – 12:00 ص',
    openTime: '08:00',
    closeTime: '23:59',
    coverMediaUrl: coverImageUrl,
    coverMediaType: coverImageUrl ? 'image' : null,
    orderingMode: 'browse_and_pager',
    reservationsEnabled: true,
    waitlistEnabled: true,
    driveThruEnabled: false,
    pagerMiniGameEnabled: true,
    venueConfig: {
      pagerTicketPrefix: 'MJ',
      waitlistTicketPrefix: 'MW',
      posOrderPrefix: 'MJPOS',
      defaultPrepMins: 12,
      waitlistHoldMins: 15,
      currencySymbolAr: 'ر.ق',
      menuEyebrow: 'MSHEIREB SPECIALTY MAJLIS',
      menuEyebrowAr: 'مجلس مشيرب للقهوة المختصة',
      footerTagline: 'Order at the Majlis counter — we will ding your phone.',
      footerTaglineAr: 'اطلب من كاونتر المجلس وسننبه هاتفك فور الجاهزية.',
    },
  };
}

export function buildStaffPortfolio(urbanCafeId: string): {
  urban: StaffMemberSeedSpec[];
  qstrawberry: StaffMemberSeedSpec[];
  majlis: StaffMemberSeedSpec[];
} {
  return {
    urban: [
      {
        email: 'owner@urbancafe.test',
        firstName: 'Tariq',
        lastName: 'Al-Kuwari',
        staffRole: 'tenant_owner',
        scope: 'all_branches',
        pin: '100100',
      },
      {
        email: 'manager@urbancafe.test',
        firstName: 'Sara',
        lastName: 'Lusail Mgr',
        staffRole: 'branch_manager',
        scope: 'selected_branches',
        branchIds: [urbanCafeId],
        pin: '200200',
      },
      {
        email: 'reception@urbancafe.test',
        firstName: 'Lina',
        lastName: 'Front Desk',
        staffRole: 'host_cashier',
        scope: 'all_branches',
        capabilities: { canIssuePagers: true, canSettlePos: true, canManageTables: true, canSnoozeMenu: false },
        pin: '111222',
      },
      {
        email: 'cashier@urbancafe.test',
        firstName: 'Omar',
        lastName: 'POS Cashier',
        staffRole: 'host_cashier',
        scope: 'selected_branches',
        branchIds: [urbanCafeId],
        capabilities: { canIssuePagers: true, canSettlePos: true, canManageTables: false, canSnoozeMenu: false },
        pin: '222333',
      },
      {
        email: 'host@urbancafe.test',
        firstName: 'Noor',
        lastName: 'Host Stand',
        staffRole: 'host_cashier',
        scope: 'selected_branches',
        branchIds: [urbanCafeId],
        capabilities: { canIssuePagers: true, canSettlePos: false, canManageTables: true, canSnoozeMenu: false },
        pin: '333444',
      },
      {
        email: 'prep@urbancafe.test',
        firstName: 'Youssef',
        lastName: 'Head Barista',
        staffRole: 'prep_barista',
        scope: 'all_branches',
        pin: '444555',
      },
    ],
    qstrawberry: [
      {
        email: 'owner@qstrawberry.test',
        firstName: 'Dana',
        lastName: 'Katara Owner',
        staffRole: 'tenant_owner',
        scope: 'all_branches',
        pin: '500500',
      },
      {
        email: 'reception@qstrawberry.test',
        firstName: 'Reem',
        lastName: 'Katara Desk',
        staffRole: 'host_cashier',
        scope: 'all_branches',
        pin: '555666',
      },
      {
        email: 'prep@qstrawberry.test',
        firstName: 'Karim',
        lastName: 'Chocolatier',
        staffRole: 'prep_barista',
        scope: 'all_branches',
        pin: '666777',
      },
    ],
    majlis: [
      {
        email: 'owner@saffronmajlis.test',
        firstName: 'Nasser',
        lastName: 'Al-Thani',
        staffRole: 'tenant_owner',
        scope: 'all_branches',
        pin: '700700',
      },
      {
        email: 'reception@saffronmajlis.test',
        firstName: 'Huda',
        lastName: 'Majlis Host',
        staffRole: 'host_cashier',
        scope: 'all_branches',
        pin: '777888',
      },
      {
        email: 'prep@saffronmajlis.test',
        firstName: 'Bilal',
        lastName: 'Karak Master',
        staffRole: 'prep_barista',
        scope: 'all_branches',
        pin: '888999',
      },
    ],
  };
}

export function formatCredentialsSummary(params: {
  isCloud: boolean;
  staffBase: string;
  guestBase: string;
  sharedPassword: string;
  superAdminEmail: string;
  sampleReadyPagerToken: string;
  samplePreparingPagerToken: string;
  sampleWaitlistToken: string;
  sampleBookingToken: string;
  coasterToken: string;
}): string[] {
  const {
    isCloud,
    staffBase,
    guestBase,
    sharedPassword,
    superAdminEmail,
    sampleReadyPagerToken,
    samplePreparingPagerToken,
    sampleWaitlistToken,
    sampleBookingToken,
    coasterToken,
  } = params;
  return [
    `# dingzi Test Portfolio & Credentials (${isCloud ? 'LIVE CLOUD' : 'LOCALHOST:5200'})`,
    `Staff & Admin Console: ${staffBase}/login`,
    `Guest Venue Directory: ${guestBase}/`,
    `Shared Test Password:  ${sharedPassword}`,
    '',
    '## Platform Super-Admin',
    `- ${superAdminEmail} / ${sharedPassword}`,
    '',
    '## Tenant 1: Dingzi Qatar Hospitality Group (2 Branches: /v/urban-cafe & /v/urban-west-bay)',
    `- Tenant Admin (All Branches): owner@urbancafe.test / ${sharedPassword} | PIN: 100100`,
    `- Branch Manager (Lusail):     manager@urbancafe.test / ${sharedPassword} | PIN: 200200`,
    `- Reception & Cashier (Full):  reception@urbancafe.test / ${sharedPassword} | PIN: 111222`,
    `- Cashier Only (No Tables):    cashier@urbancafe.test / ${sharedPassword} | PIN: 222333`,
    `- Host Stand Only (No Cash):   host@urbancafe.test / ${sharedPassword} | PIN: 333444`,
    `- Order Prep / Barista:        prep@urbancafe.test / ${sharedPassword} | PIN: 444555`,
    '',
    '## Tenant 2: Qstrawberry Artisanal Group (Mode C SkipCash Online + 25 QAR Deposit: /v/qstrawberry)',
    `- Tenant Admin:        owner@qstrawberry.test / ${sharedPassword} | PIN: 500500`,
    `- Reception & Cashier: reception@qstrawberry.test / ${sharedPassword} | PIN: 555666`,
    `- Order Prep Station:  prep@qstrawberry.test / ${sharedPassword} | PIN: 666777`,
    '',
    '## Tenant 3: Majlis Roastery Group (Mode A Browse & Counter Pager: /v/saffron-majlis)',
    `- Tenant Admin:       owner@saffronmajlis.test / ${sharedPassword} | PIN: 700700`,
    `- Reception Host:     reception@saffronmajlis.test / ${sharedPassword} | PIN: 777888`,
    `- Barista Prep:       prep@saffronmajlis.test / ${sharedPassword} | PIN: 888999`,
    '',
    '## Live Guest Pass & QR/NFC Test Links',
    `- Lusail Menu (Mode B):   ${guestBase}/v/urban-cafe`,
    `- West Bay Menu (Branch): ${guestBase}/v/urban-west-bay`,
    `- Qstrawberry (Mode C):   ${guestBase}/v/qstrawberry`,
    `- Saffron Majlis (Mode A):${guestBase}/v/saffron-majlis`,
    sampleReadyPagerToken ? `- Ready Virtual Pager:    ${guestBase}/pager/${sampleReadyPagerToken}` : '',
    samplePreparingPagerToken ? `- Preparing Curbside Pass:${guestBase}/pager/${samplePreparingPagerToken}` : '',
    sampleWaitlistToken ? `- Ready Waitlist Pass:    ${guestBase}/waitlist/${sampleWaitlistToken}` : '',
    sampleBookingToken ? `- Table Booking Pass:     ${guestBase}/booking/${sampleBookingToken}` : '',
    `- Bound NFC Coaster #01:  ${guestBase}/tag/${coasterToken}`,
  ].filter(Boolean);
}
