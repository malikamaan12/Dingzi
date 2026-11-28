import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  BellRing,
  CalendarDays,
  Car,
  CheckCircle2,
  CreditCard,
  Plus,
  QrCode,
  Receipt,
  Users,
  Wifi,
} from 'lucide-react';
import { DingziMark } from '@/components/staff-brand';
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

export default function AdminFrontDeskPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const menuQuery = useManagerMenu();
  const cafe = menuQuery.data?.restaurant;

  const caps = useMemo(
    () => user?.capabilities || resolveStaffCapabilities(user?.staffRole || 'branch_manager'),
    [user?.capabilities, user?.staffRole],
  );
  const deskTitleBadge = formatEffectiveRoleTitle(user?.staffRole, caps);

  // Quick Counter Pager + Optional Reusable Coaster Issue State
  const [guestName, setGuestName] = useState('');
  const [channel, setChannel] = useState<'counter_pickup' | 'dine_in' | 'curbside'>('counter_pickup');
  const [coasterId, setCoasterId] = useState('');

  // Quick Walk-In Waitlist Form State
  const [wlName, setWlName] = useState('');
  const [wlParty, setWlParty] = useState(2);
  const [wlPhone, setWlPhone] = useState('');

  // Quick Phone / Desk Reservation Form State
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
    void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/orders'] });
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
        channel,
        estimatedPrepMins: resolveVenueConfig(cafe?.venueConfig).defaultPrepMins,
        smartTagId: coasterId || null,
      });
      return res.json();
    },
    onSuccess: data => {
      setGuestName('');
      setCoasterId('');
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/pagers'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/smart-tags'] });
      toast({
        title: `Issued Pager ${data.ticket.ticketCode}`,
        description: coasterId ? 'Bound to NFC/QR coaster and live in queue.' : 'Live virtual pager issued.',
      });
    },
    onError: (e: Error) => toast({ title: 'Could not issue pager', description: e.message, variant: 'destructive' }),
  });

  const transitionPagerMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'rebuzz' | 'collected' }) => {
      const res = await apiRequest('POST', `/api/hospitality/pagers/${id}/transition`, { action });
      return res.json();
    },
    onSuccess: (_d, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/pagers'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/smart-tags'] });
      toast({ title: vars.action === 'collected' ? 'Order marked collected' : 'Guest buzzed again' });
    },
    onError: (e: Error) => toast({ title: 'Pager update failed', description: e.message, variant: 'destructive' }),
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
      toast({ title: 'Pay-at-Venue order settled as Paid' });
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
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/floor'] });
      toast({ title: `Added ${data.entry.ticketCode} to Walk-In Waitlist` });
    },
    onError: (e: Error) => toast({ title: 'Could not add walk-in party', description: e.message, variant: 'destructive' }),
  });

  const waitlistActionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'ready' | 'rebuzz' | 'seated' }) => {
      const res = await apiRequest('POST', `/api/hospitality/waitlist/${id}/action`, { action });
      return res.json();
    },
    onSuccess: (_d, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/floor'] });
      toast({ title: vars.action === 'seated' ? 'Party seated' : 'Guest table-ready alert sent!' });
    },
    onError: (e: Error) => toast({ title: 'Waitlist update failed', description: e.message, variant: 'destructive' }),
  });

  const createReservationMutation = useMutation({
    mutationFn: async () => {
      const isoStart = new Date(resStartAt).toISOString();
      const res = await apiRequest('POST', '/api/hospitality/reservations', {
        guestName: resName.trim(),
        guestPhone: resPhone.trim() || null,
        partySize: resParty,
        startAt: isoStart,
      });
      return res.json();
    },
    onSuccess: data => {
      setResName('');
      setResPhone('');
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/floor'] });
      toast({ title: `Reserved table for ${data.reservation.guestName}` });
    },
    onError: (e: Error) => toast({ title: 'Could not create reservation', description: e.message, variant: 'destructive' }),
  });

  const reservationStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'seated' | 'completed' }) => {
      const res = await apiRequest('POST', `/api/hospitality/reservations/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/floor'] });
      toast({ title: 'Reservation status updated' });
    },
  });

  const tickets = pagersQuery.data?.tickets || [];
  const baysById = useMemo(
    () => new Map((pagersQuery.data?.bays || []).map(b => [b.id, b])),
    [pagersQuery.data?.bays],
  );
  const readyTickets = tickets.filter(t => t.status === 'ready');
  const arrivedCurbside = tickets.filter(
    t => ['waiting', 'preparing', 'ready'].includes(t.status) && t.etaStatus === 'arrived',
  );
  const unpaidVenueOrders = (ordersQuery.data?.orders || []).filter(o => o.paymentStatus === 'pay_at_venue');
  const activeWaitlist = (floorQuery.data?.waitlist || []).filter(w =>
    ['waiting', 'ready'].includes(w.status),
  );
  const upcomingReservations = (floorQuery.data?.reservations || [])
    .filter(r => ['confirmed', 'seated'].includes(r.status))
    .slice(0, 6);
  const currency = ordersQuery.data?.currency || cafe?.currency || 'QAR';

  return (
    <div className="space-y-6 max-w-[1500px]" data-testid="page-front-desk">
      {/* Front-of-House Reception & Cashier Header */}
      <section className="rounded-3xl bg-[#17132E] text-white border border-[#241E42] p-5 sm:p-7 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <DingziMark size={34} />
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C8FF42] text-[#17132E] text-xs font-extrabold">
                {deskTitleBadge} Desk
              </span>
              {cafe?.name && (
                <span className="px-3 py-1 rounded-full bg-[#241E42] text-white/85 text-xs font-semibold">
                  {cafe.name}
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight">
              Reception, Host Stand &amp; Counter Desk
            </h1>
            <p className="text-sm text-white/75 max-w-2xl">
              Welcome walk-in guests, book phone reservations, issue virtual pagers or NFC coasters, and settle Pay-at-Venue orders according to your assigned terminal permissions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {caps.canSettlePos && (
              <Button asChild className="min-h-11 rounded-2xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-bold cursor-pointer gap-1.5">
                <Link href="/admin/orders">
                  <Receipt className="w-4 h-4" />
                  <span>Counter POS Entry</span>
                </Link>
              </Button>
            )}
            {caps.canManageTables && (
              <Button asChild variant="outline" className="min-h-11 rounded-2xl border-white/20 bg-[#241E42] text-white hover:bg-[#312959] cursor-pointer gap-1.5">
                <Link href="/admin/tables">
                  <CalendarDays className="w-4 h-4" />
                  <span>Full Floor Map</span>
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" className="min-h-11 rounded-2xl border-white/20 bg-[#241E42] text-white hover:bg-[#312959] cursor-pointer gap-1.5">
              <Link href="/admin/pagers">
                <BellRing className="w-4 h-4" />
                <span>All Pagers</span>
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Arrived Curbside Runner Strip */}
      {arrivedCurbside.length > 0 && (
        <section className="rounded-2xl bg-[#C8FF42] text-[#17132E] border-2 border-[#17132E] p-4 flex flex-wrap items-center justify-between gap-3" role="status">
          <div className="flex items-center gap-2.5">
            <Car className="w-5 h-5 shrink-0" />
            <div className="text-sm">
              <strong className="font-display font-extrabold">
                {arrivedCurbside.length} Curbside {arrivedCurbside.length === 1 ? 'Vehicle' : 'Vehicles'} Waiting Outside:
              </strong>{' '}
              <span className="font-mono font-bold">
                {arrivedCurbside
                  .map(t => `${baysById.get(t.bayId || '')?.code || 'BAY'} (${t.ticketCode}${t.licensePlate ? ` · ${t.licensePlate}` : ''})`)
                  .join(' · ')}
              </span>
            </div>
          </div>
          <Button asChild size="sm" className="min-h-11 rounded-xl bg-[#17132E] text-white hover:bg-[#241E42] cursor-pointer">
            <Link href="/admin/drive-thru">Open Bay Board</Link>
          </Button>
        </section>
      )}

      {/* Adaptive Workspace Columns */}
      <div className="grid lg:grid-cols-12 gap-5">
        {/* Left Column: Pager / NFC Coaster Issuer + Cashier Settlement */}
        <div className={caps.canManageTables ? 'lg:col-span-6 space-y-5' : 'lg:col-span-12 space-y-5'}>
          {caps.canIssuePagers && (
            <section className="rounded-3xl border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-[#6236FF]" />
                  <h2 className="text-lg font-display font-bold">Issue Counter Pager / Coaster</h2>
                </div>
                <Badge variant="outline" className="font-mono text-xs">
                  {idleCoasters.length} coasters idle
                </Badge>
              </div>

              <form
                onSubmit={e => {
                  e.preventDefault();
                  issuePagerMutation.mutate();
                }}
                className="grid sm:grid-cols-3 gap-3 items-end"
              >
                <div>
                  <Label className="text-xs">Guest Name / Receipt</Label>
                  <Input
                    value={guestName}
                    onChange={e => setGuestName(e.target.value)}
                    placeholder="Walk-In Guest"
                    data-testid="input-frontdesk-pager-guest"
                    className="min-h-11"
                  />
                </div>
                <div>
                  <Label className="text-xs">Service Channel</Label>
                  <select
                    className="manager-select w-full min-h-11 text-sm"
                    value={channel}
                    onChange={e => setChannel(e.target.value as any)}
                  >
                    <option value="counter_pickup">Counter Pickup</option>
                    <option value="dine_in">Dine-In Table</option>
                    <option value="curbside">Curbside Pickup</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Bind NFC Coaster (optional)</Label>
                  <select
                    className="manager-select w-full min-h-11 text-sm font-mono"
                    value={coasterId}
                    onChange={e => setCoasterId(e.target.value)}
                  >
                    <option value="">Browser QR Only</option>
                    {idleCoasters.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.tagCode}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="submit"
                  disabled={issuePagerMutation.isPending}
                  data-testid="button-frontdesk-issue-pager"
                  className="sm:col-span-3 min-h-12 rounded-2xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-bold cursor-pointer gap-2"
                >
                  <Wifi className="w-4 h-4" />
                  <span>{issuePagerMutation.isPending ? 'Issuing…' : 'Issue Auto Pager Ticket'}</span>
                </Button>
              </form>

              {/* Ready on Pass — Counter Handoff */}
              <div className="pt-3 border-t space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <span>Ready for Guest Pickup ({readyTickets.length})</span>
                </div>
                {readyTickets.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">
                    No tickets waiting on the pickup pass right now.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {readyTickets.map(ticket => (
                      <div
                        key={ticket.id}
                        className="rounded-2xl bg-[#17132E] text-white border border-[#C8FF42] p-3.5 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div>
                          <span className="font-mono font-extrabold text-lg text-[#C8FF42]">
                            {ticket.ticketCode}
                          </span>
                          <span className="text-xs text-white/80 ms-2">
                            {ticket.customerName || 'Walk-In Guest'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={transitionPagerMutation.isPending}
                            onClick={() => transitionPagerMutation.mutate({ id: ticket.id, action: 'rebuzz' })}
                            className="min-h-11 rounded-xl border-white/20 bg-[#241E42] text-white hover:bg-[#312959] cursor-pointer"
                          >
                            Re-Buzz
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={transitionPagerMutation.isPending}
                            onClick={() => transitionPagerMutation.mutate({ id: ticket.id, action: 'collected' })}
                            className="min-h-11 rounded-xl bg-[#C8FF42] text-[#17132E] hover:bg-[#C8FF42]/90 font-extrabold cursor-pointer gap-1"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Handed Off</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Pay-at-Venue Cashier Settlement */}
          {caps.canSettlePos && (
            <section className="rounded-3xl border bg-card p-5 space-y-3.5" data-testid="panel-frontdesk-cashier">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-[#6236FF]" />
                  <h2 className="text-lg font-display font-bold">Pay-at-Venue Cashier Queue</h2>
                </div>
                <Badge className="bg-[#EFEAFF] text-[#4B1FE0] border border-[#E5E2F2] font-mono">
                  {unpaidVenueOrders.length} Unsettled
                </Badge>
              </div>

              {unpaidVenueOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3">
                  All counter and table checks are settled.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {unpaidVenueOrders.slice(0, 8).map(order => (
                    <div
                      key={order.id}
                      className="rounded-2xl border p-3.5 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <strong className="font-mono text-sm">{order.orderNumber}</strong>
                          <span className="text-xs text-muted-foreground truncate">
                            {order.customerName || 'Guest'}
                            {order.tableCode ? ` · Table ${order.tableCode}` : ''}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {(order.lineItems || []).map(l => `${l.quantity}× ${l.name}`).join(', ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <strong className="font-mono text-sm">
                          {order.total} {currency}
                        </strong>
                        <Button
                          type="button"
                          size="sm"
                          disabled={settleOrderMutation.isPending}
                          onClick={() => settleOrderMutation.mutate(order.id)}
                          data-testid={`button-frontdesk-settle-${order.id}`}
                          className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer"
                        >
                          Mark Paid
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Right Column: Reception Walk-In Waitlist + Phone/Walk-In Reservations */}
        {caps.canManageTables && (
          <div className="lg:col-span-6 space-y-5" data-testid="panel-frontdesk-reception">
            {/* Walk-In Waitlist Stand */}
            <section className="rounded-3xl border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#6236FF]" />
                  <h2 className="text-lg font-display font-bold">Walk-In Waitlist Stand</h2>
                </div>
                <Badge variant="outline" className="font-mono text-xs">
                  {activeWaitlist.length} waiting
                </Badge>
              </div>

              <form
                onSubmit={e => {
                  e.preventDefault();
                  if (wlName.trim()) addWaitlistMutation.mutate();
                }}
                className="grid sm:grid-cols-4 gap-2.5 items-end"
              >
                <div className="sm:col-span-2">
                  <Label className="text-xs">Guest Name *</Label>
                  <Input
                    value={wlName}
                    onChange={e => setWlName(e.target.value)}
                    placeholder="Party name"
                    required
                    data-testid="input-frontdesk-waitlist-name"
                    className="min-h-11"
                  />
                </div>
                <div>
                  <Label className="text-xs">Covers</Label>
                  <select
                    className="manager-select w-full min-h-11 text-sm font-mono"
                    value={wlParty}
                    onChange={e => setWlParty(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6, 8, 10].map(n => (
                      <option key={n} value={n}>
                        {n} Guests
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="submit"
                  disabled={!wlName.trim() || addWaitlistMutation.isPending}
                  data-testid="button-frontdesk-add-waitlist"
                  className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer gap-1"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add</span>
                </Button>
              </form>

              {activeWaitlist.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No walk-in parties waiting right now.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {activeWaitlist.map(entry => (
                    <div
                      key={entry.id}
                      className="rounded-2xl border p-3.5 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="font-mono text-base">{entry.ticketCode}</strong>
                          <span className="font-semibold text-sm">{entry.guestName}</span>
                          <Badge variant="outline" className="font-mono text-xs">
                            Party of {entry.partySize}
                          </Badge>
                          {entry.guestResponse === 'on_my_way' && (
                            <Badge className="bg-[#C8FF42] text-[#17132E] font-bold">On My Way</Badge>
                          )}
                        </div>
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
                          className="min-h-11 rounded-xl cursor-pointer gap-1"
                        >
                          <BellRing className="w-4 h-4" />
                          <span>{entry.status === 'ready' ? 'Re-Buzz' : 'Buzz Ready'}</span>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={waitlistActionMutation.isPending}
                          onClick={() => waitlistActionMutation.mutate({ id: entry.id, action: 'seated' })}
                          className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white cursor-pointer"
                        >
                          Seat
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Phone & Walk-In Table Reservations */}
            <section className="rounded-3xl border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-[#6236FF]" />
                  <h2 className="text-lg font-display font-bold">Phone &amp; Seated Reservations</h2>
                </div>
                <Link href="/admin/tables" className="text-xs font-semibold text-[#4B1FE0] hover:underline">
                  Manage Floor →
                </Link>
              </div>

              {(floorQuery.data?.tables?.length || 0) > 0 && (
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    if (resName.trim()) createReservationMutation.mutate();
                  }}
                  className="grid sm:grid-cols-4 gap-2.5 items-end pb-3 border-b"
                >
                  <div>
                    <Label className="text-xs">Guest Name *</Label>
                    <Input
                      value={resName}
                      onChange={e => setResName(e.target.value)}
                      placeholder="Caller name"
                      required
                      className="min-h-11"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Covers</Label>
                    <select
                      className="manager-select w-full min-h-11 text-sm font-mono"
                      value={resParty}
                      onChange={e => setResParty(Number(e.target.value))}
                    >
                      {[1, 2, 3, 4, 5, 6, 8, 10].map(n => (
                        <option key={n} value={n}>
                          {n} Guests
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Arrival Time</Label>
                    <Input
                      type="datetime-local"
                      value={resStartAt}
                      onChange={e => setResStartAt(e.target.value)}
                      required
                      className="min-h-11 text-xs font-mono"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={!resName.trim() || createReservationMutation.isPending}
                    className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Book</span>
                  </Button>
                </form>
              )}

              {upcomingReservations.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3">
                  No active confirmed or seated reservations scheduled right now.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {upcomingReservations.map(res => (
                    <div
                      key={res.id}
                      className="rounded-2xl border p-3.5 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-sm">{res.guestName}</strong>
                          <Badge variant="outline" className="font-mono text-xs">
                            {res.partySize} covers
                          </Badge>
                          <Badge variant={res.status === 'seated' ? 'default' : 'secondary'}>
                            {res.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">
                          {new Date(res.startAt).toLocaleString('en-GB', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <div>
                        {res.status === 'confirmed' ? (
                          <Button
                            type="button"
                            size="sm"
                            disabled={reservationStatusMutation.isPending}
                            onClick={() => reservationStatusMutation.mutate({ id: res.id, status: 'seated' })}
                            className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white cursor-pointer"
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
                            Clear Table
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
