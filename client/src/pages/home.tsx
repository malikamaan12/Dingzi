import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Coffee, ArrowUpRight, Bell, CalendarDays, Car, Truck } from 'lucide-react';
import { cafeThemeStyle } from '@/lib/cafeTheme';
import { PUBLIC_MENU_ORIGIN } from '@shared/menuIdentity';
import { DingziWordmark } from '@/components/staff-brand';

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

export default function Home() {
  const publicOnly = window.location.origin === PUBLIC_MENU_ORIGIN;
  const { data: cafes, isLoading, isError } = useQuery<Cafe[]>({ queryKey: ['/api/cafes'] });

  return (
    <div style={cafeThemeStyle()} className="min-h-screen bg-background text-foreground">
      <header className="mx-auto max-w-6xl flex items-center justify-between px-6 py-6 border-b border-[#E5E2F2] bg-white/80 backdrop-blur">
        <Link href="/" className="flex items-center gap-3 cursor-pointer" aria-label="Dingzi Home">
          <DingziWordmark tone="light" />
        </Link>
        {!publicOnly && (
          <Link href="/login" className="text-sm font-semibold px-4 py-2.5 rounded-xl border border-[#E5E2F2] bg-white text-[#4B1FE0] hover:bg-[#EFEAFF] transition-colors cursor-pointer">
            Staff &amp; KDS Console ↗
          </Link>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-6 py-14 md:py-20">
        <div className="max-w-3xl space-y-5">
          <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EFEAFF] text-[#4B1FE0] uppercase tracking-[.2em] text-xs font-bold">
            Dingzi · Menus · Lock-Screen Pager · Tables · Curbside
          </p>
          <h1 className="text-4xl sm:text-6xl font-display font-extrabold leading-tight tracking-tight text-[#17132E]">
            Scan the table.<br />Skip the crowd.
          </h1>
          <p className="text-[#57507A] text-base sm:text-lg max-w-xl">
            Browse live English &amp; Arabic menus, order ahead or pay at the venue, track your virtual pager with lock-screen phone ringing, book a table, or check into a curbside bay.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
          {isLoading ? (
            <p role="status">Loading venues…</p>
          ) : isError ? (
            <p role="alert">Could not load venues. Please refresh.</p>
          ) : cafes?.length ? (
            cafes.map(cafe => (
              <Link
                key={cafe.id}
                href={cafe.slug ? `/v/${cafe.slug}` : `/menu/${cafe.id}`}
                style={cafeThemeStyle(cafe.theme, cafe.brandAccentHex)}
                className="group block rounded-3xl border bg-card text-card-foreground p-7 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl cursor-pointer"
              >
                <div className="flex justify-between items-start">
                  {cafe.logoUrl ? (
                    <img src={cafe.logoUrl} alt={`${cafe.name} logo`} className="h-14 w-28 rounded-xl object-contain" />
                  ) : (
                    <span className="w-12 h-12 rounded-2xl bg-primary/10 text-primary grid place-items-center">
                      <Coffee className="h-6 w-6" />
                    </span>
                  )}
                  <ArrowUpRight className="text-primary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>

                <h2 className="text-2xl font-display font-bold mt-6">{cafe.name}</h2>
                <p className="text-muted-foreground text-sm mt-1.5">
                  {cafe.cuisineType || 'Specialty coffee & hospitality'}
                </p>

                <div className="flex flex-wrap gap-1.5 mt-5 text-[11px] font-semibold text-muted-foreground">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted">
                    <Bell className="w-3 h-3 text-primary" /> Pager
                  </span>
                  {cafe.reservationsEnabled && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted">
                      <CalendarDays className="w-3 h-3 text-primary" /> Tables
                    </span>
                  )}
                  {cafe.driveThruEnabled && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted">
                      <Car className="w-3 h-3 text-primary" /> Curbside
                    </span>
                  )}
                  {cafe.orderingMode && cafe.orderingMode !== 'browse_and_pager' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary">
                      <Truck className="w-3 h-3" /> Order Ahead
                    </span>
                  )}
                </div>

                <span className="inline-block mt-6 text-sm font-semibold text-primary">
                  Open venue menu →
                </span>
              </Link>
            ))
          ) : (
            <div className="col-span-full rounded-2xl border bg-card p-8 text-sm text-muted-foreground">
              No active public venues yet. Sign in to the Staff Console to create or activate your first café.
            </div>
          )}
        </div>
      </main>

      <footer className="mx-auto max-w-6xl border-t border-[#E5E2F2] px-6 py-6 text-sm text-[#57507A] flex flex-wrap justify-between gap-4">
        <span>Dingzi · Multi-Tenant Hospitality Operating Platform</span>
        {!publicOnly && <Link href="/login" className="text-[#4B1FE0] font-semibold hover:underline cursor-pointer">Staff &amp; Super-Admin Sign In</Link>}
      </footer>
    </div>
  );
}
