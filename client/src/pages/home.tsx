import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  Car,
  Coffee,
  Search,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/queryClient';
import { cafeThemeStyle } from '@/lib/cafeTheme';
import { MenuLanguageProvider, MenuLanguageSwitch, useMenuLanguage } from '@/lib/menuLanguage';
import { PUBLIC_MENU_ORIGIN } from '@shared/menuIdentity';
import { DingziWordmark } from '@/components/staff-brand';
import { ActiveGuestPassesBar } from '@/components/hospitality/ActiveGuestPassesBar';
import { PwaInstallBanner } from '@/components/mobile/PwaInstallBanner';

type Cafe = {
  id: string;
  name: string;
  slug?: string | null;
  theme: string;
  brandAccentHex?: string | null;
  cuisineType: string | null;
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
  const [, navigate] = useLocation();
  const publicOnly = window.location.origin === PUBLIC_MENU_ORIGIN;
  const { data: cafes, isLoading, isError } = useQuery<Cafe[]>({ queryKey: ['/api/cafes'] });

  const [search, setSearch] = useState('');
  const [capability, setCapability] = useState<CapabilityFilter>('all');
  const [selectedVenueId, setSelectedVenueId] = useState('');
  const [pagerCode, setPagerCode] = useState('');
  const [pagerError, setPagerError] = useState('');

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
      navigate(`/pager/${data.trackingToken}`);
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
        label(c.name).toLowerCase().includes(q) ||
        (c.cuisineType || '').toLowerCase().includes(q) ||
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
    <div dir={dir} lang={language} style={cafeThemeStyle()} className="min-h-screen bg-[#F6F5FC] text-[#17132E]">
      <header className="sticky top-0 z-30 border-b border-[#E5E2F2] bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-3 px-4 sm:px-6 py-4">
          <Link href="/" className="flex items-center gap-3 cursor-pointer" aria-label="Dingzi Home">
            <DingziWordmark tone="light" />
          </Link>
          <div className="flex items-center gap-2">
            <MenuLanguageSwitch />
            {!publicOnly && (
              <Link
                href="/login"
                className="hidden sm:inline-flex items-center min-h-11 text-xs sm:text-sm font-semibold px-4 rounded-xl border border-[#E5E2F2] bg-white text-[#4B1FE0] hover:bg-[#EFEAFF] transition-colors cursor-pointer"
              >
                {t('Staff & KDS Console ↗')}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 md:py-14 space-y-8">
        <ActiveGuestPassesBar />
        <PwaInstallBanner compact />

        {/* Hero + Instant Virtual Pager Lookup */}
        <section className="grid lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 space-y-4">
            <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EFEAFF] text-[#4B1FE0] uppercase tracking-[.18em] text-xs font-bold">
              Dingzi · Menus · Lock-Screen Pager · Tables · Curbside
            </p>
            <h1 className="text-4xl sm:text-6xl font-display font-extrabold leading-tight tracking-tight text-[#17132E]">
              {t('Scan the table.')}
              <br />
              <span className="text-[#6236FF]">{t('Skip the crowd.')}</span>
            </h1>
            <p className="text-[#57507A] text-base sm:text-lg max-w-xl">
              Browse live English &amp; Arabic menus, order ahead or pay at the venue, track your virtual pager with lock-screen phone ringing, book a table, or check into a curbside bay.
            </p>
          </div>

          {cafes && cafes.length > 0 && (
            <form
              onSubmit={e => {
                e.preventDefault();
                if (pagerCode.trim()) lookupPager.mutate();
              }}
              data-testid="form-home-pager-lookup"
              className="lg:col-span-5 rounded-3xl border border-[#E5E2F2] bg-white p-5 sm:p-6 shadow-sm space-y-3"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-xl bg-[#EFEAFF] text-[#6236FF] grid place-items-center shrink-0">
                  <Bell className="w-5 h-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="font-bold text-base text-[#17132E]">{t('Have a Pager or Receipt Code?')}</h2>
                  <p className="text-xs text-[#57507A]">Open your live lock-screen virtual pager in one tap.</p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-2">
                <select
                  aria-label={t('Select venue')}
                  value={selectedVenueId || cafes[0]?.id || ''}
                  onChange={e => setSelectedVenueId(e.target.value)}
                  className="h-11 rounded-xl border border-[#E5E2F2] bg-[#F6F5FC] px-3 text-sm font-medium text-[#17132E]"
                >
                  {cafes.map(c => (
                    <option key={c.id} value={c.id}>
                      {label(c.name)}
                    </option>
                  ))}
                </select>
                <Input
                  value={pagerCode}
                  onChange={e => setPagerCode(e.target.value)}
                  placeholder={t('Enter receipt or pager # (e.g. A-001)')}
                  data-testid="input-home-pager-code"
                  className="h-11 rounded-xl border-[#E5E2F2] bg-[#F6F5FC] font-mono uppercase"
                  required
                />
              </div>

              {pagerError && <p className="text-xs text-destructive font-medium">{pagerError}</p>}

              <Button
                type="submit"
                data-testid="button-home-pager-submit"
                disabled={!pagerCode.trim() || lookupPager.isPending}
                className="w-full min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer"
              >
                {lookupPager.isPending ? 'Locating…' : t('Track Pager')}
              </Button>
            </form>
          )}
        </section>

        {/* Search & Capability Filter Bar */}
        <section className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-[#57507A] absolute top-3.5 left-3.5 pointer-events-none" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('Search venues or cuisines…')}
                aria-label={t('Search venues or cuisines…')}
                data-testid="input-home-venue-search"
                className="w-full h-11 pl-10 pr-9 rounded-2xl border border-[#E5E2F2] bg-white text-sm text-[#17132E] placeholder:text-[#57507A] focus:outline-none focus:ring-2 focus:ring-[#4B1FE0]"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear venue search"
                  onClick={() => setSearch('')}
                  className="absolute top-2 right-2 w-7 h-7 rounded-lg grid place-items-center text-[#57507A] hover:bg-[#F6F5FC] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter venues by capability">
              {filterOptions.map(opt => {
                const active = capability === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCapability(opt.id)}
                    className={`min-h-11 px-4 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors cursor-pointer ${
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

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
            {isLoading ? (
              <p role="status" className="text-sm text-[#57507A]">Loading venues…</p>
            ) : isError ? (
              <p role="alert" className="text-sm text-destructive">Could not load venues. Please refresh.</p>
            ) : filteredCafes.length ? (
              filteredCafes.map(cafe => (
                <Link
                  key={cafe.id}
                  href={cafe.slug ? `/v/${cafe.slug}` : `/menu/${cafe.id}`}
                  style={cafeThemeStyle(cafe.theme, cafe.brandAccentHex)}
                  className="group block rounded-3xl border border-[#E5E2F2] bg-white text-[#17132E] p-7 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl cursor-pointer"
                >
                  <div className="flex justify-between items-start">
                    {cafe.logoUrl ? (
                      <img src={cafe.logoUrl} alt={`${label(cafe.name)} logo`} className="h-14 w-28 rounded-xl object-contain" />
                    ) : (
                      <span className="w-12 h-12 rounded-2xl bg-primary/10 text-primary grid place-items-center">
                        <Coffee className="h-6 w-6" aria-hidden="true" />
                      </span>
                    )}
                    <ArrowUpRight className="text-primary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
                  </div>

                  <h2 className="text-2xl font-display font-bold mt-5 text-[#17132E]">{label(cafe.name)}</h2>
                  <p className="text-[#57507A] text-sm mt-1">
                    {cafe.cuisineType || 'Specialty coffee & hospitality'}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mt-5 text-[11px] font-semibold">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F6F5FC] text-[#17132E] border border-[#E5E2F2]">
                      <Bell className="w-3 h-3 text-primary" aria-hidden="true" /> {t('Virtual Pager')}
                    </span>
                    {cafe.reservationsEnabled && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F6F5FC] text-[#17132E] border border-[#E5E2F2]">
                        <CalendarDays className="w-3 h-3 text-primary" aria-hidden="true" /> {t('Tables')}
                      </span>
                    )}
                    {cafe.waitlistEnabled && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F6F5FC] text-[#17132E] border border-[#E5E2F2]">
                        <Users className="w-3 h-3 text-primary" aria-hidden="true" /> {t('Walk-In Waitlist')}
                      </span>
                    )}
                    {cafe.driveThruEnabled && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F6F5FC] text-[#17132E] border border-[#E5E2F2]">
                        <Car className="w-3 h-3 text-primary" aria-hidden="true" /> {t('Curbside')}
                      </span>
                    )}
                    {cafe.orderingMode && cafe.orderingMode !== 'browse_and_pager' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EFEAFF] text-[#4B1FE0]">
                        <Truck className="w-3 h-3" aria-hidden="true" /> {t('Order Ahead')}
                      </span>
                    )}
                  </div>

                  <span className="inline-block mt-6 text-sm font-semibold text-[#4B1FE0] group-hover:underline">
                    {t('Open venue menu →')}
                  </span>
                </Link>
              ))
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
                    className="cursor-pointer"
                  >
                    {t('Reset')}
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl border-t border-[#E5E2F2] px-4 sm:px-6 py-6 text-sm text-[#57507A] flex flex-wrap justify-between gap-4">
        <span>Dingzi · Multi-Tenant Hospitality Operating Platform</span>
        {!publicOnly && (
          <Link href="/login" className="text-[#4B1FE0] font-semibold hover:underline cursor-pointer">
            Staff &amp; Super-Admin Sign In
          </Link>
        )}
      </footer>
    </div>
  );
}
