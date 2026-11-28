import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Car,
  Coffee,
  QrCode,
  Search,
  ShoppingBag,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/queryClient';
import { cafeThemeStyle } from '@/lib/cafeTheme';
import { localizedEntityText, MenuLanguageProvider, MenuLanguageSwitch, useMenuLanguage } from '@/lib/menuLanguage';
import { usePlatformConfig } from '@/lib/usePlatformConfig';
import { PUBLIC_MENU_ORIGIN } from '@shared/menuIdentity';
import { DingziWordmark } from '@/components/staff-brand';
import { ActiveGuestPassesBar } from '@/components/hospitality/ActiveGuestPassesBar';
import { PwaInstallBanner } from '@/components/mobile/PwaInstallBanner';
import { QrNfcScannerModal } from '@/components/qr-nfc/QrNfcScannerModal';

type Cafe = {
  id: string;
  name: string;
  nameAr?: string | null;
  slug?: string | null;
  theme: string;
  brandAccentHex?: string | null;
  cuisineType: string | null;
  cuisineTypeAr?: string | null;
  logoUrl: string | null;
  orderingMode?: string;
  reservationsEnabled?: boolean;
  waitlistEnabled?: boolean;
  driveThruEnabled?: boolean;
};

type CapabilityFilter = 'all' | 'order_ahead' | 'tables' | 'curbside' | 'waitlist';

export default function Home() {
  return (
    <MenuLanguageProvider>
      <HomeDirectoryContent />
    </MenuLanguageProvider>
  );
}

function HomeDirectoryContent() {
  const { language, dir, t, label } = useMenuLanguage();
  const platformCfg = usePlatformConfig();
  const [, navigate] = useLocation();
  const publicOnly = window.location.origin === PUBLIC_MENU_ORIGIN;
  const showStaffLink = !publicOnly && platformCfg.showStaffSignInLinkOnDirectory;
  const { data: cafes, isLoading, isError } = useQuery<Cafe[]>({ queryKey: ['/api/cafes'] });

  const [search, setSearch] = useState('');
  const [capability, setCapability] = useState<CapabilityFilter>('all');
  const [selectedVenueId, setSelectedVenueId] = useState('');
  const [pagerCode, setPagerCode] = useState('');
  const [pagerError, setPagerError] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);

  const lookupPager = useMutation({
    mutationFn: async () => {
      setPagerError('');
      const venueId = selectedVenueId || cafes?.[0]?.id;
      if (!venueId) throw new Error('Select a venue first');
      const res = await apiRequest('POST', '/api/public/pager/lookup', {
        restaurantId: venueId,
        ticketCode: pagerCode.trim(),
      });
      return res.json();
    },
    onSuccess: data => {
      if (data.trackingToken) {
        navigate(`/pager/${data.trackingToken}`);
      } else if (data.coasterToken) {
        navigate(`/tag/${data.coasterToken}`);
      }
    },
    onError: (e: Error) => setPagerError(e.message),
  });

  const filteredCafes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (cafes || []).filter(c => {
      if (capability === 'order_ahead' && (!c.orderingMode || c.orderingMode === 'browse_and_pager')) return false;
      if (capability === 'tables' && !c.reservationsEnabled) return false;
      if (capability === 'curbside' && !c.driveThruEnabled) return false;
      if (capability === 'waitlist' && !c.waitlistEnabled) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.nameAr || '').toLowerCase().includes(q) ||
        label(c.name).toLowerCase().includes(q) ||
        (c.cuisineType || '').toLowerCase().includes(q) ||
        (c.cuisineTypeAr || '').toLowerCase().includes(q) ||
        (c.slug || '').toLowerCase().includes(q)
      );
    });
  }, [cafes, capability, search, label]);

  const filterOptions: { id: CapabilityFilter; labelKey: string }[] = [
    { id: 'all', labelKey: 'All Venues' },
    { id: 'order_ahead', labelKey: 'Order Ahead' },
    { id: 'tables', labelKey: 'Book Table' },
    { id: 'curbside', labelKey: 'Curbside' },
    { id: 'waitlist', labelKey: 'Walk-In Waitlist' },
  ];

  return (
    <div dir={dir} lang={language} style={cafeThemeStyle()} className="min-h-dvh bg-[#F6F5FC] text-[#17132E]">
      <header
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        className="sticky top-0 z-30 border-b border-[#E5E2F2] bg-white/92 backdrop-blur"
      >
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-2.5 px-4 sm:px-6 py-3 sm:py-4">
          <Link href="/" className="flex items-center gap-2.5 min-w-0 shrink cursor-pointer" aria-label="dingzi home">
            <DingziWordmark tone="light" />
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setScannerOpen(true)}
              className="min-h-11 rounded-xl border-[#E5E2F2] bg-[#F6F5FC] text-[#17132E] hover:bg-[#EFEAFF] hover:text-[#4B1FE0] font-semibold cursor-pointer gap-1.5"
            >
              <QrCode className="w-4 h-4 text-[#6236FF]" />
              <span className="hidden min-[400px]:inline">{t('Scan QR / NFC')}</span>
            </Button>
            <MenuLanguageSwitch />
            {showStaffLink && (
              <Link
                href="/login"
                className="hidden sm:inline-flex items-center min-h-11 text-xs sm:text-sm font-semibold px-4 rounded-xl border border-[#E5E2F2] bg-white text-[#4B1FE0] hover:bg-[#EFEAFF] transition-colors cursor-pointer"
              >
                {t('Staff Console ↗')}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-10 space-y-8">
        <ActiveGuestPassesBar />

        {/* Clean Hero + Midnight Indigo Live Pager Dock */}
        <section className="grid lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 space-y-3.5">
            <h1
              style={{ letterSpacing: dir === 'rtl' ? '0' : '-0.03em' }}
              className="text-3xl min-[400px]:text-4xl sm:text-5xl lg:text-6xl font-display font-extrabold leading-[1.1] text-balance text-[#17132E]"
            >
              {language === 'ar' ? platformCfg.heroTitleLine1Ar : platformCfg.heroTitleLine1En}
              <br />
              <span className="text-[#6236FF]">
                {language === 'ar' ? platformCfg.heroTitleLine2Ar : platformCfg.heroTitleLine2En}
              </span>
            </h1>
            <p className="text-[#57507A] text-sm sm:text-lg leading-relaxed max-w-xl">
              {language === 'ar' ? platformCfg.heroSubtitleAr : platformCfg.heroSubtitleEn}
            </p>
            <div className="pt-1">
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-[#E5E2F2] text-[#4B1FE0] text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-[#6236FF]" aria-hidden="true" />
                <span>{language === 'ar' ? platformCfg.directoryBadgeAr : platformCfg.directoryBadgeEn}</span>
              </span>
            </div>
          </div>

          {cafes && cafes.length > 0 && (
            <form
              onSubmit={e => {
                e.preventDefault();
                if (pagerCode.trim()) lookupPager.mutate();
              }}
              data-testid="form-home-pager-lookup"
              className="lg:col-span-5 rounded-3xl bg-[#17132E] text-white border border-[#241E42] p-5 sm:p-6 shadow-xl space-y-3.5"
            >
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-[#C8FF42] text-[#17132E] grid place-items-center shrink-0">
                  <Bell className="w-5 h-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-bold text-base text-white">
                    {language === 'ar' ? platformCfg.pagerCardTitleAr : platformCfg.pagerCardTitleEn}
                  </h2>
                  <p className="text-xs text-white/70">
                    {language === 'ar' ? platformCfg.pagerCardSubtitleAr : platformCfg.pagerCardSubtitleEn}
                  </p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-2.5">
                <select
                  aria-label={t('Select venue')}
                  value={selectedVenueId || cafes[0]?.id || ''}
                  onChange={e => setSelectedVenueId(e.target.value)}
                  className="min-h-11 rounded-xl border border-white/15 bg-[#241E42] px-3 text-base sm:text-sm font-medium text-white"
                >
                  {cafes.map(c => (
                    <option key={c.id} value={c.id}>
                      {localizedEntityText(language, c.name, c.nameAr, label)}
                    </option>
                  ))}
                </select>
                <Input
                  value={pagerCode}
                  onChange={e => setPagerCode(e.target.value)}
                  placeholder={t('Enter receipt or pager # (e.g. A-001)')}
                  data-testid="input-home-pager-code"
                  className="min-h-11 rounded-xl border-white/15 bg-[#241E42] text-white font-mono uppercase placeholder:text-white/55 placeholder:font-sans placeholder:normal-case"
                  required
                />
              </div>

              {pagerError && <p className="text-xs text-[#FF4D6D] font-semibold">{pagerError}</p>}

              <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2">
                <Button
                  type="submit"
                  data-testid="button-home-pager-submit"
                  disabled={!pagerCode.trim() || lookupPager.isPending}
                  className="w-full min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer"
                >
                  {lookupPager.isPending ? 'Locating…' : t('Track Pager')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setScannerOpen(true)}
                  data-testid="button-home-scan-qr-nfc"
                  className="w-full min-h-11 rounded-xl border-white/20 bg-[#241E42] text-white hover:bg-[#312959] font-semibold cursor-pointer gap-2"
                >
                  <QrCode className="w-4 h-4 text-[#C8FF42]" />
                  <span>{t('Scan QR / NFC')}</span>
                </Button>
              </div>
            </form>
          )}
        </section>

        {/* Search & Capability Filter Bar */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 sm:max-w-md">
              <Search
                className="w-4 h-4 text-[#57507A] absolute top-3.5 start-3.5 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('Search venues or cuisines…')}
                aria-label={t('Search venues or cuisines…')}
                data-testid="input-home-venue-search"
                className="w-full min-h-11 ps-10 pe-12 rounded-2xl border border-[#E5E2F2] bg-white text-base sm:text-sm text-[#17132E] placeholder:text-[#57507A] focus:outline-none focus:ring-2 focus:ring-[#4B1FE0]"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear venue search"
                  onClick={() => setSearch('')}
                  className="absolute top-0 end-0 w-11 h-11 rounded-2xl grid place-items-center text-[#57507A] hover:bg-[#F6F5FC] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div
              className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 snap-x"
              role="group"
              aria-label="Filter venues by capability"
            >
              {filterOptions.map(opt => {
                const active = capability === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCapability(opt.id)}
                    className={`min-h-11 px-4 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors shrink-0 snap-start cursor-pointer ${
                      active
                        ? 'bg-[#6236FF] text-white border-[#6236FF] shadow-sm'
                        : 'bg-white text-[#17132E] border-[#E5E2F2] hover:bg-[#EFEAFF] hover:text-[#4B1FE0]'
                    }`}
                  >
                    {t(opt.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {isLoading ? (
              <p role="status" className="text-sm text-[#57507A]">
                Loading venues…
              </p>
            ) : isError ? (
              <p role="alert" className="text-sm text-destructive">
                Could not load venues. Please refresh.
              </p>
            ) : filteredCafes.length ? (
              filteredCafes.map(cafe => {
                const baseHref = cafe.slug ? `/v/${cafe.slug}` : `/menu/${cafe.id}`;
                const orderAhead = Boolean(cafe.orderingMode && cafe.orderingMode !== 'browse_and_pager');
                return (
                  <article
                    key={cafe.id}
                    style={cafeThemeStyle(cafe.theme, cafe.brandAccentHex)}
                    className="group rounded-3xl border border-[#E5E2F2] bg-white text-[#17132E] overflow-hidden flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
                  >
                    <Link href={baseHref} className="block p-5 sm:p-6 cursor-pointer flex-1">
                      <div className="flex items-start justify-between gap-3">
                        {cafe.logoUrl ? (
                          <img
                            src={cafe.logoUrl}
                            alt={`${label(cafe.name)} logo`}
                            className="h-12 w-24 rounded-xl object-contain object-left rtl:object-right"
                          />
                        ) : (
                          <span className="w-12 h-12 rounded-2xl bg-primary/12 text-primary grid place-items-center">
                            <Coffee className="h-6 w-6" aria-hidden="true" />
                          </span>
                        )}

                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#EFEAFF] text-[#4B1FE0]">
                          {orderAhead ? (
                            <>
                              <ShoppingBag className="w-3 h-3" aria-hidden="true" />
                              <span>{t('Order Ahead')}</span>
                            </>
                          ) : (
                            <>
                              <Bell className="w-3 h-3" aria-hidden="true" />
                              <span>{t('Virtual Pager')}</span>
                            </>
                          )}
                        </span>
                      </div>

                      <h2 className="text-xl sm:text-2xl font-display font-bold mt-4 text-[#17132E] group-hover:text-[#4B1FE0] transition-colors">
                        {localizedEntityText(language, cafe.name, cafe.nameAr, label)}
                      </h2>
                      <p className="text-[#57507A] text-sm mt-1 line-clamp-2">
                        {localizedEntityText(
                          language,
                          cafe.cuisineType ||
                            (language === 'ar' ? 'قهوة مختصة وضيافة عصرية' : 'Specialty coffee & hospitality'),
                          cafe.cuisineTypeAr,
                        )}
                      </p>

                      <div className="flex flex-wrap gap-1.5 mt-4 text-[11px] font-medium text-[#57507A]">
                        {cafe.reservationsEnabled && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F6F5FC] border border-[#E5E2F2]">
                            <CalendarDays className="w-3 h-3 text-primary" aria-hidden="true" />
                            <span>{t('Tables')}</span>
                          </span>
                        )}
                        {cafe.waitlistEnabled && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F6F5FC] border border-[#E5E2F2]">
                            <Users className="w-3 h-3 text-primary" aria-hidden="true" />
                            <span>{t('Walk-In Waitlist')}</span>
                          </span>
                        )}
                        {cafe.driveThruEnabled && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F6F5FC] border border-[#E5E2F2]">
                            <Car className="w-3 h-3 text-primary" aria-hidden="true" />
                            <span>{t('Curbside')}</span>
                          </span>
                        )}
                      </div>
                    </Link>

                    <div className="px-5 sm:px-6 pb-5 pt-3 border-t border-[#E5E2F2]/70 flex items-center justify-between gap-2">
                      <Link
                        href={baseHref}
                        className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-95 transition-opacity cursor-pointer"
                      >
                        <span>{t('Explore the menu')}</span>
                        <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" aria-hidden="true" />
                      </Link>

                      <div className="flex items-center gap-1.5">
                        {cafe.reservationsEnabled && (
                          <Link
                            href={`${baseHref}?action=reserve`}
                            aria-label={`Book table at ${cafe.name}`}
                            className="min-h-11 px-3 rounded-xl border border-[#E5E2F2] bg-[#F6F5FC] text-[#17132E] hover:bg-[#EFEAFF] hover:text-[#4B1FE0] text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Book</span>
                          </Link>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="col-span-full rounded-2xl border border-[#E5E2F2] bg-white p-8 text-sm text-[#57507A] flex items-center justify-between gap-4">
                <span>No venues match your current search or filter.</span>
                {(search || capability !== 'all') && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSearch('');
                      setCapability('all');
                    }}
                    className="cursor-pointer rounded-xl"
                  >
                    {t('Reset')}
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>

        <PwaInstallBanner compact />
      </main>

      <footer
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))' }}
        className="mx-auto max-w-6xl border-t border-[#E5E2F2] px-4 sm:px-6 pt-6 text-sm text-[#57507A] flex flex-wrap items-center justify-between gap-4"
      >
        <span>{language === 'ar' ? platformCfg.footerTextAr : platformCfg.footerTextEn}</span>
        {showStaffLink && (
          <Link
            href="/login"
            className="min-h-11 inline-flex items-center text-[#4B1FE0] font-semibold hover:underline cursor-pointer"
          >
            Staff &amp; Super-Admin Sign In
          </Link>
        )}
      </footer>

      <QrNfcScannerModal
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        venues={(cafes || []).map(c => ({ id: c.id, name: localizedEntityText(language, c.name, c.nameAr, label) }))}
        dir={dir}
        lang={language}
        t={t}
      />
    </div>
  );
}
