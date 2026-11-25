import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  CheckSquare,
  ChefHat,
  Clock,
  CreditCard,
  ExternalLink,
  Flame,
  PauseCircle,
  PlayCircle,
  QrCode,
  Receipt,
  RotateCcw,
  Square,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useManagerMenu } from '@/lib/managerMenu';
import { useToast } from '@/hooks/use-toast';
import { playStaffArrivalChime } from '@/lib/pagerAudio';
import { useRealtimeStream } from '@/lib/useRealtimeStream';
import { LocalQrBox } from '@/components/hospitality/LocalQrBox';
import { subscribeStaffLockScreenPush } from '@/lib/mobileBridge';
import { publicExperienceOrigin } from '@shared/menuIdentity';

interface LastBumpState {
  id: string;
  ticketCode: string;
  action: 'ready' | 'collected' | 'no_show';
  previousStatus: 'waiting' | 'preparing' | 'ready';
  expiresAt: number;
}

export default function AdminPagersPage() {
  const { toast } = useToast();
  const menuQuery = useManagerMenu();
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [prepMins, setPrepMins] = useState(8);
  const [selectedCoasterId, setSelectedCoasterId] = useState('');
  const [issuedQrTicket, setIssuedQrTicket] = useState<any | null>(null);
  const [kioskMode, setKioskMode] = useState(false);
  const [channelFilter, setChannelFilter] = useState<'all' | 'orders' | 'curbside' | 'counter'>('all');
  const [lastBump, setLastBump] = useState<LastBumpState | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 3000);
    return () => window.clearInterval(timer);
  }, []);

  const queueQuery = useQuery<{ tickets: any[]; orders: any[]; bays: any[]; coasters?: any[] }>({
    queryKey: ['/api/hospitality/pagers'],
    refetchInterval: 5000,
  });

  useRealtimeStream('/api/hospitality/stream', ev => {
    void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/pagers'] });
    if (ev.type === 'order.created' || ev.type === 'order.paid' || ev.type === 'curbside.arrived') {
      playStaffArrivalChime();
    }
  });

  const issueMutation = useMutation({
    mutationFn: async (mode: 'auto_number' | 'pos_invoice') => {
      const res = await apiRequest('POST', '/api/hospitality/pagers/issue', {
        mode,
        invoiceNumber: mode === 'pos_invoice' ? invoiceNumber : undefined,
        customerName: customerName.trim() || undefined,
        estimatedPrepMins: prepMins,
        smartTagId: selectedCoasterId || undefined,
      });
      return res.json();
    },
    onSuccess: data => {
      setInvoiceNumber('');
      setCustomerName('');
      setSelectedCoasterId('');
      setIssuedQrTicket(data.ticket);
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/pagers'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/smart-tags'] });
      toast({
        title: data.coaster
          ? `Issued ${data.ticket.ticketCode} · Bound to ${data.coaster.tagCode}`
          : `Issued Pager ${data.ticket.ticketCode}`,
        description: data.coaster
          ? 'Hand the NFC/QR coaster to the guest — tapping opens their live order pass.'
          : 'Have the guest scan the QR code to activate live phone alerts.',
      });
    },
    onError: (e: Error) => toast({ title: 'Could not issue pager', description: e.message, variant: 'destructive' }),
  });

  const transitionMutation = useMutation({
    mutationFn: async ({
      id,
      action,
      targetStatus,
    }: {
      id: string;
      action: string;
      targetStatus?: 'waiting' | 'preparing' | 'ready';
      ticketCode?: string;
      previousStatus?: 'waiting' | 'preparing' | 'ready';
    }) => {
      const payload: Record<string, unknown> = { action };
      if (targetStatus) payload.targetStatus = targetStatus;
      const res = await apiRequest('POST', `/api/hospitality/pagers/${id}/transition`, payload);
      return res.json();
    },
    onSuccess: (data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/pagers'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/smart-tags'] });

      if (
        (vars.action === 'collected' || vars.action === 'no_show' || vars.action === 'ready') &&
        vars.ticketCode &&
        vars.previousStatus
      ) {
        setLastBump({
          id: vars.id,
          ticketCode: vars.ticketCode,
          action: vars.action,
          previousStatus: vars.previousStatus,
          expiresAt: Date.now() + 30_000,
        });
      }

      if (vars.action === 'ready' || vars.action === 'rebuzz') {
        toast({ title: 'Guest buzzed!', description: 'Instant audio & vibration sent to guest phone.' });
      } else if (vars.action === 'recall') {
        setLastBump(prev => (prev?.id === vars.id ? null : prev));
        toast({
          title: `Recalled Ticket ${data.ticket?.ticketCode || ''}`,
          description: data.reboundCoaster
            ? `Restored to ${data.ticket.status.toUpperCase()} and re-attached ${data.reboundCoaster.tagCode}.`
            : `Restored to ${data.ticket?.status?.toUpperCase() || 'active queue'}.`,
        });
      }
    },
    onError: (e: Error) => toast({ title: 'Action blocked', description: e.message, variant: 'destructive' }),
  });

  const toggleLineItemMutation = useMutation({
    mutationFn: async ({
      ticketId,
      lineIndex,
      prepared,
    }: {
      ticketId: string;
      orderId: string;
      lineIndex: number;
      prepared: boolean;
    }) => {
      const res = await apiRequest(
        'POST',
        `/api/hospitality/pagers/${ticketId}/line-items/${lineIndex}/toggle`,
        { prepared },
      );
      return res.json();
    },
    onMutate: async vars => {
      await queryClient.cancelQueries({ queryKey: ['/api/hospitality/pagers'] });
      const previous = queryClient.getQueryData<any>(['/api/hospitality/pagers']);
      if (previous) {
        queryClient.setQueryData(['/api/hospitality/pagers'], {
          ...previous,
          tickets: (previous.tickets || []).map((t: any) =>
            t.id === vars.ticketId && t.status === 'waiting' && vars.prepared
              ? { ...t, status: 'preparing' }
              : t,
          ),
          orders: (previous.orders || []).map((o: any) =>
            o.id === vars.orderId
              ? {
                  ...o,
                  lineItems: (o.lineItems || []).map((li: any, idx: number) =>
                    idx === vars.lineIndex ? { ...li, prepared: vars.prepared } : li,
                  ),
                }
              : o,
          ),
        });
      }
      return { previous };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['/api/hospitality/pagers'], ctx.previous);
      }
      toast({ title: 'Could not update item prep state', description: e.message, variant: 'destructive' });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/pagers'] });
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: async ({ id, isAvailable }: { id: string; isAvailable: boolean }) => {
      const res = await apiRequest('POST', `/api/hospitality/items/${id}/snooze`, { isAvailable });
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/manager-menu'] });
      toast({ title: 'Item stock status updated' });
    },
  });

  const snoozeModifierMutation = useMutation({
    mutationFn: async ({ itemId, optionId, isAvailable }: { itemId: string; optionId: string; isAvailable: boolean }) => {
      const res = await apiRequest('POST', `/api/hospitality/items/${itemId}/modifiers/${optionId}/snooze`, { isAvailable });
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/manager-menu'] });
      toast({ title: 'Modifier availability updated' });
    },
  });

  const tickets = queueQuery.data?.tickets || [];
  const coasters = queueQuery.data?.coasters || [];
  const ordersById = new Map((queueQuery.data?.orders || []).map(o => [o.id, o]));
  const baysById = new Map((queueQuery.data?.bays || []).map(b => [b.id, b]));
  const allActiveTickets = tickets.filter(t => ['waiting', 'preparing', 'ready'].includes(t.status));
  const activeTicketIdSet = new Set(allActiveTickets.map(t => t.id));
  const idleCoasters = coasters.filter(c => !c.activeTicketId || !activeTicketIdSet.has(c.activeTicketId));
  const coasterByTicketId = new Map(
    coasters.filter(c => c.activeTicketId && activeTicketIdSet.has(c.activeTicketId)).map(c => [c.activeTicketId, c]),
  );
  const publicBase = publicExperienceOrigin(typeof window !== 'undefined' ? window.location.origin : '');
  const activeTickets = allActiveTickets.filter(t => {
    if (channelFilter === 'orders') return Boolean(t.orderId);
    if (channelFilter === 'curbside') return Boolean(t.bayId || t.licensePlate || t.source === 'curbside');
    if (channelFilter === 'counter') return t.source === 'auto_number' || t.source === 'pos_invoice';
    return true;
  });
  const recentCompleted = tickets
    .filter(t => ['collected', 'no_show'].includes(t.status))
    .slice(-12)
    .reverse();

  const visibleLastBump = lastBump && lastBump.expiresAt > now ? lastBump : null;

  function slaBadge(queuedAt: string) {
    const elapsedMins = Math.max(0, Math.floor((now - new Date(queuedAt).getTime()) / 60_000));
    if (elapsedMins >= 15) {
      return {
        elapsedMins,
        className: 'bg-red-100 text-red-900 border-red-300',
        icon: Flame,
        label: `${elapsedMins}m · Overdue`,
      };
    }
    if (elapsedMins >= 8) {
      return {
        elapsedMins,
        className: 'bg-amber-100 text-amber-900 border-amber-300',
        icon: AlertTriangle,
        label: `${elapsedMins}m · Approaching SLA`,
      };
    }
    return {
      elapsedMins,
      className: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      icon: Clock,
      label: `${elapsedMins}m · On Track`,
    };
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="manager-eyebrow">BARISTA &amp; COUNTER OPERATIONS</p>
          <h1 className="text-2xl sm:text-3xl font-bold">Live Virtual Pager &amp; Order Queue</h1>
          <p className="text-sm text-muted-foreground">
            Check off individual items as they brew or cook, buzz guest phones in under 250 ms, and recall bumped tickets in one tap.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm w-full sm:w-auto" role="status" aria-atomic="true">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 cursor-pointer flex-1 sm:flex-none"
            onClick={async () => {
              const res = await subscribeStaffLockScreenPush();
              toast({
                title: res.ok ? 'Staff Lock-Screen Push Armed' : 'Push Unavailable',
                description: res.ok ? 'This device will chime on new orders & bay arrivals.' : res.reason,
                variant: res.ok ? 'default' : 'destructive',
              });
            }}
          >
            Arm Device Push
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-11 cursor-pointer flex-1 sm:flex-none"
            onClick={() => setKioskMode(v => !v)}
          >
            {kioskMode ? 'Exit Counter Kiosk' : 'Counter QR Kiosk Display'}
          </Button>
          <Badge variant="secondary" className="px-3 py-1.5 text-sm">
            Active Queue: {activeTickets.length}
          </Badge>
        </div>
      </div>

      {/* Instant 1-Tap Undo Last Bump Banner */}
      {visibleLastBump && (
        <div
          role="status"
          aria-live="polite"
          data-testid="banner-undo-last-bump"
          className="rounded-2xl border-2 border-[#6236FF]/35 bg-[#EFEAFF] text-[#17132E] px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-sm"
        >
          <div className="flex items-center gap-2.5 text-sm">
            <RotateCcw className="w-4 h-4 text-[#4B1FE0] shrink-0" aria-hidden="true" />
            <span>
              Ticket <strong className="font-mono font-black">{visibleLastBump.ticketCode}</strong> marked{' '}
              <strong className="uppercase">{visibleLastBump.action.replace('_', '-')}</strong>.
            </span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              size="sm"
              data-testid="button-undo-last-bump"
              disabled={transitionMutation.isPending}
              onClick={() =>
                transitionMutation.mutate({
                  id: visibleLastBump.id,
                  action: 'recall',
                  targetStatus: visibleLastBump.previousStatus,
                })
              }
              className="min-h-11 flex-1 sm:flex-none rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Undo · Recall {visibleLastBump.ticketCode}</span>
            </Button>
            <button
              type="button"
              aria-label="Dismiss undo notice"
              onClick={() => setLastBump(null)}
              className="w-11 h-11 rounded-xl border border-[#4B1FE0]/20 hover:bg-white/70 grid place-items-center text-[#4B1FE0] cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {kioskMode && (
        <section className="rounded-3xl bg-[#17132E] text-white p-8 text-center space-y-5 shadow-2xl border-2 border-[#241E42]">
          <p className="text-xs uppercase tracking-[0.25em] text-[#C8FF42] font-extrabold">
            Dingzi · Counter Virtual Pager Kiosk
          </p>
          {issuedQrTicket || activeTickets[activeTickets.length - 1] ? (
            (() => {
              const latest = issuedQrTicket || activeTickets[activeTickets.length - 1];
              return (
                <div className="space-y-4">
                  <div className="text-6xl font-black font-mono text-[#C8FF42]">{latest.ticketCode}</div>
                  <p className="text-white/85 text-base max-w-md mx-auto">
                    Scan with your phone camera — your phone will ring &amp; vibrate even when locked as soon as your order is ready!
                  </p>
                  <div className="grid place-items-center py-2">
                    <LocalQrBox url={`${publicBase}/pager/${latest.trackingToken}`} size={240} />
                  </div>
                </div>
              );
            })()
          ) : (
            <p className="text-white/70 py-8">Tap &ldquo;New Auto Pager&rdquo; below to display a live QR code for the next guest.</p>
          )}
        </section>
      )}

      {/* Dual Pager Issuer (1-Tap Auto Number & Manual POS Receipt Link) */}
      <section className="grid lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 manager-panel p-5 flex flex-col justify-between gap-4">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              1-Tap Auto Pager (POS-Free Kiosks &amp; Carts)
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Issues the next sequential daily code (`A-001`, `A-002`…) and opens a scannable QR for the guest.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_6rem_auto] gap-2.5 items-end">
            <div className="grid grid-cols-[1fr_5.5rem] sm:contents gap-2">
              <div>
                <Label className="text-xs">Guest Name (optional)</Label>
                <Input
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="e.g. Ahmad"
                  className="h-11"
                />
              </div>
              <div>
                <Label className="text-xs">Est. Min</Label>
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={prepMins}
                  onChange={e => setPrepMins(Number(e.target.value) || 8)}
                  className="h-11"
                />
              </div>
            </div>
            <Button
              type="button"
              data-testid="button-issue-auto-pager"
              onClick={() => issueMutation.mutate('auto_number')}
              disabled={issueMutation.isPending}
              className="w-full sm:w-auto min-h-11 px-5 font-semibold cursor-pointer"
            >
              <QrCode className="w-4 h-4 mr-2" />
              New Auto Pager
            </Button>
          </div>
          {coasters.length > 0 && (
            <div>
              <Label className="text-xs flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5 rotate-90 text-primary" />
                <span>Bind Physical NFC/QR Coaster (optional)</span>
              </Label>
              <select
                value={selectedCoasterId}
                onChange={e => setSelectedCoasterId(e.target.value)}
                data-testid="select-pager-coaster"
                className="manager-select w-full h-11 text-xs font-medium mt-1"
              >
                <option value="">Screen QR only — no physical coaster</option>
                {idleCoasters.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.tagCode} — {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <form
          onSubmit={e => {
            e.preventDefault();
            issueMutation.mutate('pos_invoice');
          }}
          className="lg:col-span-7 manager-panel p-5 flex flex-col justify-between gap-4"
        >
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary" />
              Manual POS Receipt / Invoice Link
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Enter your existing POS invoice number so the guest tracks their receipt directly on their phone.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2.5 items-end">
            <div>
              <Label className="text-xs">POS Invoice / Receipt # *</Label>
              <Input
                value={invoiceNumber}
                onChange={e => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-2048"
                className="h-11 font-mono uppercase"
                required
                data-testid="input-pos-invoice"
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              disabled={!invoiceNumber.trim() || issueMutation.isPending}
              className="w-full sm:w-auto min-h-11 px-5 font-semibold cursor-pointer"
              data-testid="button-issue-pos-pager"
            >
              Issue Receipt Pager
            </Button>
          </div>
        </form>
      </section>

      {/* Active Order & Pickup Queue Grid */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Active Prep &amp; Pickup Queue ({activeTickets.length})</h2>
          <div className="flex flex-nowrap sm:flex-wrap overflow-x-auto no-scrollbar pb-1 gap-2" role="group" aria-label="Filter order queue tickets">
            {[
              { id: 'all', label: `All (${allActiveTickets.length})` },
              { id: 'orders', label: 'In-App Orders' },
              { id: 'curbside', label: 'Curbside & Drive-Thru' },
              { id: 'counter', label: 'POS / Auto Pagers' },
            ].map(tab => (
              <Button
                key={tab.id}
                type="button"
                size="sm"
                variant={channelFilter === tab.id ? 'default' : 'outline'}
                onClick={() => setChannelFilter(tab.id as any)}
                className="min-h-11 md:min-h-9 shrink-0 text-xs cursor-pointer"
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>
        {activeTickets.length === 0 ? (
          <div className="manager-panel p-10 text-center text-muted-foreground">
            Queue is clear — issue an Auto Pager above or place a guest order from the menu to test live alerts.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeTickets.map(ticket => {
              const sla = slaBadge(ticket.queuedAt);
              const SlaIcon = sla.icon;
              const order = ticket.orderId ? ordersById.get(ticket.orderId) : null;
              const bay = ticket.bayId ? baysById.get(ticket.bayId) : null;
              const boundCoaster = coasterByTicketId.get(ticket.id);
              const cooldownRemaining = ticket.lastBuzzedAt
                ? Math.max(0, Math.ceil((20_000 - (now - new Date(ticket.lastBuzzedAt).getTime())) / 1000))
                : 0;

              const lineItems: any[] = order?.lineItems || [];
              const preparedCount = lineItems.filter(li => Boolean(li.prepared)).length;
              const allItemsPrepared = lineItems.length > 0 && preparedCount === lineItems.length;
              const progressPct = lineItems.length > 0 ? Math.round((preparedCount / lineItems.length) * 100) : 0;

              return (
                <article
                  key={ticket.id}
                  data-testid={`card-pager-ticket-${ticket.ticketCode}`}
                  className={`rounded-2xl border-2 p-4 bg-card shadow-sm flex flex-col justify-between gap-3 transition-colors duration-150 ${
                    ticket.status === 'ready'
                      ? 'border-[#C8FF42]'
                      : allItemsPrepared
                        ? 'border-[#6236FF]'
                        : 'border-border'
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-2xl font-black font-mono">{ticket.ticketCode}</span>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${sla.className}`}>
                        <SlaIcon className="w-3.5 h-3.5" />
                        {sla.label}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge variant="outline" className="uppercase">{ticket.status}</Badge>
                      <Badge variant="secondary">{ticket.source.replace('_', ' ')}</Badge>
                      {(ticket.recalledCount || 0) > 0 && (
                        <Badge
                          data-testid={`badge-recalled-${ticket.ticketCode}`}
                          className="bg-[#EFEAFF] text-[#4B1FE0] hover:bg-[#EFEAFF] border border-[#6236FF]/30 font-semibold inline-flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Recalled</span>
                        </Badge>
                      )}
                      {ticket.customerName && <span className="font-medium">{ticket.customerName}</span>}
                      {boundCoaster && (
                        <Badge
                          data-testid={`badge-pager-coaster-${boundCoaster.tagCode}`}
                          className="bg-[#EFEAFF] text-[#4B1FE0] hover:bg-[#EFEAFF] border border-[#6236FF]/30 font-mono font-bold inline-flex items-center gap-1"
                        >
                          <Wifi className="w-3 h-3 rotate-90" />
                          <span>{boundCoaster.tagCode}</span>
                        </Badge>
                      )}
                      {bay && (
                        <Badge className="bg-[#C8FF42] text-[#17132E] hover:bg-[#C8FF42] font-extrabold border-0">
                          BAY ARRIVED · {bay.code}
                        </Badge>
                      )}
                      {ticket.licensePlate && (
                        <Badge variant="outline" className="font-mono">
                          {ticket.vehicleColor} {ticket.vehicleType} · {ticket.licensePlate}
                        </Badge>
                      )}
                    </div>

                    {order && (
                      <div className="rounded-2xl border bg-muted/35 p-3 text-xs space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-1.5 font-semibold">
                          <span>
                            {order.orderNumber} ({order.channel.replace('_', ' ')})
                            {order.tableCode ? ` · Table ${order.tableCode}` : ''}
                          </span>
                          <span className="text-muted-foreground">
                            {order.paymentStatus === 'paid' ? 'PAID' : 'PAY AT VENUE'} · {order.total} {order.currency}
                          </span>
                        </div>

                        {lineItems.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-medium text-muted-foreground">
                                Tap items as prepared
                              </span>
                              <span
                                data-testid={`text-prep-progress-${ticket.ticketCode}`}
                                className={`px-2 py-0.5 rounded-full font-mono text-[11px] font-bold ${
                                  allItemsPrepared
                                    ? 'bg-[#C8FF42] text-[#17132E]'
                                    : 'bg-[#EFEAFF] text-[#4B1FE0]'
                                }`}
                              >
                                {allItemsPrepared
                                  ? `All ${lineItems.length}/${lineItems.length} Ready`
                                  : `${preparedCount}/${lineItems.length} Prepared`}
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden" aria-hidden="true">
                              <div
                                className={`h-full transition-all duration-200 ${
                                  allItemsPrepared ? 'bg-[#C8FF42]' : 'bg-[#6236FF]'
                                }`}
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>

                            <div className="space-y-2 pt-0.5" role="group" aria-label={`Order items for ${ticket.ticketCode}`}>
                              {lineItems.map((li: any, idx: number) => {
                                const isDone = Boolean(li.prepared);
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    role="checkbox"
                                    aria-checked={isDone}
                                    data-testid={`button-checkoff-${ticket.ticketCode}-${idx}`}
                                    onClick={() =>
                                      toggleLineItemMutation.mutate({
                                        ticketId: ticket.id,
                                        orderId: order.id,
                                        lineIndex: idx,
                                        prepared: !isDone,
                                      })
                                    }
                                    className={`w-full min-h-11 px-3 py-2 rounded-xl border text-left flex items-start justify-between gap-2.5 transition-colors duration-150 cursor-pointer ${
                                      isDone
                                        ? 'bg-[#EFEAFF]/75 border-[#6236FF]/35 text-[#17132E] dark:bg-[#241E42] dark:text-white'
                                        : 'bg-card hover:bg-muted/70 border-border text-foreground'
                                    }`}
                                  >
                                    <div className="flex items-start gap-2.5 min-w-0">
                                      {isDone ? (
                                        <CheckSquare className="w-4 h-4 text-[#6236FF] dark:text-[#C8FF42] shrink-0 mt-0.5" aria-hidden="true" />
                                      ) : (
                                        <Square className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
                                      )}
                                      <div className="min-w-0 space-y-0.5">
                                        <strong className={`block text-xs leading-snug ${isDone ? 'line-through opacity-75' : ''}`}>
                                          {li.quantity}× {li.name}
                                          {li.variantLabel ? ` (${li.variantLabel})` : ''}
                                        </strong>
                                        {li.modifiers?.length > 0 && (
                                          <span className="block text-[11px] text-muted-foreground">
                                            + {li.modifiers.map((m: any) => m.label).join(', ')}
                                          </span>
                                        )}
                                        {li.notes && (
                                          <span className="block text-[11px] font-medium text-[#4B1FE0] dark:text-[#C8FF42]">
                                            Note: “{li.notes}”
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <span
                                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md shrink-0 mt-0.5 ${
                                        isDone
                                          ? 'bg-[#6236FF] text-white'
                                          : 'bg-muted text-muted-foreground'
                                      }`}
                                    >
                                      {isDone ? 'Done' : 'Prep'}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {order.notes && (
                          <p className="text-[11px] font-medium text-[#4B1FE0] dark:text-[#C8FF42] pt-1 border-t">
                            Order Note: “{order.notes}”
                          </p>
                        )}

                        {order.paymentStatus === 'pay_at_venue' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full min-h-11 md:min-h-9 text-xs cursor-pointer gap-1.5"
                            onClick={() => transitionMutation.mutate({ id: ticket.id, action: 'confirm_venue_payment' })}
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            Mark Paid at Counter
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pt-2 border-t">
                    <div className="grid grid-cols-2 gap-2">
                      {ticket.status === 'waiting' && (
                        <Button
                          type="button"
                          variant="secondary"
                          className="min-h-11 cursor-pointer gap-1.5"
                          onClick={() => transitionMutation.mutate({ id: ticket.id, action: 'preparing' })}
                          data-testid={`button-preparing-${ticket.ticketCode}`}
                        >
                          <ChefHat className="w-4 h-4" />
                          Preparing
                        </Button>
                      )}

                      {ticket.status !== 'ready' ? (
                        <Button
                          type="button"
                          className={`min-h-11 cursor-pointer gap-1.5 bg-[#C8FF42] hover:bg-[#b8f52c] text-[#17132E] font-extrabold border-0 ${
                            ticket.status !== 'waiting' ? 'col-span-2' : ''
                          }`}
                          onClick={() =>
                            transitionMutation.mutate({
                              id: ticket.id,
                              action: 'ready',
                              ticketCode: ticket.ticketCode,
                              previousStatus: ticket.status,
                            })
                          }
                          data-testid={`button-ready-${ticket.ticketCode}`}
                        >
                          <BellRing className="w-4 h-4" />
                          {allItemsPrepared ? 'All Ready · Buzz Guest' : 'Buzz Ready'}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={cooldownRemaining > 0}
                          className="min-h-11 cursor-pointer gap-1.5"
                          onClick={() => transitionMutation.mutate({ id: ticket.id, action: 'rebuzz' })}
                          data-testid={`button-rebuzz-${ticket.ticketCode}`}
                        >
                          <BellRing className="w-4 h-4" />
                          {cooldownRemaining > 0
                            ? `Cooldown ${cooldownRemaining}s`
                            : `Re-buzz (${ticket.buzzCount})`}
                        </Button>
                      )}

                      {ticket.status === 'ready' && (
                        <Button
                          type="button"
                          className="min-h-11 cursor-pointer gap-1.5"
                          onClick={() =>
                            transitionMutation.mutate({
                              id: ticket.id,
                              action: 'collected',
                              ticketCode: ticket.ticketCode,
                              previousStatus: 'ready',
                            })
                          }
                          data-testid={`button-collected-${ticket.ticketCode}`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Collected
                        </Button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setIssuedQrTicket(ticket)}
                        className="min-h-11 px-3 rounded-xl bg-muted/40 hover:bg-muted text-primary font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <QrCode className="w-4 h-4" />
                        <span>Guest QR</span>
                      </button>

                      <div className="flex items-center gap-2">
                        {(ticket.status === 'preparing' || ticket.status === 'ready') && (
                          <button
                            type="button"
                            data-testid={`button-stepback-${ticket.ticketCode}`}
                            onClick={() => transitionMutation.mutate({ id: ticket.id, action: 'recall' })}
                            className="min-h-11 px-3 rounded-xl border hover:bg-muted text-foreground font-medium inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>{ticket.status === 'ready' ? 'Back to Prep' : 'Back to Waiting'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            transitionMutation.mutate({
                              id: ticket.id,
                              action: 'no_show',
                              ticketCode: ticket.ticketCode,
                              previousStatus: ticket.status,
                            })
                          }
                          className="min-h-11 px-3 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex items-center cursor-pointer"
                        >
                          No-Show
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Quick 1-Tap Item & Modifier Out-of-Stock Snooze Bar */}
      {(menuQuery.data?.items || []).length > 0 && (
        <section className="manager-panel p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-base">Quick 1-Tap Item &amp; Modifier Snooze</h2>
              <p className="text-xs text-muted-foreground">Instantly hide or restore sold-out items and toppings on the live guest menu.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto">
            {(menuQuery.data?.items || []).slice(0, 24).map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => snoozeMutation.mutate({ id: item.id, isAvailable: !item.isAvailable })}
                className={`px-3 min-h-11 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                  item.isAvailable ? 'bg-card hover:bg-muted' : 'bg-destructive/10 text-destructive border-destructive/30 line-through'
                }`}
              >
                {item.isAvailable ? <PauseCircle className="w-3.5 h-3.5 text-muted-foreground" /> : <PlayCircle className="w-3.5 h-3.5" />}
                <span>{item.name}</span>
              </button>
            ))}
          </div>
          {(menuQuery.data?.items || []).some(i => (i.modifierGroups || []).length > 0) && (
            <div className="pt-3 border-t space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Modifier &amp; Topping Options</p>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {(menuQuery.data?.items || [])
                  .flatMap(item =>
                    (item.modifierGroups || []).flatMap(group =>
                      group.options.map(opt => ({ item, group, opt })),
                    ),
                  )
                  .slice(0, 24)
                  .map(({ item, opt }) => (
                    <button
                      key={`${item.id}:${opt.id}`}
                      type="button"
                      onClick={() =>
                        snoozeModifierMutation.mutate({
                          itemId: item.id,
                          optionId: opt.id,
                          isAvailable: !opt.isAvailable,
                        })
                      }
                      className={`px-3 min-h-11 rounded-xl border text-[11px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                        opt.isAvailable ? 'bg-muted/40 hover:bg-muted' : 'bg-destructive/10 text-destructive border-destructive/30 line-through'
                      }`}
                    >
                      {opt.isAvailable ? <PauseCircle className="w-3 h-3 text-muted-foreground" /> : <PlayCircle className="w-3 h-3" />}
                      <span>
                        {item.name}: <strong>{opt.label}</strong>
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Recently Bumped & Collected Log with 1-Tap Recall */}
      {recentCompleted.length > 0 && (
        <section className="manager-panel p-5 space-y-3">
          <div>
            <h3 className="font-bold text-base">Recently Bumped &amp; Collected Tickets</h3>
            <p className="text-xs text-muted-foreground">
              Accidentally bumped an order? Recall any ticket below back into the live queue (re-attaches its coaster if still idle).
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
            {recentCompleted.map(t => (
              <div
                key={t.id}
                data-testid={`row-archived-ticket-${t.ticketCode}`}
                className="rounded-xl border bg-muted/30 p-3 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <strong className="font-mono text-sm">{t.ticketCode}</strong>
                    <Badge variant="outline" className="uppercase text-[10px]">
                      {t.status.replace('_', '-')}
                    </Badge>
                    {t.rating ? <span className="font-semibold text-amber-600">★{t.rating}</span> : null}
                  </div>
                  {t.customerName && (
                    <span className="block text-muted-foreground truncate mt-0.5">{t.customerName}</span>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={transitionMutation.isPending}
                  data-testid={`button-recall-${t.ticketCode}`}
                  onClick={() => transitionMutation.mutate({ id: t.id, action: 'recall' })}
                  className="min-h-11 rounded-xl shrink-0 cursor-pointer gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Recall</span>
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Counter Customer-Facing Pager QR Modal */}
      <Dialog open={Boolean(issuedQrTicket)} onOpenChange={open => !open && setIssuedQrTicket(null)}>
        <DialogContent className="max-w-sm text-center rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl font-black font-mono">
              {issuedQrTicket?.ticketCode}
            </DialogTitle>
            <DialogDescription className="text-center">
              Ask the guest to scan with their phone camera — zero app download required.
            </DialogDescription>
          </DialogHeader>
          {issuedQrTicket && (
            <div className="space-y-4 py-2">
              <div className="mx-auto grid place-items-center">
                <LocalQrBox url={`${publicBase}/pager/${issuedQrTicket.trackingToken}`} size={196} />
              </div>
              <a
                href={`/pager/${issuedQrTicket.trackingToken}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                <span>Open Guest Virtual Pager Screen</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
