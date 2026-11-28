import { useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  BellOff,
  BellRing,
  CalendarDays,
  CheckCircle2,
  Maximize2,
  Minimize2,
  Moon,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Users,
  UtensilsCrossed,
  Wifi,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LocalQrBox } from '@/components/hospitality/LocalQrBox';
import { DingziWordmark } from '@/components/staff-brand';
import { localizedEntityText, MenuLanguageProvider, MenuLanguageSwitch, useMenuLanguage } from '@/lib/menuLanguage';
import { useRealtimeStream } from '@/lib/useRealtimeStream';
import { queryClient } from '@/lib/queryClient';
import { publicExperienceOrigin, smartTagUrl } from '@shared/menuIdentity';
import type { PagerTicket, Restaurant, SmartTag } from '@shared/schema';

type DisplayTargetTab = 'menu' | 'waitlist' | 'book';

interface PublicScreenPayload {
  restaurant: {
    id: string;
    name: string;
    nameAr?: string | null;
    slug?: string | null;
    logoUrl?: string | null;
    cuisineType?: string | null;
    cuisineTypeAr?: string | null;
    reservationsEnabled?: boolean;
    waitlistEnabled?: boolean;
  };
  tags: {
    id: string;
    tagCode: string;
    label: string;
    targetType: string;
    token: string;
  }[];
  readyTickets: {
    id: string;
    ticketCode: string;
  }[];
}

export default function ClearQrScreenPage() {
  return (
    <MenuLanguageProvider>
      <ClearQrScreenInner />
    </MenuLanguageProvider>
  );
}

function ClearQrScreenInner() {
  const [isPublicRoute, pubParams] = useRoute('/screen/:slugOrId');
  const slugOrId = pubParams?.slugOrId || '';
  const isLiveStaffDisplay = !isPublicRoute;
  const { language, dir, label } = useMenuLanguage();

  const [surfaceTone, setSurfaceTone] = useState<'light' | 'dark'>('light');
  const [activeTab, setActiveTab] = useState<DisplayTargetTab>('menu');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [spotlightTicket, setSpotlightTicket] = useState<{
    id: string;
    ticketCode: string;
    trackingToken: string;
    customerName?: string | null;
  } | null>(null);
  const [claimedNotice, setClaimedNotice] = useState<string | null>(null);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Public Clear Screen Query (/screen/:slugOrId)
  const publicQuery = useQuery<PublicScreenPayload>({
    enabled: Boolean(isPublicRoute && slugOrId),
    queryKey: ['/api/public/screen', slugOrId],
    queryFn: async () => {
      const res = await fetch(`/api/public/screen/${encodeURIComponent(slugOrId)}`);
      if (!res.ok) throw new Error('Display screen unavailable');
      return res.json();
    },
    refetchInterval: 6_000,
  });

  // Authenticated Staff Counter Display Queries (/admin/counter-display)
  const staffCafeQuery = useQuery<Restaurant>({
    enabled: isLiveStaffDisplay,
    queryKey: ['/api/restaurant'],
  });
  const staffTagsQuery = useQuery<{ tags: SmartTag[]; activeTickets: PagerTicket[] }>({
    enabled: isLiveStaffDisplay && Boolean(staffCafeQuery.data?.id),
    queryKey: ['/api/hospitality/smart-tags'],
    refetchInterval: 5_000,
  });
  const staffPagersQuery = useQuery<{ tickets: PagerTicket[] }>({
    enabled: isLiveStaffDisplay && Boolean(staffCafeQuery.data?.id),
    queryKey: ['/api/hospitality/pagers'],
    refetchInterval: 5_000,
  });

  // Live Counter Handoff Listener (only in /admin/counter-display)
  useRealtimeStream(isLiveStaffDisplay && staffCafeQuery.data?.id ? '/api/hospitality/stream' : null, event => {
    void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/pagers'] });
    void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/smart-tags'] });

    if (event.type === 'pager.created' && event.data?.ticket && !event.data?.coaster) {
      setClaimedNotice(null);
      setSpotlightTicket({
        id: event.data.ticket.id,
        ticketCode: event.data.ticket.ticketCode,
        trackingToken: event.data.ticket.trackingToken,
        customerName: event.data.ticket.customerName,
      });
    } else if (event.type === 'order.created' && event.data?.pager) {
      setClaimedNotice(null);
      setSpotlightTicket({
        id: event.data.pager.id,
        ticketCode: event.data.pager.ticketCode,
        trackingToken: event.data.pager.trackingToken,
        customerName: event.data.order?.customerName || event.data.pager.customerName,
      });
    } else if (event.type === 'pager.claimed') {
      if (
        spotlightTicket &&
        (event.data?.ticketId === spotlightTicket.id || event.data?.ticketCode === spotlightTicket.ticketCode)
      ) {
        const code = spotlightTicket.ticketCode;
        setSpotlightTicket(null);
        setClaimedNotice(code);
        window.setTimeout(() => setClaimedNotice(prev => (prev === code ? null : prev)), 3500);
      }
    }
  });

  const restaurant = isLiveStaffDisplay ? staffCafeQuery.data : publicQuery.data?.restaurant;
  const tags = isLiveStaffDisplay ? staffTagsQuery.data?.tags || [] : publicQuery.data?.tags || [];
  const activeStaffTickets = useMemo(
    () =>
      (staffPagersQuery.data?.tickets || []).filter(t => ['waiting', 'preparing', 'ready'].includes(t.status)),
    [staffPagersQuery.data?.tickets],
  );
  const readyTicketCodes = useMemo(() => {
    if (isLiveStaffDisplay) {
      return activeStaffTickets.filter(t => t.status === 'ready').map(t => t.ticketCode);
    }
    return (publicQuery.data?.readyTickets || []).map(t => t.ticketCode);
  }, [isLiveStaffDisplay, activeStaffTickets, publicQuery.data?.readyTickets]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const publicBase = publicExperienceOrigin(origin);

  const resolvedQr = useMemo(() => {
    if (!restaurant) return { url: publicBase, titleEn: 'Digital Menu', titleAr: 'القائمة الرقمية', code: 'MENU' };
    if (spotlightTicket) {
      return {
        url: `${publicBase}/pager/${spotlightTicket.trackingToken}`,
        titleEn: `Scan to Ring Your Phone (${spotlightTicket.ticketCode})`,
        titleAr: `امسح ليرن هاتفك أنت فقط (${spotlightTicket.ticketCode})`,
        code: spotlightTicket.ticketCode,
      };
    }
    const menuTag = tags.find(t => t.targetType === 'venue_menu');
    const waitlistTag = tags.find(t => t.targetType === 'waitlist_join');
    if (activeTab === 'waitlist') {
      return {
        url: waitlistTag ? smartTagUrl(waitlistTag.token, 'qr', origin) : `${publicBase}/menu/${restaurant.id}?tab=waitlist`,
        titleEn: 'Join Walk-In Table Waitlist',
        titleAr: 'انضم لقائمة انتظار الطاولات',
        code: waitlistTag?.tagCode || 'WAITLIST',
      };
    }
    if (activeTab === 'book') {
      return {
        url: `${publicBase}/menu/${restaurant.id}?tab=book`,
        titleEn: 'Reserve a Dining Table',
        titleAr: 'احجز طاولتك مسبقاً',
        code: 'BOOK-TABLE',
      };
    }
    return {
      url: menuTag
        ? smartTagUrl(menuTag.token, 'qr', origin)
        : restaurant.slug
          ? `${publicBase}/v/${restaurant.slug}`
          : `${publicBase}/menu/${restaurant.id}`,
      titleEn: 'Scan for Menu & Instant Ordering',
      titleAr: 'امسح لفتح المنيو والطلب السريع',
      code: menuTag?.tagCode || (restaurant.slug ? restaurant.slug.toUpperCase() : 'MENU'),
    };
  }, [restaurant, spotlightTicket, tags, activeTab, publicBase, origin]);

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {}
  }

  const isLoading = isLiveStaffDisplay ? staffCafeQuery.isLoading : publicQuery.isLoading;
  if (isLoading) {
    return (
      <div className="min-h-dvh grid place-items-center bg-[#F6F5FC] text-[#17132E] p-8" role="status">
        <p className="font-display font-bold text-lg">Preparing Clear QR Display…</p>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-dvh grid place-items-center bg-[#F6F5FC] text-[#17132E] p-8">
        <div className="max-w-md rounded-3xl border border-[#E5E2F2] bg-white p-8 text-center space-y-4 shadow-sm">
          <DingziWordmark tone="light" />
          <h1 className="text-xl font-display font-extrabold">Display Screen Unavailable</h1>
          <p className="text-sm text-[#57507A]">Check the venue slug or open the guest venue directory.</p>
          <Button asChild className="min-h-11 rounded-2xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white cursor-pointer">
            <Link href="/">Browse Venues</Link>
          </Button>
        </div>
      </div>
    );
  }

  const isDark = surfaceTone === 'dark';
  const venueDisplayName = localizedEntityText(language, restaurant.name, restaurant.nameAr, label);
  const venueSubline = localizedEntityText(
    language,
    restaurant.cuisineType || 'Scan with iPhone or Android Camera · Zero App Download',
    restaurant.cuisineTypeAr,
  );

  return (
    <div
      dir={dir}
      lang={language}
      data-testid="page-clear-qr-screen"
      className={`min-h-dvh flex flex-col justify-between transition-colors duration-200 ${
        isDark ? 'bg-[#17132E] text-white' : 'bg-[#F6F5FC] text-[#17132E]'
      }`}
    >
      {/* Top Clear Display Control Bar */}
      <header
        className={`border-b px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-3 ${
          isDark ? 'border-white/10 bg-[#17132E]/95' : 'border-[#E5E2F2] bg-white/95'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <DingziWordmark tone={isDark ? 'dark' : 'light'} />
          <span className={isDark ? 'text-white/25' : 'text-[#E5E2F2]'} aria-hidden="true">|</span>
          <div className="min-w-0">
            <strong className="font-display font-extrabold text-base sm:text-lg truncate block" data-testid="text-clear-screen-venue">
              {venueDisplayName}
            </strong>
          </div>
          <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EFEAFF] text-[#4B1FE0] text-xs font-bold">
            <BellOff className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{language === 'ar' ? 'شاشة صامتة · يرن هاتف الضيف فقط' : 'Silent Screen · Only Guest Phone Rings'}</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isLiveStaffDisplay && activeStaffTickets.length > 0 && (
            <select
              aria-label="Spotlight an active guest pager QR on screen"
              data-testid="select-spotlight-pager"
              value={spotlightTicket?.id || ''}
              onChange={e => {
                const chosen = activeStaffTickets.find(t => t.id === e.target.value);
                setSpotlightTicket(
                  chosen
                    ? {
                        id: chosen.id,
                        ticketCode: chosen.ticketCode,
                        trackingToken: chosen.trackingToken,
                        customerName: chosen.customerName,
                      }
                    : null,
                );
              }}
              className={`min-h-11 rounded-xl border px-3 text-xs font-mono font-bold cursor-pointer ${
                isDark ? 'bg-[#241E42] border-white/15 text-white' : 'bg-[#F6F5FC] border-[#E5E2F2] text-[#17132E]'
              }`}
            >
              <option value="">{language === 'ar' ? 'وضع المنيو الثابت' : 'Standby: Venue QR'}</option>
              {activeStaffTickets.map(t => (
                <option key={t.id} value={t.id}>
                  Show Pager {t.ticketCode} {t.customerName ? `(${t.customerName})` : ''}
                </option>
              ))}
            </select>
          )}

          <MenuLanguageSwitch />

          <button
            type="button"
            onClick={() => setSurfaceTone(isDark ? 'light' : 'dark')}
            aria-label={isDark ? 'Switch to light acrylic display' : 'Switch to dark display'}
            data-testid="button-toggle-screen-tone"
            className={`min-h-11 px-3.5 rounded-xl border inline-flex items-center gap-1.5 text-xs font-bold cursor-pointer ${
              isDark ? 'bg-[#241E42] border-white/15 text-white' : 'bg-white border-[#E5E2F2] text-[#17132E]'
            }`}
          >
            {isDark ? <Sun className="w-4 h-4 text-[#C8FF42]" /> : <Moon className="w-4 h-4 text-[#6236FF]" />}
            <span className="hidden sm:inline">{isDark ? 'Light Stand' : 'Dark Stand'}</span>
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Toggle fullscreen display"
            data-testid="button-toggle-fullscreen"
            className={`min-h-11 px-3.5 rounded-xl border inline-flex items-center gap-1.5 text-xs font-bold cursor-pointer ${
              isDark ? 'bg-[#241E42] border-white/15 text-white' : 'bg-white border-[#E5E2F2] text-[#17132E]'
            }`}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
          </button>

          {isLiveStaffDisplay && (
            <Button asChild variant="outline" className="min-h-11 rounded-xl text-xs font-bold cursor-pointer gap-1.5">
              <Link href="/admin/front-desk">
                <ArrowLeft className="w-4 h-4" />
                <span>Staff Desk</span>
              </Link>
            </Button>
          )}
        </div>
      </header>

      {/* Main Clear Counter Display Canvas */}
      <main className="max-w-6xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-10 grid lg:grid-cols-12 gap-6 sm:gap-8 items-center flex-1">
        {/* Left/Primary Card: Giant High-Contrast QR Plinth */}
        <section
          className={`lg:col-span-6 rounded-[2rem] border-2 p-6 sm:p-8 text-center shadow-2xl space-y-5 transition-colors ${
            spotlightTicket
              ? 'bg-[#17132E] text-white border-[#C8FF42]'
              : isDark
                ? 'bg-[#241E42] text-white border-[#6236FF]/60'
                : 'bg-white text-[#17132E] border-[#6236FF]/35'
          }`}
        >
          {claimedNotice ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-3xl bg-[#C8FF42] text-[#17132E] border-2 border-[#17132E] p-8 space-y-3"
            >
              <CheckCircle2 className="w-14 h-14 mx-auto text-[#17132E]" aria-hidden="true" />
              <h2 className="text-2xl sm:text-3xl font-display font-extrabold">
                {language === 'ar' ? `تم ربط هاتف الضيف! (${claimedNotice})` : `Phone Connected! (${claimedNotice})`}
              </h2>
              <p className="text-sm font-semibold text-[#17132E]/85">
                {language === 'ar'
                  ? 'سيرن هاتفك أنت فقط فور جاهزية الطلب.'
                  : 'Sit easy — only your phone will ring when your order is ready.'}
              </p>
            </div>
          ) : (
            <>
              {/* Target Mode Switcher Pills (or Active Guest Ticket Banner) */}
              {spotlightTicket ? (
                <div className="flex items-center justify-between gap-2 bg-[#241E42] rounded-2xl px-4 py-2.5 border border-[#C8FF42]/40">
                  <div className="text-start">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#C8FF42] block">
                      {language === 'ar' ? 'تذكرة طلب خاصة ١-لـ-١' : 'PRIVATE 1-TO-1 ORDER PAGER'}
                    </span>
                    <strong className="font-mono text-2xl font-black text-white">
                      {spotlightTicket.ticketCode}
                      {spotlightTicket.customerName ? ` · ${spotlightTicket.customerName}` : ''}
                    </strong>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSpotlightTicket(null)}
                    className="min-h-11 rounded-xl border-white/20 bg-[#17132E] text-white hover:bg-[#312959] cursor-pointer gap-1"
                  >
                    <X className="w-4 h-4" />
                    <span>{language === 'ar' ? 'إغلاق' : 'Clear'}</span>
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-2" role="tablist" aria-label="QR display mode">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'menu'}
                    onClick={() => setActiveTab('menu')}
                    data-testid="tab-clear-qr-menu"
                    className={`min-h-11 px-4 rounded-2xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                      activeTab === 'menu'
                        ? 'bg-[#6236FF] text-white shadow-sm'
                        : isDark
                          ? 'bg-[#17132E] text-white/80 hover:bg-[#312959]'
                          : 'bg-[#F6F5FC] text-[#17132E] hover:bg-[#EFEAFF]'
                    }`}
                  >
                    <UtensilsCrossed className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{language === 'ar' ? 'المنيو والطلب' : 'Menu & Order'}</span>
                  </button>
                  {restaurant.waitlistEnabled !== false && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === 'waitlist'}
                      onClick={() => setActiveTab('waitlist')}
                      data-testid="tab-clear-qr-waitlist"
                      className={`min-h-11 px-4 rounded-2xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                        activeTab === 'waitlist'
                          ? 'bg-[#6236FF] text-white shadow-sm'
                          : isDark
                            ? 'bg-[#17132E] text-white/80 hover:bg-[#312959]'
                            : 'bg-[#F6F5FC] text-[#17132E] hover:bg-[#EFEAFF]'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{language === 'ar' ? 'طابور الانتظار' : 'Walk-In Waitlist'}</span>
                    </button>
                  )}
                  {restaurant.reservationsEnabled !== false && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === 'book'}
                      onClick={() => setActiveTab('book')}
                      data-testid="tab-clear-qr-book"
                      className={`min-h-11 px-4 rounded-2xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                        activeTab === 'book'
                          ? 'bg-[#6236FF] text-white shadow-sm'
                          : isDark
                            ? 'bg-[#17132E] text-white/80 hover:bg-[#312959]'
                            : 'bg-[#F6F5FC] text-[#17132E] hover:bg-[#EFEAFF]'
                      }`}
                    >
                      <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{language === 'ar' ? 'حجز طاولة' : 'Book Table'}</span>
                    </button>
                  )}
                </div>
              )}

              {/* High-Contrast QR Plinth */}
              <div className="space-y-3">
                <h1 className="text-2xl sm:text-3xl font-display font-extrabold leading-tight" data-testid="text-clear-qr-headline">
                  {language === 'ar' ? resolvedQr.titleAr : resolvedQr.titleEn}
                </h1>
                <p className={`text-xs sm:text-sm ${spotlightTicket || isDark ? 'text-white/75' : 'text-[#57507A]'}`}>
                  {spotlightTicket
                    ? language === 'ar'
                      ? 'وجه كاميرا هاتفك نحو الرمز — ستختفي البطاقة تلقائياً بمجرد المسح.'
                      : 'Point your phone camera at the QR — screen resets automatically once scanned.'
                    : venueSubline}
                </p>
              </div>

              <div className="flex justify-center py-1" data-testid="clear-screen-qr-box">
                <div className="p-3 rounded-3xl bg-white shadow-lg border-4 border-[#6236FF]">
                  <LocalQrBox url={resolvedQr.url} size={264} />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#C8FF42] text-[#17132E] text-xs font-extrabold font-mono">
                  <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{resolvedQr.code}</span>
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold ${
                    spotlightTicket || isDark ? 'bg-white/10 text-white' : 'bg-[#EFEAFF] text-[#4B1FE0]'
                  }`}
                >
                  <Wifi className="w-3.5 h-3.5 rotate-90" aria-hidden="true" />
                  <span>{language === 'ar' ? 'بدون تحميل تطبيق · آيفون وأندرويد' : 'Zero App · iPhone & Android'}</span>
                </span>
              </div>
            </>
          )}
        </section>

        {/* Right Column: Crystal-Clear 3-Step Guest Guide + Silent Ready Numbers */}
        <section className="lg:col-span-6 space-y-5">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EFEAFF] text-[#4B1FE0] text-xs font-extrabold">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{language === 'ar' ? 'كيف يعمل دِنغزي بسهولة' : 'HOW DINGZI WORKS'}</span>
            </span>
            <h2 className="text-2xl sm:text-4xl font-display font-extrabold leading-tight">
              {language === 'ar'
                ? 'اطلب واسترح مكانك — سيرن هاتفك أنت فقط عند الجاهزية.'
                : 'Sit easy. Only your phone dings when your order is hot.'}
            </h2>
          </div>

          <div className="space-y-3">
            <div
              className={`rounded-2xl border p-4 flex items-start gap-3.5 ${
                isDark ? 'bg-[#241E42] border-white/10' : 'bg-white border-[#E5E2F2]'
              }`}
            >
              <span className="w-10 h-10 rounded-xl bg-[#6236FF] text-white grid place-items-center font-mono font-extrabold shrink-0">
                1
              </span>
              <div className="space-y-0.5">
                <h3 className="font-display font-bold text-base">
                  {language === 'ar' ? 'امسح رمز QR أو قرّب هاتفك من NFC' : 'Scan the QR Code or Tap NFC'}
                </h3>
                <p className={`text-xs sm:text-sm ${isDark ? 'text-white/75' : 'text-[#57507A]'}`}>
                  {language === 'ar'
                    ? 'يفتح فوراً في متصفح الهاتف بدون تحميل أي تطبيق أو تسجيل حساب.'
                    : 'Opens instantly in Safari or Chrome — zero App Store download and zero sign-up.'}
                </p>
              </div>
            </div>

            <div
              className={`rounded-2xl border p-4 flex items-start gap-3.5 ${
                isDark ? 'bg-[#241E42] border-white/10' : 'bg-white border-[#E5E2F2]'
              }`}
            >
              <span className="w-10 h-10 rounded-xl bg-[#6236FF] text-white grid place-items-center font-mono font-extrabold shrink-0">
                2
              </span>
              <div className="space-y-0.5">
                <h3 className="font-display font-bold text-base">
                  {language === 'ar' ? 'تذكرتك مرتبطة بهاتفك وحدك (١-لـ-١)' : 'Your Private 1-to-1 Pager Pass'}
                </h3>
                <p className={`text-xs sm:text-sm ${isDark ? 'text-white/75' : 'text-[#57507A]'}`}>
                  {language === 'ar'
                    ? 'تابع تحضير أصناف طلبك لحظة بلحظة من طاولتك أو سيارتك.'
                    : 'Watch live item-by-item prep progress right from your table, lounge seat, or car.'}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border-2 border-[#17132E] bg-[#C8FF42] text-[#17132E] p-4 flex items-start gap-3.5">
              <span className="w-10 h-10 rounded-xl bg-[#17132E] text-[#C8FF42] grid place-items-center shrink-0">
                <BellRing className="w-5 h-5" aria-hidden="true" />
              </span>
              <div className="space-y-0.5">
                <h3 className="font-display font-extrabold text-base">
                  {language === 'ar' ? 'دِنغ! يرن هاتفك أنت فقط لاستلام طلبك' : 'Ding! Only Your Phone Rings When Ready'}
                </h3>
                <p className="text-xs sm:text-sm text-[#17132E]/85 font-medium">
                  {language === 'ar'
                    ? 'جرس واضح واهتزاز على شاشة هاتفك فقط — هدوء تام لباقي الضيوف في الكافيه.'
                    : 'Crisp chime & vibration exclusively on your phone — keeping the café calm for everyone else.'}
                </p>
              </div>
            </div>
          </div>

          {/* Silent Visual-Only Ready Pickup Strip */}
          {readyTicketCodes.length > 0 && (
            <div
              role="status"
              aria-live="polite"
              data-testid="strip-silent-ready-tickets"
              className={`rounded-2xl border p-4 space-y-2.5 ${
                isDark ? 'bg-[#241E42] border-[#C8FF42]/50' : 'bg-white border-[#E5E2F2]'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="inline-flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-[#6236FF]" aria-hidden="true" />
                  <span>{language === 'ar' ? 'جاهز الآن للاستلام من الكاونتر:' : 'Now Ready at Pickup Counter:'}</span>
                </span>
                <span className={isDark ? 'text-white/60' : 'text-[#57507A]'}>
                  {language === 'ar' ? 'عرض صامت' : 'Visual Only'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {readyTicketCodes.map(code => (
                  <span
                    key={code}
                    className="px-3.5 py-1.5 rounded-xl bg-[#C8FF42] text-[#17132E] font-mono text-base font-black border border-[#17132E]"
                  >
                    {code}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>

      <footer
        className={`border-t px-4 sm:px-8 py-3 text-xs flex flex-wrap items-center justify-between gap-2 ${
          isDark ? 'border-white/10 text-white/60' : 'border-[#E5E2F2] text-[#57507A]'
        }`}
      >
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[#6236FF]" aria-hidden="true" />
          <span>
            <strong className="lowercase font-display text-[#6236FF]" dir="ltr" lang="en">dingzi</strong> ·{' '}
            {language === 'ar'
              ? 'نظام الضيافة الذكي للقوائم والنداء الصوتي الشخصي'
              : 'Menus, tables, and private 1-to-1 pickup — made dingzi.'}
          </span>
        </span>
        <span className="font-mono">{resolvedQr.url.replace(/^https?:\/\//, '')}</span>
      </footer>
    </div>
  );
}
