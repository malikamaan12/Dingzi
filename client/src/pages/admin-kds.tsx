import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ChefHat,
  Clock,
  CreditCard,
  ExternalLink,
  Flame,
  PauseCircle,
  PlayCircle,
  QrCode,
  Receipt,
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
import { useRealtimeStream } from '@/lib/useRealtimeStream';
import { LocalQrBox } from '@/components/hospitality/LocalQrBox';

export default function AdminKdsPage() {
  const { toast } = useToast();
  const menuQuery = useManagerMenu();
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [prepMins, setPrepMins] = useState(8);
  const [issuedQrTicket, setIssuedQrTicket] = useState<any | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const kdsQuery = useQuery<{ tickets: any[]; orders: any[]; bays: any[] }>({
    queryKey: ['/api/hospitality/pagers'],
    refetchInterval: 5000,
  });

  useRealtimeStream('/api/hospitality/stream', () => {
    void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/pagers'] });
  });

  const issueMutation = useMutation({
    mutationFn: async (mode: 'auto_number' | 'pos_invoice') => {
      const res = await apiRequest('POST', '/api/hospitality/pagers/issue', {
        mode,
        invoiceNumber: mode === 'pos_invoice' ? invoiceNumber : undefined,
        customerName: customerName.trim() || undefined,
        estimatedPrepMins: prepMins,
      });
      return res.json();
    },
    onSuccess: data => {
      setInvoiceNumber('');
      setCustomerName('');
      setIssuedQrTicket(data.ticket);
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/pagers'] });
      toast({
        title: `Issued Pager ${data.ticket.ticketCode}`,
        description: 'Have the guest scan the QR code to activate live phone alerts.',
      });
    },
    onError: (e: Error) => toast({ title: 'Could not issue pager', description: e.message, variant: 'destructive' }),
  });

  const transitionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      const res = await apiRequest('POST', `/api/hospitality/pagers/${id}/transition`, { action });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/pagers'] });
      if (vars.action === 'ready' || vars.action === 'rebuzz') {
        toast({ title: 'Guest buzzed!', description: 'Instant audio & vibration sent to guest browser.' });
      }
    },
    onError: (e: Error) => toast({ title: 'Action blocked', description: e.message, variant: 'destructive' }),
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

  const tickets = kdsQuery.data?.tickets || [];
  const ordersById = new Map((kdsQuery.data?.orders || []).map(o => [o.id, o]));
  const baysById = new Map((kdsQuery.data?.bays || []).map(b => [b.id, b]));
  const activeTickets = tickets.filter(t => ['waiting', 'preparing', 'ready'].includes(t.status));
  const recentCompleted = tickets
    .filter(t => ['collected', 'no_show'].includes(t.status))
    .slice(-8)
    .reverse();

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
          <h1 className="text-3xl font-bold">Virtual Pager &amp; Live KDS Console</h1>
          <p className="text-sm text-muted-foreground">
            Issue 1-tap hardware-free pagers, manage incoming orders, and buzz guest phones in under 250 ms.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm" role="status" aria-atomic="true">
          <Badge variant="secondary" className="px-3 py-1.5 text-sm">
            Active Queue: {activeTickets.length}
          </Badge>
        </div>
      </div>

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
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label className="text-xs">Guest Name (optional)</Label>
              <Input
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="e.g. Ahmad"
                className="h-11"
              />
            </div>
            <div className="w-24">
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
            <Button
              type="button"
              data-testid="button-issue-auto-pager"
              onClick={() => issueMutation.mutate('auto_number')}
              disabled={issueMutation.isPending}
              className="min-h-11 px-5 font-semibold cursor-pointer"
            >
              <QrCode className="w-4 h-4 mr-2" />
              New Auto Pager
            </Button>
          </div>
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
          <div className="flex flex-wrap sm:flex-nowrap gap-2 items-end">
            <div className="flex-1 min-w-[180px]">
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
              className="min-h-11 px-5 font-semibold cursor-pointer"
              data-testid="button-issue-pos-pager"
            >
              Issue Receipt Pager
            </Button>
          </div>
        </form>
      </section>

      {/* Active KDS Queue Grid */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Active Prep &amp; Pickup Queue ({activeTickets.length})</h2>
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
              const cooldownRemaining = ticket.lastBuzzedAt
                ? Math.max(0, Math.ceil((20_000 - (now - new Date(ticket.lastBuzzedAt).getTime())) / 1000))
                : 0;

              return (
                <article
                  key={ticket.id}
                  data-testid={`card-kds-ticket-${ticket.ticketCode}`}
                  className={`rounded-2xl border-2 p-4 bg-card shadow-sm flex flex-col justify-between gap-3 ${
                    ticket.status === 'ready' ? 'border-emerald-500' : 'border-border'
                  }`}
                >
                  <div className="space-y-2">
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
                      {ticket.customerName && <span className="font-medium">{ticket.customerName}</span>}
                      {bay && <Badge className="bg-sky-600 text-white">{bay.code}</Badge>}
                      {ticket.licensePlate && (
                        <Badge variant="outline" className="font-mono">
                          {ticket.vehicleColor} {ticket.vehicleType} · {ticket.licensePlate}
                        </Badge>
                      )}
                    </div>

                    {order && (
                      <div className="rounded-xl bg-muted/50 p-2.5 text-xs space-y-1">
                        <div className="flex items-center justify-between font-semibold">
                          <span>{order.orderNumber} ({order.channel.replace('_', ' ')})</span>
                          <span>
                            {order.paymentStatus === 'paid' ? 'PAID' : 'PAY AT VENUE'} · {order.total} {order.currency}
                          </span>
                        </div>
                        <ul className="space-y-0.5 text-muted-foreground">
                          {(order.lineItems || []).map((li: any, idx: number) => (
                            <li key={idx}>
                              <strong className="text-foreground">{li.quantity}× {li.name}</strong>
                              {li.variantLabel ? ` (${li.variantLabel})` : ''}
                              {li.modifiers?.length ? ` + ${li.modifiers.map((m: any) => m.label).join(', ')}` : ''}
                            </li>
                          ))}
                        </ul>
                        {order.paymentStatus === 'pay_at_venue' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full mt-1.5 h-8 text-xs cursor-pointer gap-1"
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
                          className="min-h-11 cursor-pointer gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => transitionMutation.mutate({ id: ticket.id, action: 'ready' })}
                          data-testid={`button-ready-${ticket.ticketCode}`}
                        >
                          <BellRing className="w-4 h-4" />
                          Buzz Ready
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
                          onClick={() => transitionMutation.mutate({ id: ticket.id, action: 'collected' })}
                          data-testid={`button-collected-${ticket.ticketCode}`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Collected
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => setIssuedQrTicket(ticket)}
                        className="text-primary font-medium hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        Show Guest QR
                      </button>
                      <button
                        type="button"
                        onClick={() => transitionMutation.mutate({ id: ticket.id, action: 'no_show' })}
                        className="text-muted-foreground hover:text-destructive cursor-pointer"
                      >
                        Mark No-Show
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Quick 1-Tap Item Stock Snooze Bar */}
      {(menuQuery.data?.items || []).length > 0 && (
        <section className="manager-panel p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-base">Quick 1-Tap Out-of-Stock Snooze</h2>
              <p className="text-xs text-muted-foreground">Instantly hide or restore sold-out items on the live guest menu.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
            {(menuQuery.data?.items || []).slice(0, 24).map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => snoozeMutation.mutate({ id: item.id, isAvailable: !item.isAvailable })}
                className={`px-3 min-h-10 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                  item.isAvailable ? 'bg-card hover:bg-muted' : 'bg-destructive/10 text-destructive border-destructive/30 line-through'
                }`}
              >
                {item.isAvailable ? <PauseCircle className="w-3.5 h-3.5 text-muted-foreground" /> : <PlayCircle className="w-3.5 h-3.5" />}
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Recently Collected Log */}
      {recentCompleted.length > 0 && (
        <section className="manager-panel p-5 space-y-2">
          <h3 className="font-semibold text-sm text-muted-foreground">Recently Archived Tickets</h3>
          <div className="flex flex-wrap gap-2 text-xs">
            {recentCompleted.map(t => (
              <span key={t.id} className="px-3 py-1.5 rounded-xl border bg-muted/40 font-mono">
                {t.ticketCode} · {t.status} {t.rating ? `· ★${t.rating}` : ''}
              </span>
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
                <LocalQrBox url={`${window.location.origin}/pager/${issuedQrTicket.trackingToken}`} size={196} />
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
