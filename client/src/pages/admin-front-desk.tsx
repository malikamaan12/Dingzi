import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  BellRing,
  CalendarDays,
  Car,
  CheckCircle2,
  Clock,
  CreditCard,
  Monitor,
  Plus,
  QrCode,
  Receipt,
  Users,
  X,
} from 'lucide-react';
import { CounterPagerQrModal, type IssuedPagerHandoff } from '@/components/qr-nfc/CounterPagerQrModal';
import { GuestPhoneStatusBadge } from '@/components/hospitality/GuestPhoneStatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useManagerMenu } from '@/lib/managerMenu';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useRealtimeStream } from '@/lib/useRealtimeStream';
import { formatEffectiveRoleTitle, resolveStaffCapabilities } from '@shared/rbac';
import { resolveVenueConfig } from '@shared/venueConfig';
import type {
  DiningTable,
  DiningZone,
  GuestOrder,
  PagerTicket,
  ServiceBay,
  SmartTag,
  TableReservation,
  WaitlistEntry,
} from '@shared/schema';

type DeskTab = 'pagers' | 'bills' | 'seating';

export default function AdminFrontDeskPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const menuQuery = useManagerMenu();
  const cafe = menuQuery.data?.restaurant;

  const caps = useMemo(
    () => user?.capabilities || resolveStaffCapabilities(user?.staffRole || 'branch_manager'),
    [user?.capabilities, user?.staffRole],
  );
  const roleTitle = formatEffectiveRoleTitle(user?.staffRole, caps);

  const availableTabs = useMemo(() => {
    const list: { id: DeskTab; label: string }[] = [];
    if (caps.canIssuePagers) list.push({ id: 'pagers', label: 'Pagers & Pickup' });
    if (caps.canSettlePos) list.push({ id: 'bills', label: 'Unpaid Bills' });
    if (caps.canManageTables) list.push({ id: 'seating', label: 'Waitlist & Bookings' });
    return list.length > 0 ? list : [{ id: 'pagers' as const, label: 'Pagers & Pickup' }];
  }, [caps.canIssuePagers, caps.canSettlePos, caps.canManageTables]);

  const [selectedTab, setSelectedTab] = useState<DeskTab | null>(null);
  const activeTab: DeskTab =
    selectedTab && availableTabs.some(t => t.id === selectedTab)
      ? selectedTab
      : availableTabs[0].id;

  // Counter Pager quick issue
  const [guestName, setGuestName] = useState('');
  const [coasterId, setCoasterId] = useState('');
  const [handoffTicket, setHandoffTicket] = useState<IssuedPagerHandoff | null>(null);

  // Progressive disclosure forms for Seating tab
  const [seatingForm, setSeatingForm] = useState<'none' | 'walkin' | 'booking'>('none');
  const [wlName, setWlName] = useState('');
  const [wlParty, setWlParty] = useState(2);
  const [wlPhone, setWlPhone] = useState('');

  const [resName, setResName] = useState('');
  const [resParty, setResParty] = useState(2);
  const [resPhone, setResPhone] = useState('');
  const [resStartAt, setResStartAt] = useState(() => {
    const d = new Date(Date.now() + 30 * 60_000);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });

  const pagersQuery = useQuery<{ tickets: PagerTicket[]; bays: ServiceBay[] }>({
    queryKey: ['/api/hospitality/pagers'],
    refetchInterval: 5_000,
  });

  const ordersQuery = useQuery<{ orders: GuestOrder[]; tickets: PagerTicket[]; currency: string }>({
    queryKey: ['/api/hospitality/orders'],
    enabled: caps.canSettlePos,
    refetchInterval: 6_000,
  });

  const floorQuery = useQuery<{
    zones: DiningZone[];
    tables: DiningTable[];
    reservations: TableReservation[];
    waitlist: WaitlistEntry[];
  }>({
    queryKey: ['/api/hospitality/floor'],
    enabled: caps.canManageTables,
    refetchInterval: 6_000,
  });

  const tagsQuery = useQuery<{ tags: SmartTag[] }>({
    queryKey: ['/api/hospitality/smart-tags'],
    refetchInterval: 8_000,
  });

  useRealtimeStream('/api/hospitality/stream', () => {
    void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/pagers'] });
    if (caps.canSettlePos) void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/orders'] });
    if (caps.canManageTables) void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/floor'] });
    void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/smart-tags'] });
  });

  const idleCoasters = useMemo(
    () =>
      (tagsQuery.data?.tags || []).filter(
        t => t.targetType === 'reusable_pager' && t.isActive && !t.activeTicketId,
      ),
    [tagsQuery.data?.tags],
  );

  const issuePagerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/hospitality/pagers/issue', {
        mode: 'auto_number',
        customerName: guestName.trim() || null,
        channel: 'counter_pickup',
        estimatedPrepMins: resolveVenueConfig(cafe?.venueConfig).defaultPrepMins,
        smartTagId: coasterId || null,
      });
      return res.json();
    },
    onSuccess: data => {
      const usedCoaster = Boolean(coasterId);
      setGuestName('');
      setCoasterId('');
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/pagers'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/smart-tags'] });
      if (!usedCoaster && data.ticket?.trackingToken) {
        setHandoffTicket({
          id: data.ticket.id,
          ticketCode: data.ticket.ticketCode,
          trackingToken: data.ticket.trackingToken,
          customerName: data.ticket.customerName,
        });
      }
      toast({
        title: `Pager ${data.ticket.ticketCode} ready`,
        description: usedCoaster
          ? 'Hand the NFC coaster to the guest.'
          : 'Ask the guest to scan their private QR code.',
      });
    },
    onError: (e: Error) => toast({ title: 'Could not create pager', description: e.message, variant: 'destructive' }),
  });

  const transitionPagerMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'rebuzz' | 'collected' }) => {
      const res = await apiRequest('POST', `/api/hospitality/pagers/${id}/transition`, { action });
      return res.json();
    },
    onSuccess: (_d, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/pagers'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/smart-tags'] });
      toast({ title: vars.action === 'collected' ? 'Marked picked up' : 'Guest phone rung again' });
    },
    onError: (e: Error) => toast({ title: 'Could not update pager', description: e.message, variant: 'destructive' }),
  });

  const settleOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest('POST', `/api/hospitality/orders/${orderId}/payment-status`, {
        paymentStatus: 'paid',
      });
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/orders'] });
      toast({ title: 'Bill marked Paid' });
    },
    onError: (e: Error) => toast({ title: 'Could not settle payment', description: e.message, variant: 'destructive' }),
  });

  const addWaitlistMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/hospitality/waitlist', {
        guestName: wlName.trim(),
        partySize: wlParty,
        guestPhone: wlPhone.trim() || null,
      });
      return res.json();
    },
    onSuccess: data => {
      setWlName('');
      setWlPhone('');
      setSeatingForm('none');
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/floor'] });
      toast({ title: `${data.entry.guestName} (${data.entry.ticketCode}) added to waitlist` });
    },
    onError: (e: Error) => toast({ title: 'Could not add walk-in', description: e.message, variant: 'destructive' }),
  });

  const waitlistActionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'ready' | 'rebuzz' | 'seated' }) => {
      const res = await apiRequest('POST', `/api/hospitality/waitlist/${id}/action`, { action });
      return res.json();
    },
    onSuccess: (_d, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/floor'] });
      toast({ title: vars.action === 'seated' ? 'Party seated' : 'Guest notified table is ready' });
    },
    onError: (e: Error) => toast({ title: 'Waitlist update failed', description: e.message, variant: 'destructive' }),
  });

  const createReservationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/hospitality/reservations', {
        guestName: resName.trim(),
        guestPhone: resPhone.trim() || null,
        partySize: resParty,
        startAt: new Date(resStartAt).toISOString(),
      });
      return res.json();
    },
    onSuccess: data => {
      setResName('');
      setResPhone('');
      setSeatingForm('none');
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/floor'] });
      toast({ title: `Table reserved for ${data.reservation.guestName}` });
    },
    onError: (e: Error) => toast({ title: 'Could not save booking', description: e.message, variant: 'destructive' }),
  });

  const reservationStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'seated' | 'completed' }) => {
      const res = await apiRequest('POST', `/api/hospitality/reservations/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/floor'] });
      toast({ title: 'Reservation updated' });
    },
  });

  const tickets = pagersQuery.data?.tickets || [];
  const baysById = useMemo(
    () => new Map((pagersQuery.data?.bays || []).map(b => [b.id, b])),
    [pagersQuery.data?.bays],
  );
  const activeTickets = useMemo(
    () => tickets.filter(t => ['ready', 'preparing', 'waiting'].includes(t.status)),
    [tickets],
  );
  const readyTickets = useMemo(() => activeTickets.filter(t => t.status === 'ready'), [activeTickets]);
  const arrivedCurbside = useMemo(
    () => activeTickets.filter(t => t.etaStatus === 'arrived'),
    [activeTickets],
  );
  const unpaidVenueOrders = useMemo(
    () => (ordersQuery.data?.orders || []).filter(o => o.paymentStatus === 'pay_at_venue'),
    [ordersQuery.data?.orders],
  );
  const activeWaitlist = useMemo(
    () => (floorQuery.data?.waitlist || []).filter(w => ['waiting', 'ready'].includes(w.status)),
    [floorQuery.data?.waitlist],
  );
  const upcomingReservations = useMemo(
    () =>
      (floorQuery.data?.reservations || [])
        .filter(r => ['confirmed', 'seated'].includes(r.status))
        .slice(0, 8),
    [floorQuery.data?.reservations],
  );
  const currency = ordersQuery.data?.currency || cafe?.currency || 'QAR';

  const tabCounts: Record<DeskTab, number> = {
    pagers: activeTickets.length,
    bills: unpaidVenueOrders.length,
    seating: activeWaitlist.length + upcomingReservations.length,
  };

  return (
    <div className="space-y-6 max-w-5xl" data-testid="page-front-desk">
      {/* Clean, Scannable Page Header — One Primary Action + Customer QR Screen */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Front Desk</h1>
            <Badge variant="secondary" className="font-semibold">
              {roleTitle}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {cafe?.name ? `${cafe.name} · ` : ''}Give guest pagers, collect payment, and seat tables from one place.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            asChild
            variant="outline"
            className="min-h-11 rounded-xl cursor-pointer gap-2 flex-1 sm:flex-none"
          >
            <Link href="/admin/counter-display" data-testid="button-frontdesk-counter-screen">
              <Monitor className="w-4 h-4 text-[#6236FF]" />
              <span>Customer QR Screen</span>
            </Link>
          </Button>
          {caps.canSettlePos && (
            <Button
              asChild
              className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer gap-2 flex-1 sm:flex-none"
            >
              <Link href="/admin/orders">
                <Receipt className="w-4 h-4" />
                <span>New Counter Order</span>
              </Link>
            </Button>
          )}
        </div>
      </header>

      {/* Urgent Curbside Alert — Only visible when a car is physically waiting outside */}
      {arrivedCurbside.length > 0 && (
        <div
          role="status"
          className="rounded-2xl bg-[#C8FF42] text-[#17132E] border-2 border-[#17132E] px-4 py-3 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 text-sm">
            <Car className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span>
              <strong>
                {arrivedCurbside.length} {arrivedCurbside.length === 1 ? 'Car' : 'Cars'} Waiting Outside:
              </strong>{' '}
              <span className="font-mono font-bold">
                {arrivedCurbside
                  .map(
                    t =>
                      `${baysById.get(t.bayId || '')?.code || 'Bay'} (${t.ticketCode}${
                        t.licensePlate ? ` · ${t.licensePlate}` : ''
                      })`,
                  )
                  .join(' · ')}
              </span>
            </span>
          </div>
          <Button
            asChild
            size="sm"
            className="min-h-11 rounded-xl bg-[#17132E] text-white hover:bg-[#241E42] cursor-pointer"
          >
            <Link href="/admin/drive-thru">View Cars</Link>
          </Button>
        </div>
      )}

      {/* Focused Task Switcher (Only shown if role has more than 1 task area) */}
      {availableTabs.length > 1 && (
        <div
          role="tablist"
          aria-label="Front desk tasks"
          className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-muted/60 border w-fit max-w-full"
        >
          {availableTabs.map(tab => {
            const isSelected = activeTab === tab.id;
            const count = tabCounts[tab.id];
            const Icon =
              tab.id === 'pagers' ? BellRing : tab.id === 'bills' ? CreditCard : Users;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                data-testid={`tab-frontdesk-${tab.id}`}
                onClick={() => setSelectedTab(tab.id)}
                className={`min-h-11 px-4 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#6236FF] text-white shadow-sm'
                    : 'text-foreground/80 hover:text-foreground hover:bg-background/70'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{tab.label}</span>
                {count > 0 && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : tab.id === 'bills'
                          ? 'bg-[#EFEAFF] text-[#4B1FE0]'
                          : 'bg-background text-foreground'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* TAB 1: PAGERS & PICKUP */}
      {activeTab === 'pagers' && caps.canIssuePagers && (
        <div className="space-y-6" role="tabpanel">
          {/* Simple 1-Row Issue Bar */}
          <form
            onSubmit={e => {
              e.preventDefault();
              issuePagerMutation.mutate();
            }}
            className="rounded-2xl border bg-card p-4 sm:p-5 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold">Give Guest a Pager</h2>
              {idleCoasters.length > 0 && (
                <span className="text-xs text-muted-foreground font-mono">
                  {idleCoasters.length} NFC coasters ready
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-end">
              <div className="flex-1">
                <Label htmlFor="fd-guest-name" className="text-xs text-muted-foreground">
                  Guest Name or Receipt # (optional)
                </Label>
                <Input
                  id="fd-guest-name"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder="e.g. Sara or #104"
                  data-testid="input-frontdesk-pager-guest"
                  className="min-h-11 mt-1"
                />
              </div>

              {idleCoasters.length > 0 && (
                <div className="sm:w-52">
                  <Label htmlFor="fd-coaster" className="text-xs text-muted-foreground">
                    Method
                  </Label>
                  <select
                    id="fd-coaster"
                    className="manager-select w-full min-h-11 text-sm mt-1"
                    value={coasterId}
                    onChange={e => setCoasterId(e.target.value)}
                  >
                    <option value="">Phone QR Scan</option>
                    {idleCoasters.map(c => (
                      <option key={c.id} value={c.id}>
                        NFC Coaster · {c.tagCode}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <Button
                type="submit"
                disabled={issuePagerMutation.isPending}
                data-testid="button-frontdesk-issue-pager"
                className="min-h-11 px-6 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer gap-2 shrink-0"
              >
                <QrCode className="w-4 h-4" />
                <span>{issuePagerMutation.isPending ? 'Creating…' : 'Give Pager'}</span>
              </Button>
            </div>
          </form>

          {/* Ready for Pickup Highlight */}
          {readyTickets.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <BellRing className="w-4 h-4 text-[#6236FF]" aria-hidden="true" />
                <span>Ready on Counter — Hand to Guest ({readyTickets.length})</span>
              </h2>
              <div className="space-y-2">
                {readyTickets.map(ticket => (
                  <div
                    key={ticket.id}
                    className="rounded-2xl bg-[#17132E] text-white border-2 border-[#C8FF42] p-4 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1 rounded-xl bg-[#C8FF42] text-[#17132E] font-mono font-black text-lg">
                        {ticket.ticketCode}
                      </span>
                      <div>
                        <strong className="block text-sm font-semibold">
                          {ticket.customerName || 'Walk-In Guest'}
                        </strong>
                        <GuestPhoneStatusBadge ticket={ticket} darkSurface showUnclaimed />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setHandoffTicket({
                            id: ticket.id,
                            ticketCode: ticket.ticketCode,
                            trackingToken: ticket.trackingToken,
                            customerName: ticket.customerName,
                          })
                        }
                        className="min-h-11 rounded-xl border-white/20 bg-[#241E42] text-white hover:bg-[#312959] cursor-pointer gap-1.5"
                      >
                        <QrCode className="w-4 h-4" />
                        <span>QR</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={transitionPagerMutation.isPending}
                        onClick={() => transitionPagerMutation.mutate({ id: ticket.id, action: 'rebuzz' })}
                        className="min-h-11 rounded-xl border-white/20 bg-[#241E42] text-white hover:bg-[#312959] cursor-pointer"
                      >
                        Ring Again
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={transitionPagerMutation.isPending}
                        onClick={() => transitionPagerMutation.mutate({ id: ticket.id, action: 'collected' })}
                        className="min-h-11 rounded-xl bg-[#C8FF42] text-[#17132E] hover:bg-[#b8f230] font-extrabold cursor-pointer gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Picked Up</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* In-Progress Kitchen Queue */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-muted-foreground">
                Being Prepared ({activeTickets.length - readyTickets.length})
              </h2>
              {(user?.role === 'super_admin' ||
                user?.staffRole === 'tenant_owner' ||
                user?.staffRole === 'branch_manager') && (
                <Link href="/admin/pagers" className="text-xs font-semibold text-[#4B1FE0] hover:underline">
                  Open Full Kitchen Queue →
                </Link>
              )}
            </div>

            {activeTickets.filter(t => t.status !== 'ready').length === 0 ? (
              <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
                No active pagers waiting right now. Enter a guest name above and click <strong>Give Pager</strong>.
              </div>
            ) : (
              <div className="divide-y rounded-2xl border bg-card">
                {activeTickets
                  .filter(t => t.status !== 'ready')
                  .slice(0, 10)
                  .map(ticket => (
                    <div
                      key={ticket.id}
                      className="p-3.5 sm:px-4 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <strong className="font-mono text-base">{ticket.ticketCode}</strong>
                        <span className="text-sm font-medium">
                          {ticket.customerName || 'Walk-In Guest'}
                        </span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {ticket.status === 'preparing' ? 'In Kitchen' : 'Waiting'}
                        </Badge>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setHandoffTicket({
                            id: ticket.id,
                            ticketCode: ticket.ticketCode,
                            trackingToken: ticket.trackingToken,
                            customerName: ticket.customerName,
                          })
                        }
                        className="min-h-11 rounded-xl cursor-pointer gap-1.5"
                      >
                        <QrCode className="w-4 h-4 text-[#6236FF]" />
                        <span>Show Guest QR</span>
                      </Button>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: UNPAID BILLS (CASHIER) */}
      {activeTab === 'bills' && caps.canSettlePos && (
        <section className="space-y-4" role="tabpanel" data-testid="panel-frontdesk-cashier">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold">Bills Waiting for Payment ({unpaidVenueOrders.length})</h2>
              <p className="text-xs text-muted-foreground">
                Collect cash or card at the counter, then tap <strong>Mark Paid</strong>.
              </p>
            </div>
            <Link href="/admin/orders" className="text-xs font-semibold text-[#4B1FE0] hover:underline">
              View All Orders &amp; Receipts →
            </Link>
          </div>

          {unpaidVenueOrders.length === 0 ? (
            <div className="rounded-2xl border bg-card p-10 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 mx-auto text-[#6236FF]" aria-hidden="true" />
              <p className="font-semibold text-sm">All counter and table bills are paid</p>
              <p className="text-xs text-muted-foreground">
                New Pay-at-Venue table orders will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="divide-y rounded-2xl border bg-card">
              {unpaidVenueOrders.map(order => (
                <div
                  key={order.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="font-mono text-sm">{order.orderNumber}</strong>
                      <span className="text-sm font-semibold">
                        {order.customerName || 'Guest'}
                      </span>
                      {order.tableCode && (
                        <Badge variant="secondary" className="font-mono text-xs">
                          Table {order.tableCode}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {(order.lineItems || []).map(l => `${l.quantity}× ${l.name}`).join(', ')}
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <strong className="font-mono text-lg">
                      {order.total} {currency}
                    </strong>
                    <Button
                      type="button"
                      disabled={settleOrderMutation.isPending}
                      onClick={() => settleOrderMutation.mutate(order.id)}
                      data-testid={`button-frontdesk-settle-${order.id}`}
                      className="min-h-11 px-5 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer gap-1.5"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Mark Paid</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 3: WALK-INS & BOOKINGS (HOST / RECEPTION) */}
      {activeTab === 'seating' && caps.canManageTables && (
        <div className="space-y-6" role="tabpanel" data-testid="panel-frontdesk-reception">
          {/* Clean Action Bar — Forms stay tucked away until clicked */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={seatingForm === 'walkin' ? 'default' : 'outline'}
                onClick={() => setSeatingForm(seatingForm === 'walkin' ? 'none' : 'walkin')}
                data-testid="button-toggle-walkin-form"
                className="min-h-11 rounded-xl cursor-pointer gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Walk-In Guest</span>
              </Button>
              {(floorQuery.data?.tables?.length || 0) > 0 && (
                <Button
                  type="button"
                  variant={seatingForm === 'booking' ? 'default' : 'outline'}
                  onClick={() => setSeatingForm(seatingForm === 'booking' ? 'none' : 'booking')}
                  data-testid="button-toggle-booking-form"
                  className="min-h-11 rounded-xl cursor-pointer gap-2"
                >
                  <CalendarDays className="w-4 h-4" />
                  <span>Book a Table</span>
                </Button>
              )}
            </div>
            <Link href="/admin/tables" className="text-xs font-semibold text-[#4B1FE0] hover:underline">
              View All Tables →
            </Link>
          </div>

          {seatingForm === 'walkin' && (
            <form
              onSubmit={e => {
                e.preventDefault();
                if (wlName.trim()) addWaitlistMutation.mutate();
              }}
              className="rounded-2xl border bg-card p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">New Walk-In Party</h3>
                <button
                  type="button"
                  aria-label="Close walk-in form"
                  onClick={() => setSeatingForm('none')}
                  className="w-9 h-9 rounded-lg grid place-items-center text-muted-foreground hover:bg-muted cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid sm:grid-cols-4 gap-2.5 items-end">
                <div className="sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Guest Name *</Label>
                  <Input
                    value={wlName}
                    onChange={e => setWlName(e.target.value)}
                    placeholder="e.g. Mariam"
                    required
                    data-testid="input-frontdesk-waitlist-name"
                    className="min-h-11 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Party Size</Label>
                  <select
                    className="manager-select w-full min-h-11 text-sm mt-1"
                    value={wlParty}
                    onChange={e => setWlParty(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6, 8, 10].map(n => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? 'Guest' : 'Guests'}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="submit"
                  disabled={!wlName.trim() || addWaitlistMutation.isPending}
                  data-testid="button-frontdesk-add-waitlist"
                  className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer"
                >
                  Add to Waitlist
                </Button>
              </div>
            </form>
          )}

          {seatingForm === 'booking' && (
            <form
              onSubmit={e => {
                e.preventDefault();
                if (resName.trim()) createReservationMutation.mutate();
              }}
              className="rounded-2xl border bg-card p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">New Table Reservation</h3>
                <button
                  type="button"
                  aria-label="Close reservation form"
                  onClick={() => setSeatingForm('none')}
                  className="w-9 h-9 rounded-lg grid place-items-center text-muted-foreground hover:bg-muted cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid sm:grid-cols-4 gap-2.5 items-end">
                <div>
                  <Label className="text-xs text-muted-foreground">Guest Name *</Label>
                  <Input
                    value={resName}
                    onChange={e => setResName(e.target.value)}
                    placeholder="Caller name"
                    required
                    className="min-h-11 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Party Size</Label>
                  <select
                    className="manager-select w-full min-h-11 text-sm mt-1"
                    value={resParty}
                    onChange={e => setResParty(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6, 8, 10].map(n => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? 'Guest' : 'Guests'}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Arrival Time</Label>
                  <Input
                    type="datetime-local"
                    value={resStartAt}
                    onChange={e => setResStartAt(e.target.value)}
                    required
                    className="min-h-11 text-xs font-mono mt-1"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!resName.trim() || createReservationMutation.isPending}
                  className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer"
                >
                  Save Booking
                </Button>
              </div>
            </form>
          )}

          {/* Walk-In Waitlist */}
          <section className="space-y-2.5">
            <h2 className="text-base font-bold">Walk-In Waitlist ({activeWaitlist.length})</h2>
            {activeWaitlist.length === 0 ? (
              <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
                No walk-in guests waiting right now.
              </div>
            ) : (
              <div className="divide-y rounded-2xl border bg-card">
                {activeWaitlist.map(entry => (
                  <div
                    key={entry.id}
                    className="p-4 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="flex flex-wrap items-center gap-2.5">
                      <strong className="font-mono text-base">{entry.ticketCode}</strong>
                      <span className="font-semibold text-sm">{entry.guestName}</span>
                      <Badge variant="outline" className="text-xs">
                        {entry.partySize} {entry.partySize === 1 ? 'guest' : 'guests'}
                      </Badge>
                      {entry.status === 'ready' && (
                        <Badge className="bg-[#C8FF42] text-[#17132E] hover:bg-[#C8FF42] border-0 font-bold">
                          Notified
                        </Badge>
                      )}
                      {entry.guestResponse === 'on_my_way' && (
                        <Badge className="bg-[#EFEAFF] text-[#4B1FE0] border-0 font-bold">
                          On Their Way
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={waitlistActionMutation.isPending}
                        onClick={() =>
                          waitlistActionMutation.mutate({
                            id: entry.id,
                            action: entry.status === 'ready' ? 'rebuzz' : 'ready',
                          })
                        }
                        className="min-h-11 rounded-xl cursor-pointer gap-1.5"
                      >
                        <BellRing className="w-4 h-4 text-[#6236FF]" />
                        <span>{entry.status === 'ready' ? 'Ring Again' : 'Table Ready'}</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={waitlistActionMutation.isPending}
                        onClick={() => waitlistActionMutation.mutate({ id: entry.id, action: 'seated' })}
                        className="min-h-11 px-4 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer"
                      >
                        Seat Now
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Upcoming Reservations */}
          <section className="space-y-2.5">
            <h2 className="text-base font-bold">Upcoming Reservations ({upcomingReservations.length})</h2>
            {upcomingReservations.length === 0 ? (
              <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
                No upcoming table bookings scheduled.
              </div>
            ) : (
              <div className="divide-y rounded-2xl border bg-card">
                {upcomingReservations.map(res => (
                  <div
                    key={res.id}
                    className="p-4 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm">{res.guestName}</strong>
                        <Badge variant="outline" className="text-xs">
                          {res.partySize} {res.partySize === 1 ? 'guest' : 'guests'}
                        </Badge>
                        {res.status === 'seated' && (
                          <Badge className="bg-[#EFEAFF] text-[#4B1FE0] border-0">Seated</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground inline-flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        {new Date(res.startAt).toLocaleString('en-GB', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>

                    {res.status === 'confirmed' ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={reservationStatusMutation.isPending}
                        onClick={() => reservationStatusMutation.mutate({ id: res.id, status: 'seated' })}
                        className="min-h-11 px-4 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer"
                      >
                        Seat Party
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={reservationStatusMutation.isPending}
                        onClick={() => reservationStatusMutation.mutate({ id: res.id, status: 'completed' })}
                        className="min-h-11 rounded-xl cursor-pointer"
                      >
                        Finish Table
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <CounterPagerQrModal
        venueName={cafe?.name || 'dingzi'}
        ticket={handoffTicket}
        onClose={() => setHandoffTicket(null)}
      />
    </div>
  );
}
