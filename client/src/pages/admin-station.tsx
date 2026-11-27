import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  BellRing,
  Car,
  Check,
  CheckCircle2,
  Clock,
  Flame,
  RotateCcw,
  Search,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { DingziMark } from '@/components/staff-brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useManagerMenu } from '@/lib/managerMenu';
import { playStaffArrivalChime } from '@/lib/pagerAudio';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useRealtimeStream } from '@/lib/useRealtimeStream';
import type { GuestOrder, PagerTicket, ServiceBay } from '@shared/schema';

export default function AdminStationPage() {
  const { toast } = useToast();
  const menuQuery = useManagerMenu();
  const cafe = menuQuery.data?.restaurant;
  const menuItems = menuQuery.data?.items || [];

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [stockSearch, setStockSearch] = useState('');
  const [lastBumped, setLastBumped] = useState<{ id: string; code: string; expiresAt: number } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  const pagersQuery = useQuery<{ tickets: PagerTicket[]; bays: ServiceBay[] }>({
    queryKey: ['/api/hospitality/pagers'],
    refetchInterval: 4_000,
  });

  const ordersQuery = useQuery<{ orders: GuestOrder[] }>({
    queryKey: ['/api/hospitality/orders'],
    refetchInterval: 6_000,
  });

  useRealtimeStream('/api/hospitality/stream', ev => {
    void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/pagers'] });
    void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/orders'] });
    if (soundEnabled && (ev.type === 'pager.created' || ev.type === 'curbside.arrived')) {
      playStaffArrivalChime();
    }
  });

  const ordersById = useMemo(
    () => new Map((ordersQuery.data?.orders || []).map(o => [o.id, o])),
    [ordersQuery.data?.orders],
  );
  const baysById = useMemo(
    () => new Map((pagersQuery.data?.bays || []).map(b => [b.id, b])),
    [pagersQuery.data?.bays],
  );

  const transitionMutation = useMutation({
    mutationFn: async ({
      id,
      action,
      code,
    }: {
      id: string;
      action: 'preparing' | 'ready' | 'collected' | 'recall';
      code: string;
    }) => {
      const res = await apiRequest('POST', `/api/hospitality/pagers/${id}/transition`, { action });
      return { data: await res.json(), action, id, code };
    },
    onSuccess: ({ action, id, code }) => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/pagers'] });
      if (action === 'collected') {
        setLastBumped({ id, code, expiresAt: Date.now() + 30_000 });
      } else if (action === 'recall') {
        setLastBumped(null);
        toast({ title: `Recalled Ticket ${code}` });
      } else if (action === 'ready') {
        toast({ title: `Ding! Buzzed ${code} Ready` });
      }
    },
    onError: (e: Error) => toast({ title: 'Could not update ticket', description: e.message, variant: 'destructive' }),
  });

  const toggleLineMutation = useMutation({
    mutationFn: async ({ ticketId, lineIndex }: { ticketId: string; lineIndex: number }) => {
      const res = await apiRequest(
        'POST',
        `/api/hospitality/pagers/${ticketId}/line-items/${lineIndex}/toggle`,
        {},
      );
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/orders'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/pagers'] });
    },
  });

  const snoozeItemMutation = useMutation({
    mutationFn: async ({ id, isAvailable }: { id: string; isAvailable: boolean }) => {
      const res = await apiRequest('POST', `/api/hospitality/items/${id}/snooze`, { isAvailable });
      return res.json();
    },
    onSuccess: (_d, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['/api/manager-menu'] });
      toast({ title: vars.isAvailable ? 'Item restored In Stock' : "Item marked 86'd Sold Out" });
    },
  });

  const tickets = pagersQuery.data?.tickets || [];
  const prepTickets = tickets.filter(t => t.status === 'waiting' || t.status === 'preparing');
  const readyTickets = tickets.filter(t => t.status === 'ready');
  const arrivedCars = tickets.filter(
    t => ['waiting', 'preparing', 'ready'].includes(t.status) && t.etaStatus === 'arrived',
  );
  const soldOutItems = menuItems.filter(i => !i.isAvailable);

  const filteredStockItems = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    if (!q) return soldOutItems.slice(0, 8);
    return menuItems.filter(i => i.name.toLowerCase().includes(q)).slice(0, 10);
  }, [menuItems, soldOutItems, stockSearch]);

  const showUndo = lastBumped && lastBumped.expiresAt > nowMs;

  return (
    <div
      data-surface="prep-dark"
      data-testid="page-prep-station"
      className="rounded-3xl bg-[#17132E] text-white border border-[#241E42] p-4 sm:p-6 space-y-5 max-w-[1600px]"
    >
      {/* Station Top Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <DingziMark size={38} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-[#6236FF] text-white text-xs font-extrabold">
                Barista Prep &amp; Runner Station
              </span>
              {cafe?.name && <span className="text-xs text-white/75 font-semibold">{cafe.name}</span>}
            </div>
            <h1 className="text-xl sm:text-2xl font-display font-extrabold tracking-tight mt-0.5">
              Active Prep Board ({prepTickets.length}) · On Pass ({readyTickets.length})
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showUndo && (
            <Button
              type="button"
              onClick={() =>
                transitionMutation.mutate({ id: lastBumped.id, action: 'recall', code: lastBumped.code })
              }
              className="min-h-11 rounded-xl bg-[#C8FF42] text-[#17132E] hover:bg-[#C8FF42]/90 font-extrabold cursor-pointer gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Undo Bump ({lastBumped.code})</span>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => setSoundEnabled(s => !s)}
            className="min-h-11 rounded-xl border-white/20 bg-[#241E42] text-white hover:bg-[#312959] cursor-pointer gap-1.5"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-[#C8FF42]" /> : <VolumeX className="w-4 h-4" />}
            <span>{soundEnabled ? 'Chime On' : 'Muted'}</span>
          </Button>
          <Button
            asChild
            variant="outline"
            className="min-h-11 rounded-xl border-white/20 bg-[#241E42] text-white hover:bg-[#312959] cursor-pointer"
          >
            <Link href="/admin/pagers">Full Queue Controls</Link>
          </Button>
        </div>
      </header>

      {/* Arrived Curbside Runner Alert Banner */}
      {arrivedCars.length > 0 && (
        <section
          role="alert"
          className="rounded-2xl bg-[#C8FF42] text-[#17132E] p-4 space-y-2.5 shadow-dz-volt"
        >
          <div className="flex items-center gap-2 font-display font-extrabold text-sm">
            <Car className="w-5 h-5" />
            <span>Curbside Runner Dispatch — {arrivedCars.length} Arrived</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {arrivedCars.map(car => {
              const bay = baysById.get(car.bayId || '');
              return (
                <div
                  key={car.id}
                  className="rounded-xl bg-[#17132E] text-white p-3 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 text-xs">
                    <strong className="font-mono text-sm text-[#C8FF42] block">
                      {bay?.code || 'BAY'} · {car.ticketCode}
                    </strong>
                    <span className="text-white/80 truncate block">
                      {car.vehicleColor || 'Car'} {car.vehicleType || ''} {car.licensePlate ? `· ${car.licensePlate}` : ''}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      transitionMutation.mutate({
                        id: car.id,
                        action: car.status === 'ready' ? 'collected' : 'ready',
                        code: car.ticketCode,
                      })
                    }
                    className="min-h-11 rounded-xl bg-[#C8FF42] text-[#17132E] hover:bg-[#C8FF42]/90 font-extrabold cursor-pointer shrink-0"
                  >
                    {car.status === 'ready' ? 'Delivered' : 'Buzz Ready'}
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Active Order Prep Cards */}
      <section className="space-y-3">
        {prepTickets.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#241E42] p-10 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-[#C8FF42] mx-auto" />
            <h2 className="text-lg font-display font-bold">Prep Rail Clear</h2>
            <p className="text-xs text-white/70">New counter, table, and curbside orders appear here instantaneously with a chime.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {prepTickets.map(ticket => {
              const order = ticket.orderId ? ordersById.get(ticket.orderId) : undefined;
              const lines = order?.lineItems || [];
              const elapsedMins = Math.max(0, Math.floor((nowMs - new Date(ticket.queuedAt).getTime()) / 60_000));
              const isOverdue = elapsedMins > (ticket.estimatedPrepMins || 10);
              const doneLines = lines.filter(l => Boolean(l.prepared)).length;

              return (
                <article
                  key={ticket.id}
                  className={`rounded-2xl border p-4 flex flex-col justify-between gap-4 bg-[#241E42] ${
                    isOverdue ? 'border-[#FF4D6D]' : 'border-white/15'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <strong className="text-2xl font-mono font-extrabold text-white">
                          {ticket.ticketCode}
                        </strong>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                            ticket.status === 'preparing'
                              ? 'bg-[#6236FF] text-white'
                              : 'bg-white/10 text-white/85'
                          }`}
                        >
                          {ticket.status}
                        </span>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
                          isOverdue ? 'bg-[#FF4D6D] text-white' : 'bg-[#17132E] text-white/85'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        {elapsedMins}m
                      </span>
                    </div>

                    <div className="text-xs text-white/75 flex flex-wrap items-center gap-2">
                      <span>{ticket.customerName || 'Walk-In Guest'}</span>
                      <span>·</span>
                      <span className="uppercase font-mono">{(order?.channel || ticket.source || 'counter').replace('_', ' ')}</span>
                      {lines.length > 0 && (
                        <span className="ms-auto font-mono text-[#C8FF42] font-bold">
                          {doneLines}/{lines.length} prepped
                        </span>
                      )}
                    </div>

                    {lines.length > 0 ? (
                      <ul className="space-y-1.5 pt-2 border-t border-white/10">
                        {lines.map((line, idx) => (
                          <li key={idx}>
                            <button
                              type="button"
                              onClick={() => toggleLineMutation.mutate({ ticketId: ticket.id, lineIndex: idx })}
                              className={`w-full min-h-11 px-3 py-2 rounded-xl text-left text-sm flex items-start gap-2.5 transition-colors cursor-pointer ${
                                line.prepared
                                  ? 'bg-[#17132E]/70 text-white/55 line-through'
                                  : 'bg-[#17132E] text-white hover:bg-[#312959]'
                              }`}
                            >
                              <span
                                className={`w-5 h-5 mt-0.5 rounded-md border grid place-items-center shrink-0 ${
                                  line.prepared
                                    ? 'bg-[#C8FF42] border-[#C8FF42] text-[#17132E]'
                                    : 'border-white/35'
                                }`}
                              >
                                {line.prepared && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                              </span>
                              <span className="flex-1 min-w-0">
                                <strong>{line.quantity}× {line.name}</strong>
                                {line.variantLabel ? ` (${line.variantLabel})` : ''}
                                {line.modifiers?.length ? (
                                  <span className="block text-xs text-[#C8FF42]/90">
                                    + {line.modifiers.map(m => m.label).join(', ')}
                                  </span>
                                ) : null}
                                {line.notes ? (
                                  <span className="block text-xs text-white/75 italic">“{line.notes}”</span>
                                ) : null}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      ticket.notes && <p className="text-xs text-white/80 bg-[#17132E] rounded-xl p-2.5">{ticket.notes}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {ticket.status === 'waiting' ? (
                      <Button
                        type="button"
                        disabled={transitionMutation.isPending}
                        onClick={() =>
                          transitionMutation.mutate({
                            id: ticket.id,
                            action: 'preparing',
                            code: ticket.ticketCode,
                          })
                        }
                        className="min-h-12 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-bold cursor-pointer gap-1.5"
                      >
                        <Flame className="w-4 h-4" />
                        <span>Start Prep</span>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={transitionMutation.isPending}
                        onClick={() =>
                          transitionMutation.mutate({
                            id: ticket.id,
                            action: 'recall',
                            code: ticket.ticketCode,
                          })
                        }
                        className="min-h-12 rounded-xl border-white/20 bg-[#17132E] text-white hover:bg-[#312959] cursor-pointer"
                      >
                        Step Back
                      </Button>
                    )}
                    <Button
                      type="button"
                      disabled={transitionMutation.isPending}
                      onClick={() =>
                        transitionMutation.mutate({
                          id: ticket.id,
                          action: 'ready',
                          code: ticket.ticketCode,
                        })
                      }
                      className="min-h-12 rounded-xl bg-[#C8FF42] text-[#17132E] hover:bg-[#C8FF42]/90 font-extrabold cursor-pointer gap-1.5"
                    >
                      <BellRing className="w-4 h-4" />
                      <span>Ding Ready!</span>
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Ready on Pass Strip + Quick 86'd Item Snooze */}
      <div className="grid lg:grid-cols-12 gap-4 pt-2 border-t border-white/10">
        <section className="lg:col-span-6 rounded-2xl bg-[#241E42] border border-white/10 p-4 space-y-3">
          <h2 className="text-sm font-display font-bold uppercase tracking-wide text-[#C8FF42]">
            Ready on Pass ({readyTickets.length})
          </h2>
          {readyTickets.length === 0 ? (
            <p className="text-xs text-white/65">Tickets buzzed ready wait here until collected.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {readyTickets.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    transitionMutation.mutate({ id: t.id, action: 'collected', code: t.ticketCode })
                  }
                  className="min-h-11 px-3.5 rounded-xl bg-[#17132E] border border-[#C8FF42] text-white font-mono text-sm font-bold inline-flex items-center gap-2 hover:bg-[#C8FF42] hover:text-[#17132E] transition-colors cursor-pointer"
                >
                  <span>{t.ticketCode}</span>
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-6 rounded-2xl bg-[#241E42] border border-white/10 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-display font-bold">
              1-Tap Stock Snooze ({soldOutItems.length} 86&apos;d)
            </h2>
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-white/60 absolute top-3.5 start-3 pointer-events-none" />
              <Input
                value={stockSearch}
                onChange={e => setStockSearch(e.target.value)}
                placeholder="Search item to 86 or restore…"
                className="min-h-11 ps-8 text-xs bg-[#17132E] border-white/15 text-white placeholder:text-white/50"
              />
            </div>
          </div>

          {filteredStockItems.length === 0 ? (
            <p className="text-xs text-white/65">
              All menu items are currently in stock. Type an item name above to 86 it in one tap.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {filteredStockItems.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    snoozeItemMutation.mutate({ id: item.id, isAvailable: !item.isAvailable })
                  }
                  className={`min-h-11 px-3 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    item.isAvailable
                      ? 'bg-[#17132E] text-white border-white/20 hover:border-[#FF4D6D]'
                      : 'bg-[#FF4D6D]/20 text-white border-[#FF4D6D]'
                  }`}
                >
                  {item.name} · {item.isAvailable ? 'Mark 86' : 'Restore'}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
