import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  BellRing,
  CalendarDays,
  Car,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  FolderOpen,
  Palette,
  QrCode,
  Receipt,
  Settings,
  Sparkles,
  Truck,
  UserCog,
  UtensilsCrossed,
  Wifi,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useManagerMenu } from '@/lib/managerMenu';
import { useRealtimeStream } from '@/lib/useRealtimeStream';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { publicExperienceOrigin } from '@shared/menuIdentity';

interface DashboardSnapshot {
  liveOps: {
    pagers: {
      activeTotal: number;
      waiting: number;
      preparing: number;
      ready: number;
      overdue: number;
      topActive: {
        id: string;
        ticketCode: string;
        status: string;
        customerName: string | null;
        queuedAt: string;
        orderNumber: string | null;
        preparedCount: number;
        totalLines: number;
      }[];
    };
    orders: {
      todayCount: number;
      totalCount: number;
      todayRevenue: string;
      unpaidVenueCount: number;
      currency: string;
    };
    floor: {
      zonesCount: number;
      tablesCount: number;
      upcomingReservationsCount: number;
      waitingPartiesCount: number;
      nextFloorItems: {
        kind: 'waitlist' | 'reservation';
        id: string;
        code: string;
        guestName: string;
        partySize: number;
        status: string;
        timeLabel: string;
      }[];
    };
    curbside: {
      driveThruEnabled: boolean;
      baysCount: number;
      arrivedCount: number;
      arrivedVehicles: {
        id: string;
        ticketCode: string;
        status: string;
        bayCode: string | null;
        vehicleColor: string | null;
        vehicleType: string | null;
        licensePlate: string | null;
        etaStatus: string | null;
      }[];
    };
    qrNfc: {
      totalSmartTags: number;
      reusableCoasters: number;
      activeCoasters: number;
      totalQrScans: number;
      totalNfcTaps: number;
    };
    catalog: {
      categoriesCount: number;
      totalItems: number;
      visibleItems: number;
      soldOutItems: number;
      todaySpecials: number;
      aggregatorsCount: number;
    };
  };
  readiness: {
    completedSteps: number;
    totalSteps: number;
    completionPct: number;
    checklist: {
      id: string;
      label: string;
      done: boolean;
      href: string;
    }[];
  };
}

const MODE_LABELS: Record<string, string> = {
  browse_and_pager: 'Browse & Virtual Pager',
  cart_pay_at_venue: 'Order Now · Pay at Venue',
  full_online_checkout: 'Full Online Checkout',
};

export default function AdminDashboard() {
  const { toast } = useToast();
  const { data: menuData } = useManagerMenu();
  const cafe = menuData?.restaurant;
  const [copiedUrl, setCopiedUrl] = useState(false);

  const dashQuery = useQuery<DashboardSnapshot>({
    queryKey: ['/api/hospitality/dashboard'],
    enabled: Boolean(cafe?.id),
    refetchInterval: 8000,
  });

  useRealtimeStream(cafe?.id ? '/api/hospitality/stream' : null, () => {
    void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/dashboard'] });
  });

  const publicBase = publicExperienceOrigin(typeof window !== 'undefined' ? window.location.origin : '');
  const guestUrl = cafe
    ? cafe.slug
      ? `${publicBase}/v/${cafe.slug}`
      : `${publicBase}/menu/${cafe.id}`
    : '';

  async function copyGuestLink() {
    if (!guestUrl) return;
    try {
      await navigator.clipboard.writeText(guestUrl);
      setCopiedUrl(true);
      toast({ title: 'Guest menu link copied' });
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      toast({ title: 'Could not copy link', variant: 'destructive' });
    }
  }

  const ops = dashQuery.data?.liveOps;
  const readiness = dashQuery.data?.readiness;
  const isLive = Boolean(cafe && cafe.status === 'active' && !cafe.hidden);

  const pulseCards = [
    {
      title: 'Live Prep & Pagers',
      value: ops ? String(ops.pagers.activeTotal) : '…',
      sub: ops
        ? ops.pagers.overdue > 0
          ? `${ops.pagers.overdue} overdue · ${ops.pagers.ready} ready for pickup`
          : `${ops.pagers.preparing} preparing · ${ops.pagers.ready} ready`
        : 'Loading live queue…',
      href: '/admin/pagers',
      icon: BellRing,
      urgent: Boolean(ops && ops.pagers.overdue > 0),
    },
    {
      title: 'Today’s Revenue & Orders',
      value: ops ? `${ops.orders.todayRevenue} ${ops.orders.currency}` : '…',
      sub: ops
        ? `${ops.orders.todayCount} orders today · ${ops.orders.unpaidVenueCount} pay-at-venue open`
        : 'Loading ledger…',
      href: '/admin/orders',
      icon: Receipt,
      urgent: Boolean(ops && ops.orders.unpaidVenueCount > 0),
    },
    {
      title: 'Tables & Walk-In Waitlist',
      value: ops ? String(ops.floor.waitingPartiesCount + ops.floor.upcomingReservationsCount) : '…',
      sub: ops
        ? `${ops.floor.waitingPartiesCount} waiting · ${ops.floor.upcomingReservationsCount} booked (${ops.floor.tablesCount} tables)`
        : 'Loading floor…',
      href: '/admin/tables',
      icon: CalendarDays,
      urgent: false,
    },
    {
      title: 'Curbside & Drive-Thru',
      value: ops ? String(ops.curbside.arrivedCount) : '…',
      sub: ops
        ? `${ops.curbside.baysCount} bays configured · ${ops.curbside.driveThruEnabled ? 'Active' : 'Disabled'}`
        : 'Loading bays…',
      href: '/admin/drive-thru',
      icon: Car,
      urgent: Boolean(ops && ops.curbside.arrivedCount > 0),
    },
    {
      title: 'QR Scans & NFC Taps',
      value: ops ? String(ops.qrNfc.totalQrScans + ops.qrNfc.totalNfcTaps) : '…',
      sub: ops
        ? `${ops.qrNfc.totalQrScans} QR · ${ops.qrNfc.totalNfcTaps} NFC · ${ops.qrNfc.activeCoasters}/${ops.qrNfc.reusableCoasters} coasters active`
        : 'Loading smart tags…',
      href: '/admin/qr-code',
      icon: Wifi,
      urgent: false,
    },
    {
      title: 'Menu & Availability',
      value: ops ? `${ops.catalog.visibleItems}/${ops.catalog.totalItems}` : String(menuData?.items.length ?? '…'),
      sub: ops
        ? `${ops.catalog.categoriesCount} categories · ${ops.catalog.soldOutItems} snoozed · ${ops.catalog.todaySpecials} specials`
        : 'Loading catalog…',
      href: '/admin/menu',
      icon: UtensilsCrossed,
      urgent: false,
    },
  ];

  const workspaceModules = [
    {
      title: 'Live Pagers & Queue',
      desc: 'Issue 1-tap pagers, tick items as prepared, buzz phones & recall tickets.',
      href: '/admin/pagers',
      icon: BellRing,
    },
    {
      title: 'Orders & Counter POS',
      desc: 'Ring up walk-in orders, settle Pay-at-Venue bills & print receipts.',
      href: '/admin/orders',
      icon: Receipt,
    },
    {
      title: 'Tables & Waitlist',
      desc: 'Floor zones, dine-in table QRs, conflict-free bookings & waitlist paging.',
      href: '/admin/tables',
      icon: CalendarDays,
    },
    {
      title: 'Drive-Thru & Bays',
      desc: 'Arrived car board, vehicle color/plate tags & curbside bollard plaques.',
      href: '/admin/drive-thru',
      icon: Car,
    },
    {
      title: 'Menu Items & Options',
      desc: 'Edit dishes, photos, 3-size variants, modifiers, allergens & specials.',
      href: '/admin/menu',
      icon: UtensilsCrossed,
    },
    {
      title: 'Categories & Dayparts',
      desc: 'Order menu sections and schedule Breakfast/Dinner serving windows.',
      href: '/admin/categories',
      icon: FolderOpen,
    },
    {
      title: 'QR & NFC Studio',
      desc: 'Permanent venue QR, NTAG213/215 encoder & reusable pager coasters.',
      href: '/admin/qr-code',
      icon: QrCode,
    },
    {
      title: 'Profile, Brand & Hours',
      desc: 'Logo, cover video, custom brand hex, `/v/:slug` & operating hours.',
      href: '/admin/restaurant',
      icon: Palette,
    },
    {
      title: 'Commerce & Delivery',
      desc: 'Switch ordering modes, SkipCash/Sadad vault & Talabat/Snoonu/Keeta links.',
      href: '/admin/delivery',
      icon: CreditCard,
    },
    {
      title: 'SLA & QR/NFC Analytics',
      desc: '24h prep-time SLA charts, channel revenue, NFC taps & delivery clicks.',
      href: '/admin/analytics',
      icon: BarChart3,
    },
    {
      title: 'Team & Branch Roles',
      desc: 'Assign Barista, Host/Cashier & Manager accounts or compare branches.',
      href: '/admin/team',
      icon: UserCog,
    },
    {
      title: 'Account & Recovery',
      desc: 'Rotate your password or export a full portable JSON branch backup.',
      href: '/admin/settings',
      icon: Settings,
    },
  ];

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Command Center Hero */}
      <section className="rounded-3xl border border-primary/15 bg-gradient-to-br from-card via-card to-primary/5 p-5 sm:p-7 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#EFEAFF] text-[#4B1FE0]">
                <span
                  className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-500' : 'bg-amber-500'}`}
                  aria-hidden="true"
                />
                {isLive ? 'Live Guest Storefront' : 'Setup Mode'}
              </span>
              {cafe?.orderingMode && (
                <Badge variant="outline" className="text-xs font-semibold">
                  {MODE_LABELS[cafe.orderingMode] || cafe.orderingMode}
                </Badge>
              )}
              {cafe?.openTime && cafe?.closeTime && (
                <span className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                  {cafe.openTime}–{cafe.closeTime} ({cafe.timezone})
                </span>
              )}
            </div>

            <h1
              data-testid="text-dashboard-title"
              className="text-2xl sm:text-4xl font-extrabold tracking-tight"
            >
              {cafe?.name || 'Your restaurant dashboard'}
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Real-time command center across your live order &amp; pager queue, floor tables, curbside bays, digital menu, and QR/NFC smart coasters.
            </p>
          </div>

          {cafe && (
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 shrink-0">
              <Link href="/admin/pagers">
                <Button
                  type="button"
                  data-testid="button-dashboard-open-queue"
                  className="w-full sm:w-auto min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer gap-2"
                >
                  <BellRing className="w-4 h-4" />
                  <span>Open Live Queue</span>
                  {ops && ops.pagers.activeTotal > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[#C8FF42] text-[#17132E] font-mono text-xs font-black">
                      {ops.pagers.activeTotal}
                    </span>
                  )}
                </Button>
              </Link>
              <Button
                type="button"
                variant="outline"
                onClick={copyGuestLink}
                data-testid="button-dashboard-copy-link"
                className="min-h-11 rounded-xl cursor-pointer gap-2"
              >
                {copiedUrl ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copiedUrl ? 'Copied Link' : cafe.slug ? `/v/${cafe.slug}` : 'Copy Menu URL'}</span>
              </Button>
              <a
                href={cafe.slug ? `/v/${cafe.slug}` : `/menu/${cafe.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex"
              >
                <Button type="button" variant="secondary" className="w-full min-h-11 rounded-xl cursor-pointer gap-2">
                  <span>Guest Menu</span>
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </a>
            </div>
          )}
        </div>
      </section>

      {/* 6-Card Live Operations Pulse Grid */}
      <section
        aria-label="Live branch operations pulse"
        role="status"
        aria-live="polite"
        className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {pulseCards.map(card => {
          const Icon = card.icon;
          return (
            <Link key={card.title} href={card.href}>
              <article
                className={`manager-panel p-5 h-full flex items-start justify-between gap-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
                  card.urgent ? 'border-[#C8FF42] ring-1 ring-[#C8FF42]/60' : ''
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <span className="text-xs font-semibold text-muted-foreground block">{card.title}</span>
                  <strong className="text-2xl sm:text-3xl font-black font-mono tracking-tight block truncate">
                    {card.value}
                  </strong>
                  <span className="text-xs text-muted-foreground block">{card.sub}</span>
                </div>
                <div
                  className={`w-11 h-11 rounded-2xl grid place-items-center shrink-0 ${
                    card.urgent
                      ? 'bg-[#C8FF42] text-[#17132E]'
                      : 'bg-[#EFEAFF] text-[#4B1FE0]'
                  }`}
                >
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </div>
              </article>
            </Link>
          );
        })}
      </section>

      {/* Live Active Feeds + Readiness Split */}
      <div className="grid lg:grid-cols-12 gap-5">
        {/* Left: Live Prep & Arrived Curbside Feed */}
        <section className="lg:col-span-7 manager-panel p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-bold text-lg">Live Order Prep &amp; Curbside Feed</h2>
              <p className="text-xs text-muted-foreground">
                Active pager tickets and arrived bay vehicles updating in real time.
              </p>
            </div>
            <Link href="/admin/pagers">
              <Button variant="ghost" size="sm" className="min-h-11 cursor-pointer gap-1.5 text-primary">
                <span>Manage Queue</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          {ops?.curbside.arrivedVehicles && ops.curbside.arrivedVehicles.length > 0 && (
            <div className="space-y-2">
              {ops.curbside.arrivedVehicles.map(v => (
                <Link key={v.id} href="/admin/drive-thru">
                  <div className="rounded-2xl bg-[#17132E] text-white p-3.5 flex flex-wrap items-center justify-between gap-2 cursor-pointer hover:bg-[#241E42] transition-colors">
                    <div className="flex items-center gap-2.5">
                      <span className="px-2.5 py-1 rounded-lg bg-[#C8FF42] text-[#17132E] font-mono text-xs font-black">
                        {v.bayCode ? `BAY · ${v.bayCode}` : 'CAR ARRIVED'}
                      </span>
                      <span className="text-xs font-semibold">
                        {v.vehicleColor || 'Vehicle'} {v.vehicleType || ''}{' '}
                        {v.licensePlate ? `(${v.licensePlate})` : ''} · Ticket {v.ticketCode}
                      </span>
                    </div>
                    <span className="text-xs text-[#C8FF42] font-semibold">Dispatch →</span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {!ops || ops.pagers.topActive.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                No active prep tickets waiting right now. Issue a 1-tap Auto Pager or ring up a Counter POS order to start.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/admin/pagers">
                  <Button size="sm" className="min-h-11 rounded-xl cursor-pointer gap-1.5">
                    <BellRing className="w-4 h-4" />
                    <span>Issue Auto Pager</span>
                  </Button>
                </Link>
                <Link href="/admin/orders">
                  <Button size="sm" variant="outline" className="min-h-11 rounded-xl cursor-pointer gap-1.5">
                    <Receipt className="w-4 h-4" />
                    <span>Counter POS Order</span>
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {ops.pagers.topActive.map(ticket => (
                <Link key={ticket.id} href="/admin/pagers">
                  <div className="rounded-2xl border p-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-muted/50 transition-colors cursor-pointer">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <strong className="font-mono text-base font-black">{ticket.ticketCode}</strong>
                      <Badge
                        className={
                          ticket.status === 'ready'
                            ? 'bg-[#C8FF42] text-[#17132E] hover:bg-[#C8FF42] border-0 font-extrabold uppercase'
                            : 'uppercase'
                        }
                        variant={ticket.status === 'ready' ? 'default' : 'secondary'}
                      >
                        {ticket.status}
                      </Badge>
                      {ticket.customerName && <span className="text-sm font-medium">{ticket.customerName}</span>}
                      {ticket.orderNumber && (
                        <span className="text-xs font-mono text-muted-foreground">· {ticket.orderNumber}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {ticket.totalLines > 0 && (
                        <span className="px-2.5 py-1 rounded-full bg-[#EFEAFF] text-[#4B1FE0] font-mono font-bold">
                          {ticket.preparedCount}/{ticket.totalLines} Prepared
                        </span>
                      )}
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Right: Host Stand Schedule & Branch Readiness Checklist */}
        <section className="lg:col-span-5 space-y-5">
          <div className="manager-panel p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold text-base">Host Stand · Waitlist &amp; Bookings</h2>
              <Link href="/admin/tables">
                <span className="text-xs font-semibold text-primary hover:underline cursor-pointer">
                  Open Floor →
                </span>
              </Link>
            </div>
            {!ops || ops.floor.nextFloorItems.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3">
                No walk-in parties or table reservations queued right now.
              </p>
            ) : (
              <div className="space-y-2">
                {ops.floor.nextFloorItems.map(item => (
                  <Link key={`${item.kind}-${item.id}`} href="/admin/tables">
                    <div className="rounded-xl border px-3 py-2.5 text-xs flex items-center justify-between gap-2 hover:bg-muted/50 cursor-pointer">
                      <div>
                        <strong className="font-mono text-primary">{item.code}</strong>{' '}
                        <span className="font-semibold">{item.guestName}</span> · Party of {item.partySize}
                      </div>
                      <span className="text-muted-foreground shrink-0">{item.timeLabel}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {readiness && (
            <div className="manager-panel p-5 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
                  <h2 className="font-bold text-base">Branch Launch Readiness</h2>
                </div>
                <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-full bg-[#EFEAFF] text-[#4B1FE0]">
                  {readiness.completedSteps}/{readiness.totalSteps} Complete
                </span>
              </div>

              <div className="h-2 rounded-full bg-muted overflow-hidden" aria-hidden="true">
                <div
                  className="h-full bg-[#6236FF] transition-all duration-300"
                  style={{ width: `${readiness.completionPct}%` }}
                />
              </div>

              <ul className="space-y-1.5 text-xs">
                {readiness.checklist.map(step => (
                  <li key={step.id}>
                    <Link href={step.href}>
                      <div className="min-h-10 px-2.5 py-1.5 rounded-xl hover:bg-muted/60 flex items-center justify-between gap-2 cursor-pointer">
                        <span className="inline-flex items-center gap-2">
                          {step.done ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                          ) : (
                            <Circle className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                          )}
                          <span className={step.done ? 'text-muted-foreground' : 'font-semibold text-foreground'}>
                            {step.label}
                          </span>
                        </span>
                        {!step.done && <span className="text-primary font-semibold shrink-0">Configure →</span>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* All Restaurant Workspace Modules Grid */}
      <section className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">Restaurant Modules &amp; Studios</h2>
          <Link href="/admin/delivery">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline cursor-pointer">
              <Truck className="w-3.5 h-3.5" />
              <span>Delivery &amp; Gateways</span>
            </span>
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {workspaceModules.map(mod => {
            const Icon = mod.icon;
            return (
              <Link key={mod.href} href={mod.href}>
                <div className="manager-panel p-4 h-full flex items-start gap-3.5 hover:border-primary/35 hover:shadow-sm transition-all duration-150 cursor-pointer">
                  <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0 mt-0.5">
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <strong className="block text-sm font-bold">{mod.title}</strong>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{mod.desc}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
