import { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileSpreadsheet,
  Minus,
  Plus,
  Printer,
  QrCode,
  Receipt,
  RotateCcw,
  Search,
  ShoppingBag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useManagerMenu } from '@/lib/managerMenu';
import { useRealtimeStream } from '@/lib/useRealtimeStream';
import { useToast } from '@/hooks/use-toast';
import { BrandedReceiptSheet } from '@/components/hospitality/BrandedReceiptSheet';
import { printHtmlSlip } from '@/lib/printBrandedReceipt';
import { CounterPagerQrModal, type IssuedPagerHandoff } from '@/components/qr-nfc/CounterPagerQrModal';
import { publicExperienceOrigin } from '@shared/menuIdentity';
import type { GuestOrder, PagerTicket } from '@shared/schema';

export default function AdminOrdersPage() {
  const { toast } = useToast();
  const menuQuery = useManagerMenu();
  const cafe = menuQuery.data?.restaurant;
  const menuItems = (menuQuery.data?.items || []).filter(i => i.isAvailable);

  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pay_at_venue' | 'pending_online' | 'refunded'>('all');
  const [channelFilter, setChannelFilter] = useState<'all' | 'counter_pickup' | 'dine_in' | 'curbside' | 'drive_thru'>('all');
  const [search, setSearch] = useState('');
  const [receiptOrder, setReceiptOrder] = useState<GuestOrder | null>(null);
  const [zReportOpen, setZReportOpen] = useState(false);
  const [handoffTicket, setHandoffTicket] = useState<IssuedPagerHandoff | null>(null);

  // Counter POS Order Modal State
  const [posOpen, setPosOpen] = useState(false);
  const [posName, setPosName] = useState('');
  const [posChannel, setPosChannel] = useState<'counter_pickup' | 'dine_in'>('counter_pickup');
  const [posTableCode, setPosTableCode] = useState('');
  const [posPaymentStatus, setPosPaymentStatus] = useState<'paid' | 'pay_at_venue'>('paid');
  const [posNotes, setPosNotes] = useState('');
  const [posLines, setPosLines] = useState<Record<string, number>>({});

  const ordersQuery = useQuery<{ orders: GuestOrder[]; tickets: PagerTicket[]; currency: string }>({
    queryKey: ['/api/hospitality/orders'],
    refetchInterval: 8000,
  });

  const zReportQuery = useQuery<any>({
    queryKey: ['/api/hospitality/z-report'],
    enabled: zReportOpen,
  });

  const publicBase = publicExperienceOrigin(typeof window !== 'undefined' ? window.location.origin : '');

  useRealtimeStream('/api/hospitality/stream', () => {
    void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/orders'] });
  });

  const paymentMutation = useMutation({
    mutationFn: async ({ id, paymentStatus }: { id: string; paymentStatus: 'paid' | 'refunded' | 'failed' }) => {
      const res = await apiRequest('POST', `/api/hospitality/orders/${id}/payment-status`, { paymentStatus });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/orders'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/pagers'] });
      toast({ title: `Order marked ${vars.paymentStatus.replace('_', ' ')}` });
    },
    onError: (e: Error) => toast({ title: 'Could not update payment status', description: e.message, variant: 'destructive' }),
  });

  const createPosOrderMutation = useMutation({
    mutationFn: async () => {
      const items = Object.entries(posLines)
        .filter(([, qty]) => qty > 0)
        .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
      const res = await apiRequest('POST', '/api/hospitality/orders', {
        channel: posChannel,
        customerName: posName.trim() || 'Walk-In Guest',
        tableCode: posChannel === 'dine_in' ? posTableCode.trim() || null : null,
        paymentStatus: posPaymentStatus,
        notes: posNotes.trim() || null,
        items,
      });
      return res.json();
    },
    onSuccess: data => {
      setPosOpen(false);
      setPosName('');
      setPosTableCode('');
      setPosNotes('');
      setPosLines({});
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/orders'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/pagers'] });
      if (data.pager?.trackingToken) {
        setHandoffTicket({
          id: data.pager.id,
          ticketCode: data.pager.ticketCode,
          trackingToken: data.pager.trackingToken,
          customerName: data.order?.customerName || data.pager.customerName,
        });
      }
      toast({
        title: `Created ${data.order.orderNumber} · Pager ${data.pager.ticketCode}`,
        description: 'Ask the customer to scan their private QR so only their phone rings when ready.',
      });
    },
    onError: (e: Error) => toast({ title: 'Could not create order', description: e.message, variant: 'destructive' }),
  });

  const orders = ordersQuery.data?.orders || [];
  const ticketsByOrderId = useMemo(() => {
    const map = new Map<string, PagerTicket>();
    for (const t of ordersQuery.data?.tickets || []) {
      if (t.orderId) map.set(t.orderId, t);
    }
    return map;
  }, [ordersQuery.data?.tickets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter(o => {
      if (statusFilter !== 'all' && o.paymentStatus !== statusFilter) return false;
      if (channelFilter !== 'all' && o.channel !== channelFilter) return false;
      if (!q) return true;
      const ticket = ticketsByOrderId.get(o.id);
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        (o.customerName || '').toLowerCase().includes(q) ||
        (o.tableCode || '').toLowerCase().includes(q) ||
        (o.licensePlate || '').toLowerCase().includes(q) ||
        (ticket?.ticketCode || '').toLowerCase().includes(q)
      );
    });
  }, [orders, statusFilter, channelFilter, search, ticketsByOrderId]);

  const paidTotal = useMemo(
    () =>
      orders
        .filter(o => o.paymentStatus === 'paid')
        .reduce((sum, o) => sum + Number(o.total), 0)
        .toFixed(2),
    [orders],
  );
  const unpaidVenueCount = useMemo(
    () => orders.filter(o => o.paymentStatus === 'pay_at_venue').length,
    [orders],
  );

  function exportOrdersCsv() {
    const header = [
      'OrderNumber',
      'CreatedAt',
      'Customer',
      'Channel',
      'TableCode',
      'PaymentStatus',
      'PaymentProvider',
      'Subtotal',
      'Total',
      'Currency',
    ];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = orders.map(o =>
      [
        o.orderNumber,
        new Date(o.createdAt).toISOString(),
        o.customerName || 'Walk-In',
        o.channel,
        o.tableCode || '',
        o.paymentStatus,
        o.paymentProvider,
        o.subtotal,
        o.total,
        o.currency,
      ]
        .map(esc)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(cafe?.slug || 'venue')}-orders-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const posSelectedCount = Object.values(posLines).reduce((a, b) => a + b, 0);
  const posSubtotal = menuItems
    .reduce((sum, item) => sum + Number(item.price) * (posLines[item.id] || 0), 0)
    .toFixed(2);

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Counter Orders &amp; Bills</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ring up walk-in orders, collect cash or card on unpaid bills, and print receipts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            onClick={() => setZReportOpen(true)}
            data-testid="button-open-z-report"
            className="flex-1 sm:flex-none min-h-11 px-4 rounded-xl cursor-pointer gap-2"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#6236FF]" />
            <span>Shift Z-Report &amp; CSV</span>
          </Button>
          <Button
            type="button"
            onClick={() => setPosOpen(true)}
            data-testid="button-open-pos-order"
            className="flex-1 sm:flex-none min-h-11 px-5 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>New Counter Order</span>
          </Button>
        </div>
      </header>

      {/* Clean 3-Stat Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="status" aria-live="polite">
        <div className="rounded-2xl border bg-card p-4">
          <span className="text-xs text-muted-foreground font-medium">Unpaid Bills</span>
          <strong className="block text-2xl font-mono mt-1">{unpaidVenueCount}</strong>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <span className="text-xs text-muted-foreground font-medium">Paid Total</span>
          <strong className="block text-2xl font-mono mt-1 text-primary truncate">
            {paidTotal} {ordersQuery.data?.currency || cafe?.currency || 'QAR'}
          </strong>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <span className="text-xs text-muted-foreground font-medium">Total Orders</span>
          <strong className="block text-2xl font-mono mt-1">{orders.length}</strong>
        </div>
      </div>

      {/* Simple Plain-Language Filters */}
      <div className="rounded-2xl border bg-card p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-nowrap sm:flex-wrap overflow-x-auto no-scrollbar pb-1 gap-2">
          {(
            [
              ['all', 'All Orders'],
              ['pay_at_venue', `Unpaid (${unpaidVenueCount})`],
              ['paid', 'Paid'],
              ['refunded', 'Refunded'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStatusFilter(id)}
              className={`px-4 min-h-11 shrink-0 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                statusFilter === id
                  ? 'bg-[#6236FF] text-white'
                  : 'bg-muted/60 text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex items-center gap-2">
          <select
            aria-label="Filter by channel"
            className="manager-select w-full sm:w-auto text-xs"
            value={channelFilter}
            onChange={e => setChannelFilter(e.target.value as any)}
          >
            <option value="all">All Channels</option>
            <option value="counter_pickup">Counter Pickup</option>
            <option value="dine_in">Dine-In Table</option>
            <option value="curbside">Curbside Bay</option>
            <option value="drive_thru">Drive-Thru Lane</option>
          </select>
          <div className="relative w-full sm:w-auto">
            <Search className="w-4 h-4 text-muted-foreground absolute start-3 top-3.5" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Order #, guest, table, plate…"
              className="ps-9 min-h-11 md:h-10 w-full lg:w-56 text-base md:text-xs"
            />
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="manager-panel p-10 text-center text-sm text-muted-foreground">
            <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
            No orders match the current filter.
          </div>
        ) : (
          filtered.map(order => {
            const ticket = ticketsByOrderId.get(order.id);
            const isPaid = order.paymentStatus === 'paid';
            const isPayAtVenue = order.paymentStatus === 'pay_at_venue';
            return (
              <div
                key={order.id}
                data-testid={`row-order-${order.orderNumber}`}
                className="manager-panel p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="font-mono text-base">{order.orderNumber}</strong>
                    {ticket && (
                      <Badge className="bg-[#EFEAFF] text-[#4B1FE0] border border-[#E5E2F2] font-mono">
                        Pager {ticket.ticketCode} · {ticket.status}
                      </Badge>
                    )}
                    <Badge variant="outline" className="uppercase text-[11px]">
                      {order.channel.replace('_', ' ')}
                    </Badge>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        isPaid
                          ? 'bg-[#C8FF42] text-[#17132E]'
                          : isPayAtVenue
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {isPaid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                      {order.paymentStatus.replace('_', ' ')}
                    </span>
                  </div>

                  <p className="text-sm font-medium">
                    {order.customerName || 'Guest'}
                    {order.tableCode ? ` · Table ${order.tableCode}` : ''}
                    {order.licensePlate ? ` · ${order.vehicleColor || ''} ${order.vehicleType || ''} (${order.licensePlate})` : ''}
                    <span className="text-xs text-muted-foreground ml-2">
                      {new Date(order.createdAt).toLocaleString()}
                    </span>
                  </p>

                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                    {(order.lineItems || []).map((li, idx) => (
                      <span key={idx}>
                        <strong className="text-foreground">{li.quantity}× {li.name}</strong>
                        {li.variantLabel ? ` (${li.variantLabel})` : ''}
                        {li.modifiers?.length ? ` [${li.modifiers.map(m => m.label).join(', ')}]` : ''}
                        {li.notes ? ` “${li.notes}”` : ''}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2 w-full lg:w-auto border-t lg:border-t-0 pt-3 lg:pt-0 shrink-0">
                  <div className="text-start lg:text-end me-2">
                    <strong className="block font-mono text-lg">
                      {order.total} {order.currency}
                    </strong>
                    {order.paymentReference && (
                      <span className="text-[11px] font-mono text-muted-foreground">{order.paymentReference}</span>
                    )}
                  </div>

                  {ticket && ['waiting', 'preparing', 'ready'].includes(ticket.status) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setHandoffTicket({
                          id: ticket.id,
                          ticketCode: ticket.ticketCode,
                          trackingToken: ticket.trackingToken,
                          customerName: order.customerName,
                        })
                      }
                      className="min-h-11 rounded-xl cursor-pointer gap-1.5"
                    >
                      <QrCode className="w-4 h-4 text-[#6236FF]" />
                      <span>Guest QR</span>
                    </Button>
                  )}

                  {isPayAtVenue && (
                    <Button
                      type="button"
                      size="sm"
                      data-testid={`button-settle-${order.orderNumber}`}
                      onClick={() => paymentMutation.mutate({ id: order.id, paymentStatus: 'paid' })}
                      disabled={paymentMutation.isPending}
                      className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white cursor-pointer gap-1.5"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Mark Paid</span>
                    </Button>
                  )}

                  {isPaid && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => paymentMutation.mutate({ id: order.id, paymentStatus: 'refunded' })}
                      disabled={paymentMutation.isPending}
                      className="min-h-11 rounded-xl cursor-pointer gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Refund</span>
                    </Button>
                  )}

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setReceiptOrder(order)}
                    className="min-h-11 rounded-xl cursor-pointer gap-1.5"
                  >
                    <Receipt className="w-4 h-4" />
                    <span>Receipt</span>
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Brand-Adaptive Printable Receipt & Kitchen Prep Chit Modal */}
      <Dialog open={Boolean(receiptOrder)} onOpenChange={open => !open && setReceiptOrder(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto rounded-3xl">
          {receiptOrder && cafe && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between pe-6">
                  <span>Receipt · {receiptOrder.orderNumber}</span>
                  <Badge variant="outline" className="font-mono uppercase">{receiptOrder.paymentStatus}</Badge>
                </DialogTitle>
                <DialogDescription>
                  Switch between your brand’s guest receipt and the 80mm kitchen prep chit.
                </DialogDescription>
              </DialogHeader>

              <BrandedReceiptSheet
                venue={cafe}
                order={receiptOrder}
                ticketCode={ticketsByOrderId.get(receiptOrder.id)?.ticketCode}
                qrUrl={
                  ticketsByOrderId.get(receiptOrder.id)?.trackingToken
                    ? `${publicBase}/pager/${ticketsByOrderId.get(receiptOrder.id)?.trackingToken}`
                    : cafe.slug
                      ? `${publicBase}/v/${cafe.slug}`
                      : `${publicBase}/menu/${cafe.id}`
                }
                qrCaption={
                  ticketsByOrderId.get(receiptOrder.id)?.trackingToken
                    ? 'Scan for live Virtual Pager alerts'
                    : 'Scan for digital menu'
                }
                showStaffPrintControls
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* End-of-Day Shift Z-Report & Accounting Export Modal */}
      <Dialog open={zReportOpen} onOpenChange={setZReportOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Daily Shift Z-Report</DialogTitle>
            <DialogDescription>
              {cafe?.name} · Daily settlement summary and CSV accounting export.
            </DialogDescription>
          </DialogHeader>
          {zReportQuery.isLoading || !zReportQuery.data ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Calculating shift closeout…</p>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="rounded-2xl border bg-muted/30 p-4 space-y-2 font-mono text-xs">
                <div className="flex justify-between font-sans font-bold text-sm border-b pb-2">
                  <span>Business Date</span>
                  <span className="font-mono">{zReportQuery.data.date}</span>
                </div>
                <div className="flex justify-between">
                  <span>Settled Orders ({zReportQuery.data.paidCount})</span>
                  <strong>{zReportQuery.data.grossPaidTotal} {zReportQuery.data.currency}</strong>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Net Subtotal</span>
                  <span>{zReportQuery.data.netSubtotal} {zReportQuery.data.currency}</span>
                </div>
                {Number(zReportQuery.data.serviceCollected) > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Service ({zReportQuery.data.serviceChargePercent}%)</span>
                    <span>{zReportQuery.data.serviceCollected} {zReportQuery.data.currency}</span>
                  </div>
                )}
                {Number(zReportQuery.data.taxCollected) > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>{zReportQuery.data.taxLabel} ({zReportQuery.data.taxPercent}%)</span>
                    <span>{zReportQuery.data.taxCollected} {zReportQuery.data.currency}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2">
                  <span>Open / Unpaid ({zReportQuery.data.unpaidCount})</span>
                  <span>{zReportQuery.data.unpaidOpenTotal} {zReportQuery.data.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span>Refunded ({zReportQuery.data.refundedCount})</span>
                  <span>{zReportQuery.data.refundedTotal} {zReportQuery.data.currency}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span>Avg Prep SLA · Collected / No-Show</span>
                  <span>
                    {zReportQuery.data.avgPrepMins}m · {zReportQuery.data.collectedCount}/{zReportQuery.data.noShowCount}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    printHtmlSlip(
                      `<!doctype html><html><body style="font-family:monospace;padding:16px;max-width:300px"><h2>Z-REPORT · ${zReportQuery.data.venueName}</h2><p>Date: ${zReportQuery.data.date}</p><hr/><p>Paid (${zReportQuery.data.paidCount}): <strong>${zReportQuery.data.grossPaidTotal} ${zReportQuery.data.currency}</strong></p><p>Subtotal: ${zReportQuery.data.netSubtotal}</p><p>Tax: ${zReportQuery.data.taxCollected} · Service: ${zReportQuery.data.serviceCollected}</p><p>Open Unpaid (${zReportQuery.data.unpaidCount}): ${zReportQuery.data.unpaidOpenTotal}</p><p>Refunded (${zReportQuery.data.refundedCount}): ${zReportQuery.data.refundedTotal}</p><hr/><p>Avg Prep: ${zReportQuery.data.avgPrepMins}m</p></body></html>`,
                    )
                  }
                  className="min-h-11 rounded-xl cursor-pointer gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Z-Slip</span>
                </Button>
                <Button
                  type="button"
                  onClick={exportOrdersCsv}
                  className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white cursor-pointer gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Export CSV</span>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Counter POS Quick Order Entry Dialog */}
      <Dialog open={posOpen} onOpenChange={setPosOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle>New Counter POS Order</DialogTitle>
            <DialogDescription>
              Ring up a walk-in or dine-in order and issue a live Virtual Pager straight to the prep queue.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={e => {
              e.preventDefault();
              createPosOrderMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Guest Name *</Label>
                <Input
                  value={posName}
                  onChange={e => setPosName(e.target.value)}
                  placeholder="Walk-In Guest"
                  required
                  className="h-11"
                />
              </div>
              <div>
                <Label className="text-xs">Payment Settlement</Label>
                <select
                  className="manager-select w-full h-11 text-sm"
                  value={posPaymentStatus}
                  onChange={e => setPosPaymentStatus(e.target.value as any)}
                >
                  <option value="paid">Paid at POS Terminal</option>
                  <option value="pay_at_venue">Collect on Pickup / Table</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Channel</Label>
                <select
                  className="manager-select w-full h-11 text-sm"
                  value={posChannel}
                  onChange={e => setPosChannel(e.target.value as any)}
                >
                  <option value="counter_pickup">Counter Pickup</option>
                  <option value="dine_in">Dine-In Table</option>
                </select>
              </div>
              {posChannel === 'dine_in' && (
                <div>
                  <Label className="text-xs">Table Code</Label>
                  <Input
                    value={posTableCode}
                    onChange={e => setPosTableCode(e.target.value)}
                    placeholder="T-01"
                    className="h-11 font-mono"
                  />
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs">Select Menu Items ({posSelectedCount} selected · {posSubtotal} {cafe?.currency || 'QAR'})</Label>
              <div className="mt-1.5 max-h-56 overflow-y-auto rounded-2xl border divide-y">
                {menuItems.length === 0 ? (
                  <p className="p-4 text-xs text-muted-foreground">Add available menu items first.</p>
                ) : (
                  menuItems.map(item => {
                    const qty = posLines[item.id] || 0;
                    return (
                      <div key={item.id} className="p-2.5 flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <strong className="block truncate">{item.name}</strong>
                          <span className="text-xs font-mono text-muted-foreground">
                            {Number(item.price).toFixed(2)} {cafe?.currency || 'QAR'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            aria-label={`Decrease ${item.name}`}
                            onClick={() =>
                              setPosLines(prev => ({ ...prev, [item.id]: Math.max(0, (prev[item.id] || 0) - 1) }))
                            }
                            className="w-11 h-11 rounded-xl border grid place-items-center cursor-pointer"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-7 text-center font-mono font-bold">{qty}</span>
                          <button
                            type="button"
                            aria-label={`Increase ${item.name}`}
                            onClick={() =>
                              setPosLines(prev => ({ ...prev, [item.id]: Math.min(25, (prev[item.id] || 0) + 1) }))
                            }
                            className="w-11 h-11 rounded-xl border bg-primary/10 text-primary grid place-items-center cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <Input
              value={posNotes}
              onChange={e => setPosNotes(e.target.value)}
              placeholder="Kitchen / barista order notes (optional)"
              className="h-11"
            />

            <Button
              type="submit"
              disabled={posSelectedCount === 0 || !posName.trim() || createPosOrderMutation.isPending}
              className="w-full min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white cursor-pointer"
            >
              {createPosOrderMutation.isPending ? 'Creating Order & Pager…' : `Submit Order (${posSubtotal} ${cafe?.currency || 'QAR'})`}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <CounterPagerQrModal
        venueName={cafe?.name || 'dingzi'}
        ticket={handoffTicket}
        onClose={() => setHandoffTicket(null)}
      />
    </div>
  );
}
