import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Bell, ChevronRight, Coffee, QrCode, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/queryClient';
import { cafeThemeStyle } from '@/lib/cafeTheme';
import { localizedEntityText, MenuLanguageProvider, MenuLanguageSwitch, useMenuLanguage } from '@/lib/menuLanguage';
import { usePlatformConfig } from '@/lib/usePlatformConfig';
import { isPublicMenuOrigin } from '@shared/menuIdentity';
import { DingziWordmark } from '@/components/staff-brand';
import { ActiveGuestPassesBar } from '@/components/hospitality/ActiveGuestPassesBar';
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
  const publicOnly = isPublicMenuOrigin(window.location.origin);
  const showStaffLink = !publicOnly && platformCfg.showStaffSignInLinkOnDirectory;
  const { data: cafes, isLoading, isError } = useQuery<Cafe[]>({ queryKey: ['/api/cafes'] });

  const [search, setSearch] = useState('');
  const [capability, setCapability] = useState<CapabilityFilter>('all');
  const [pagerModalOpen, setPagerModalOpen] = useState(false);
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
      setPagerModalOpen(false);
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
    <div dir={dir} lang={language} style={cafeThemeStyle()} className="min-h-dvh bg-[#FFFFFF] text-[#17132E]">
      {/* Minimal Top Bar */}
      <header
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        className="sticky top-0 z-30 border-b border-[#E5E2F2]/80 bg-white/90 backdrop-blur-md"
      >
        <div className="mx-auto max-w-5xl flex items-center justify-between gap-2 px-4 sm:px-6 h-16">
          <Link href="/" className="flex items-center min-w-0 shrink cursor-pointer" aria-label="dingzi home">
            <DingziWordmark tone="light" />
          </Link>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPagerModalOpen(true)}
              data-testid="button-open-home-pager-modal"
              className="min-h-11 px-3 sm:px-3.5 rounded-full border border-[#E5E2F2] bg-[#F6F5FC] hover:bg-[#EFEAFF] text-xs font-semibold text-[#17132E] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Bell className="w-3.5 h-3.5 text-[#6236FF]" aria-hidden="true" />
              <span>{t('Track Pager')}</span>
            </button>
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              aria-label={t('Scan QR / NFC')}
              data-testid="button-home-scan-qr-nfc"
              className="w-11 h-11 rounded-full border border-[#E5E2F2] bg-[#F6F5FC] hover:bg-[#EFEAFF] grid place-items-center text-[#17132E] transition-colors cursor-pointer"
            >
              <QrCode className="w-4 h-4" aria-hidden="true" />
            </button>
            <MenuLanguageSwitch />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <ActiveGuestPassesBar />

        {/* Restrained Editorial Header + Search */}
        <section className="space-y-4">
          <div className="space-y-1">
            <h1
              style={{ letterSpacing: dir === 'rtl' ? '0' : '-0.025em' }}
              className="text-2xl sm:text-3xl font-display font-bold text-[#17132E]"
            >
              {language === 'ar' ? 'اختر وجهتك' : 'Explore Cafés & Restaurants'}
            </h1>
            <p className="text-sm text-[#57507A]">
              {language === 'ar'
                ? 'تصفح المنيو، اطلب من طاولتك، أو احجز مقعدك بلمسة واحدة.'
                : 'Browse digital menus, order ahead, or reserve a table.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 sm:max-w-sm">
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
                className="w-full min-h-11 ps-10 pe-10 rounded-xl border border-[#E5E2F2] bg-[#F6F5FC] focus:bg-white text-base sm:text-sm text-[#17132E] placeholder:text-[#57507A] focus:outline-none focus:ring-2 focus:ring-[#4B1FE0] transition-colors"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear venue search"
                  onClick={() => setSearch('')}
                  className="absolute top-0 end-0 w-11 h-11 rounded-xl grid place-items-center text-[#57507A] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div
              className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 pb-0.5 snap-x"
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
                    className={`min-h-10 px-3.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors shrink-0 snap-start cursor-pointer ${
                      active
                        ? 'bg-[#17132E] text-white border-[#17132E]'
                        : 'bg-white text-[#57507A] border-[#E5E2F2] hover:text-[#17132E] hover:border-[#17132E]/30'
                    }`}
                  >
                    {t(opt.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Clean, Minimal Venue List / Grid */}
        <section>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {[0, 1, 2, 3].map(idx => (
                <div
                  key={idx}
                  role={idx === 0 ? 'status' : undefined}
                  aria-label={idx === 0 ? 'Loading venues' : undefined}
                  className="rounded-2xl border border-[#E5E2F2] bg-white p-4 flex items-center gap-3.5 animate-pulse min-w-0"
                >
                  <div className="w-14 h-14 rounded-xl bg-[#F6F5FC] shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="h-4 w-40 max-w-full rounded bg-[#F6F5FC]" />
                    <div className="h-3 w-56 max-w-full rounded bg-[#F6F5FC]" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <p role="alert" className="text-sm text-destructive py-6">
              Could not load venues. Please refresh.
            </p>
          ) : filteredCafes.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredCafes.map((cafe, idx) => {
                const baseHref = cafe.slug ? `/v/${cafe.slug}` : `/menu/${cafe.id}`;
                const capabilities = [
                  cafe.orderingMode && cafe.orderingMode !== 'browse_and_pager'
                    ? t('Order Ahead')
                    : t('Virtual Pager'),
                  cafe.reservationsEnabled ? t('Tables') : '',
                  cafe.driveThruEnabled ? t('Curbside') : '',
                ].filter(Boolean);

                return (
                  <Link
                    key={cafe.id}
                    href={baseHref}
                    className="group min-w-0 rounded-2xl border border-[#E5E2F2] bg-white hover:border-[#17132E]/25 hover:shadow-sm p-4 sm:p-5 flex items-center gap-3.5 sm:gap-4 transition-all duration-150 cursor-pointer"
                  >
                    <span className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#F6F5FC] border border-[#E5E2F2]/80 grid place-items-center overflow-hidden shrink-0">
                      {cafe.logoUrl ? (
                        <img
                          src={cafe.logoUrl}
                          alt={`${label(cafe.name)} logo`}
                          loading={idx < 4 ? 'eager' : 'lazy'}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Coffee className="h-6 w-6 text-[#57507A]" aria-hidden="true" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1 space-y-1">
                      <h2 className="text-base sm:text-lg font-semibold text-[#17132E] truncate group-hover:text-[#6236FF] transition-colors">
                        {localizedEntityText(language, cafe.name, cafe.nameAr, label)}
                      </h2>
                      <p className="text-xs sm:text-sm text-[#57507A] truncate">
                        {localizedEntityText(
                          language,
                          cafe.cuisineType ||
                            (language === 'ar' ? 'قهوة مختصة وضيافة' : 'Specialty coffee & hospitality'),
                          cafe.cuisineTypeAr,
                        )}
                      </p>
                      <p className="text-[11px] font-medium text-[#57507A]/85 truncate pt-0.5">
                        {capabilities.join(' · ')}
                      </p>
                    </div>

                    <ChevronRight
                      className="w-5 h-5 text-[#57507A]/60 group-hover:text-[#17132E] group-hover:translate-x-0.5 rtl:rotate-180 transition-all shrink-0"
                      aria-hidden="true"
                    />
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-[#E5E2F2] bg-[#F6F5FC] p-6 text-sm text-[#57507A] flex items-center justify-between gap-4">
              <span>No venues match your search.</span>
              {(search || capability !== 'all') && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setCapability('all');
                  }}
                  className="cursor-pointer rounded-xl bg-white"
                >
                  {t('Reset')}
                </Button>
              )}
            </div>
          )}
        </section>
      </main>

      <footer
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))' }}
        className="mx-auto max-w-5xl border-t border-[#E5E2F2] mt-10 px-4 sm:px-6 pt-6 text-xs text-[#57507A] flex flex-wrap items-center justify-between gap-4"
      >
        <span>{language === 'ar' ? platformCfg.footerTextAr : platformCfg.footerTextEn}</span>
        {showStaffLink && (
          <Link href="/login" className="min-h-11 inline-flex items-center text-[#4B1FE0] font-medium hover:underline cursor-pointer">
            Staff Sign In
          </Link>
        )}
      </footer>

      {/* Clean On-Demand Pager Lookup Dialog */}
      <Dialog open={pagerModalOpen} onOpenChange={setPagerModalOpen}>
        <DialogContent dir={dir} lang={language} className="max-w-sm rounded-3xl">
          <DialogTitle className="text-lg font-semibold">
            {language === 'ar' ? platformCfg.pagerCardTitleAr : platformCfg.pagerCardTitleEn}
          </DialogTitle>
          <DialogDescription className="text-xs text-[#57507A]">
            {language === 'ar' ? platformCfg.pagerCardSubtitleAr : platformCfg.pagerCardSubtitleEn}
          </DialogDescription>
          <form
            onSubmit={e => {
              e.preventDefault();
              if (pagerCode.trim() && cafes?.length) lookupPager.mutate();
            }}
            data-testid="form-home-pager-lookup"
            className="space-y-3 mt-1"
          >
            <select
              aria-label={t('Select venue')}
              value={selectedVenueId || cafes?.[0]?.id || ''}
              onChange={e => setSelectedVenueId(e.target.value)}
              className="w-full min-h-11 rounded-xl border border-[#E5E2F2] bg-[#F6F5FC] px-3 text-sm font-medium text-[#17132E]"
            >
              {(cafes || []).map(c => (
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
              className="min-h-11 rounded-xl border-[#E5E2F2] bg-[#F6F5FC] font-mono uppercase placeholder:font-sans placeholder:normal-case"
              required
            />
            {pagerError && <p className="text-xs text-destructive font-medium">{pagerError}</p>}
            <Button
              type="submit"
              data-testid="button-home-pager-submit"
              disabled={!pagerCode.trim() || !cafes?.length || lookupPager.isPending}
              className="w-full min-h-11 rounded-xl bg-[#17132E] hover:bg-[#241E42] text-white font-semibold cursor-pointer"
            >
              {lookupPager.isPending ? 'Locating…' : t('Track Pager')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

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
