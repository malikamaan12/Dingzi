import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  BellRing,
  CalendarDays,
  Check,
  ExternalLink,
  Plus,
  QrCode,
  Trash2,
  Users,
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

export default function AdminTablesPage() {
  const { toast } = useToast();
  const menuQuery = useManagerMenu();
  const cafe = menuQuery.data?.restaurant;

  const [zoneName, setZoneName] = useState('');
  const [zoneNameAr, setZoneNameAr] = useState('');
  const [tableZoneId, setTableZoneId] = useState('');
  const [tableCode, setTableCode] = useState('');
  const [minCovers, setMinCovers] = useState(1);
  const [maxCovers, setMaxCovers] = useState(4);
  const [qrModal, setQrModal] = useState<{ title: string; url: string } | null>(null);

  const floorQuery = useQuery<{
    zones: any[];
    tables: any[];
    reservations: any[];
    waitlist: any[];
  }>({
    queryKey: ['/api/hospitality/floor'],
    refetchInterval: 6000,
  });

  useRealtimeStream('/api/hospitality/stream', () => {
    void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/floor'] });
  });

  const addZone = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/hospitality/zones', {
        name: zoneName.trim(),
        nameAr: zoneNameAr.trim() || null,
        order: (floorQuery.data?.zones.length || 0),
      });
      return res.json();
    },
    onSuccess: data => {
      setZoneName('');
      setZoneNameAr('');
      if (!tableZoneId) setTableZoneId(data.zone.id);
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/floor'] });
      toast({ title: 'Dining zone created' });
    },
    onError: (e: Error) => toast({ title: 'Could not add zone', description: e.message, variant: 'destructive' }),
  });

  const deleteZone = useMutation({
    mutationFn: async (id: string) => apiRequest('DELETE', `/api/hospitality/zones/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/floor'] }),
  });

  const addTable = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/hospitality/tables', {
        zoneId: tableZoneId || floorQuery.data?.zones[0]?.id,
        tableCode: tableCode.trim(),
        minCovers,
        maxCovers,
      });
      return res.json();
    },
    onSuccess: () => {
      setTableCode('');
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/floor'] });
      toast({ title: 'Table added' });
    },
    onError: (e: Error) => toast({ title: 'Could not add table', description: e.message, variant: 'destructive' }),
  });

  const deleteTable = useMutation({
    mutationFn: async (id: string) => apiRequest('DELETE', `/api/hospitality/tables/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/floor'] }),
  });

  const waitlistAction = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      const res = await apiRequest('POST', `/api/hospitality/waitlist/${id}/action`, { action });
      return res.json();
    },
    onSuccess: (_d, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/floor'] });
      if (vars.action === 'ready' || vars.action === 'rebuzz') {
        toast({ title: 'Guest waitlist pager buzzed (10-min hold started)' });
      }
    },
    onError: (e: Error) => toast({ title: 'Action blocked', description: e.message, variant: 'destructive' }),
  });

  const reservationStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest('POST', `/api/hospitality/reservations/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/floor'] }),
  });

  const zones = floorQuery.data?.zones || [];
  const tables = floorQuery.data?.tables || [];
  const reservations = (floorQuery.data?.reservations || []).filter(r => ['confirmed', 'seated'].includes(r.status));
  const waitlist = (floorQuery.data?.waitlist || []).filter(w => ['waiting', 'ready'].includes(w.status));
  const zoneById = new Map(zones.map(z => [z.id, z]));
  const tableById = new Map(tables.map(t => [t.id, t]));

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="manager-eyebrow">HOST STAND &amp; FLOOR INVENTORY</p>
          <h1 className="text-3xl font-bold">Tables, Reservations &amp; Walk-In Waitlist</h1>
          <p className="text-sm text-muted-foreground">
            Manage floor zones, permanent table QRs, conflict-free bookings, and virtual walk-in waitlist paging.
          </p>
        </div>
        {cafe && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer gap-2"
              onClick={() =>
                setQrModal({
                  title: `${cafe.name} · Host Stand Walk-In Waitlist QR`,
                  url: `${window.location.origin}/menu/${cafe.id}?action=waitlist`,
                })
              }
            >
              <QrCode className="w-4 h-4" />
              Host Stand Waitlist QR
            </Button>
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer gap-2"
              onClick={() =>
                setQrModal({
                  title: `${cafe.name} · Advance Table Booking QR`,
                  url: `${window.location.origin}/menu/${cafe.id}?action=reserve`,
                })
              }
            >
              <CalendarDays className="w-4 h-4" />
              Table Booking QR
            </Button>
          </div>
        )}
      </div>

      {/* Live Walk-In Waitlist & Upcoming Reservations */}
      <div className="grid lg:grid-cols-12 gap-5">
        <section className="lg:col-span-6 manager-panel p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Live Walk-In Waitlist ({waitlist.length})
            </h2>
          </div>
          {waitlist.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No walk-in parties waiting right now.</p>
          ) : (
            <div className="space-y-3">
              {waitlist.map(entry => (
                <div key={entry.id} className="rounded-2xl border p-4 bg-card flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-lg">{entry.ticketCode}</span>
                      <Badge variant={entry.status === 'ready' ? 'default' : 'secondary'}>{entry.status}</Badge>
                      {entry.guestResponse === 'on_my_way' && (
                        <Badge className="bg-emerald-600 text-white">On My Way!</Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium">
                      {entry.guestName} · Party of {entry.partySize}
                      {entry.zoneId && zoneById.get(entry.zoneId) ? ` · ${zoneById.get(entry.zoneId).name}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-10 cursor-pointer gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() =>
                        waitlistAction.mutate({
                          id: entry.id,
                          action: entry.status === 'ready' ? 'rebuzz' : 'ready',
                        })
                      }
                    >
                      <BellRing className="w-3.5 h-3.5" />
                      {entry.status === 'ready' ? `Re-buzz (${entry.buzzCount})` : 'Table Ready (10m)'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="min-h-10 cursor-pointer gap-1"
                      onClick={() => waitlistAction.mutate({ id: entry.id, action: 'seated' })}
                    >
                      <Check className="w-3.5 h-3.5" />
                      Seat
                    </Button>
                    <a
                      href={`/waitlist/${entry.trackingToken}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                    >
                      Pass <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-6 manager-panel p-5 space-y-4">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            Active Table Reservations ({reservations.length})
          </h2>
          {reservations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No upcoming reservations scheduled.</p>
          ) : (
            <div className="space-y-3">
              {reservations.map(res => {
                const table = tableById.get(res.tableId);
                return (
                  <div key={res.id} className="rounded-2xl border p-4 bg-card flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm px-2 py-0.5 rounded bg-primary/10 text-primary">
                          {table?.tableCode || 'Table'}
                        </span>
                        <span className="font-semibold text-sm">{res.guestName}</span>
                        <Badge variant="outline">Party of {res.partySize}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(res.startAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} · {res.guestPhone}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {res.status === 'confirmed' && (
                        <Button
                          type="button"
                          size="sm"
                          className="min-h-10 cursor-pointer"
                          onClick={() => reservationStatus.mutate({ id: res.id, status: 'seated' })}
                        >
                          Seat Party
                        </Button>
                      )}
                      {res.status === 'seated' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="min-h-10 cursor-pointer"
                          onClick={() => reservationStatus.mutate({ id: res.id, status: 'completed' })}
                        >
                          Complete Turn
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive cursor-pointer"
                        onClick={() => reservationStatus.mutate({ id: res.id, status: 'no_show' })}
                      >
                        No-Show
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Zones & Tables Setup */}
      <div className="grid lg:grid-cols-12 gap-5">
        <form
          onSubmit={e => {
            e.preventDefault();
            addZone.mutate();
          }}
          className="lg:col-span-5 manager-panel p-5 space-y-4"
        >
          <h2 className="font-bold text-base">1. Dining Zones</h2>
          <div className="grid sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Zone Name (English) *</Label>
              <Input value={zoneName} onChange={e => setZoneName(e.target.value)} placeholder="Indoor Lounge" required className="h-10" />
            </div>
            <div>
              <Label className="text-xs">Arabic Label</Label>
              <Input value={zoneNameAr} onChange={e => setZoneNameAr(e.target.value)} placeholder="الصالة الداخلية" className="h-10" />
            </div>
          </div>
          <Button type="submit" size="sm" className="cursor-pointer gap-1" disabled={!zoneName.trim() || addZone.isPending}>
            <Plus className="w-4 h-4" />
            Add Zone
          </Button>

          <div className="space-y-1.5 pt-2">
            {zones.map(z => (
              <div key={z.id} className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
                <span>
                  <strong>{z.name}</strong> {z.nameAr ? <small className="text-muted-foreground">({z.nameAr})</small> : null}
                </span>
                <button
                  type="button"
                  aria-label={`Delete zone ${z.name}`}
                  onClick={() => deleteZone.mutate(z.id)}
                  className="text-muted-foreground hover:text-destructive cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </form>

        <form
          onSubmit={e => {
            e.preventDefault();
            addTable.mutate();
          }}
          className="lg:col-span-7 manager-panel p-5 space-y-4"
        >
          <h2 className="font-bold text-base">2. Floor Tables &amp; Dine-In Table QRs</h2>
          <div className="grid sm:grid-cols-4 gap-2 items-end">
            <div>
              <Label className="text-xs">Zone *</Label>
              <select
                className="manager-select w-full h-10 text-sm"
                value={tableZoneId || zones[0]?.id || ''}
                onChange={e => setTableZoneId(e.target.value)}
                required
              >
                {zones.length === 0 && <option value="">Add a zone first</option>}
                {zones.map(z => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Table Code *</Label>
              <Input value={tableCode} onChange={e => setTableCode(e.target.value)} placeholder="T-01" required className="h-10 font-mono" />
            </div>
            <div>
              <Label className="text-xs">Min / Max Covers</Label>
              <div className="flex gap-1">
                <Input type="number" min={1} max={30} value={minCovers} onChange={e => setMinCovers(Number(e.target.value))} className="h-10" />
                <Input type="number" min={1} max={30} value={maxCovers} onChange={e => setMaxCovers(Number(e.target.value))} className="h-10" />
              </div>
            </div>
            <Button type="submit" className="h-10 cursor-pointer gap-1" disabled={!zones.length || !tableCode.trim() || addTable.isPending}>
              <Plus className="w-4 h-4" />
              Add Table
            </Button>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2 pt-2">
            {tables.map(t => (
              <div key={t.id} className="rounded-xl border p-3 text-xs flex items-center justify-between gap-2">
                <div>
                  <strong className="font-mono text-sm block">{t.tableCode}</strong>
                  <span className="text-muted-foreground">
                    {zoneById.get(t.zoneId)?.name || 'Zone'} · {t.minCovers}–{t.maxCovers} seats
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {cafe && (
                    <button
                      type="button"
                      aria-label={`Table ${t.tableCode} QR`}
                      onClick={() =>
                        setQrModal({
                          title: `Table ${t.tableCode} Dine-In QR`,
                          url: `${window.location.origin}/table/${t.qrToken}`,
                        })
                      }
                      className="p-1.5 rounded-lg border hover:bg-muted cursor-pointer"
                    >
                      <QrCode className="w-4 h-4 text-primary" />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Delete table ${t.tableCode}`}
                    onClick={() => deleteTable.mutate(t.id)}
                    className="p-1.5 text-muted-foreground hover:text-destructive cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </form>
      </div>

      <Dialog open={Boolean(qrModal)} onOpenChange={open => !open && setQrModal(null)}>
        <DialogContent className="max-w-sm text-center rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-center">{qrModal?.title}</DialogTitle>
            <DialogDescription className="text-center">Permanent QR target — never breaks across menu updates.</DialogDescription>
          </DialogHeader>
          {qrModal && (
            <div className="space-y-3 py-2">
              <div className="grid place-items-center">
                <LocalQrBox url={qrModal.url} size={196} />
              </div>
              <p className="text-xs font-mono break-all text-muted-foreground">{qrModal.url}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
