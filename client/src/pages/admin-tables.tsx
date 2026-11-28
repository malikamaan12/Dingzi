import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  BellRing,
  CalendarDays,
  Check,
  Clock,
  Plus,
  QrCode,
  SlidersHorizontal,
  Trash2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { useManagerMenu } from '@/lib/managerMenu';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeStream } from '@/lib/useRealtimeStream';
import { NfcEncodeDialog, type NfcEncodeTarget } from '@/components/qr-nfc/NfcEncodeDialog';
import { publicExperienceOrigin } from '@shared/menuIdentity';

export default function AdminTablesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const menuQuery = useManagerMenu();
  const cafe = menuQuery.data?.restaurant;

  const isManager =
    user?.role === 'super_admin' ||
    user?.staffRole === 'tenant_owner' ||
    user?.staffRole === 'branch_manager';

  const [showFloorSetup, setShowFloorSetup] = useState(false);
  const [zoneName, setZoneName] = useState('');
  const [zoneNameAr, setZoneNameAr] = useState('');
  const [tableZoneId, setTableZoneId] = useState('');
  const [tableCode, setTableCode] = useState('');
  const [minCovers, setMinCovers] = useState(1);
  const [maxCovers, setMaxCovers] = useState(4);
  const [isCombinable, setIsCombinable] = useState(false);
  const [qrModal, setQrModal] = useState<NfcEncodeTarget | null>(null);
  const [now, setNow] = useState(Date.now());
  const publicBase = publicExperienceOrigin(typeof window !== 'undefined' ? window.location.origin : '');

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, []);

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
        order: floorQuery.data?.zones.length || 0,
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
        isCombinable,
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
        toast({ title: 'Guest notified table is ready' });
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
  const seatedTableIds = new Set(reservations.filter(r => r.status === 'seated').map(r => r.tableId));

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Tables &amp; Seating</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Notify waiting guests, seat reservations, and view floor tables.
          </p>
        </div>
        {cafe && (
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-xl cursor-pointer gap-2 flex-1 sm:flex-none"
              onClick={() =>
                setQrModal({
                  venueName: cafe.name,
                  title: 'Walk-In Waitlist QR',
                  code: 'WAITLIST',
                  qrUrl: `${publicBase}/menu/${cafe.id}?action=waitlist`,
                  nfcUrl: `${publicBase}/menu/${cafe.id}?action=waitlist`,
                  accentHex: cafe.brandAccentHex,
                })
              }
            >
              <QrCode className="w-4 h-4 text-[#6236FF]" />
              <span>Waitlist QR</span>
            </Button>
            {isManager && (
              <Button
                type="button"
                variant={showFloorSetup ? 'default' : 'outline'}
                onClick={() => setShowFloorSetup(v => !v)}
                className="min-h-11 rounded-xl cursor-pointer gap-2 flex-1 sm:flex-none"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>{showFloorSetup ? 'Done Editing Floor' : 'Edit Floor & Zones'}</span>
              </Button>
            )}
          </div>
        )}
      </header>

      {/* Live Walk-In Waitlist & Upcoming Reservations */}
      <div className="grid lg:grid-cols-12 gap-5">
        <section className="lg:col-span-6 rounded-2xl border bg-card p-5 space-y-4">
          <h2 className="font-bold text-base flex items-center gap-2">
            <Users className="w-5 h-5 text-[#6236FF]" />
            <span>Walk-In Waitlist ({waitlist.length})</span>
          </h2>

          {waitlist.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No walk-in guests waiting right now.</p>
          ) : (
            <div className="divide-y rounded-xl border">
              {waitlist.map(entry => {
                const holdSecsLeft = entry.holdExpiresAt
                  ? Math.max(0, Math.ceil((new Date(entry.holdExpiresAt).getTime() - now) / 1000))
                  : null;
                const holdLabel =
                  holdSecsLeft !== null
                    ? holdSecsLeft > 0
                      ? `${Math.floor(holdSecsLeft / 60)}:${String(holdSecsLeft % 60).padStart(2, '0')} left`
                      : 'Hold expired'
                    : null;
                return (
                  <div key={entry.id} className="p-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-black text-base">{entry.ticketCode}</span>
                        <span className="font-semibold text-sm">{entry.guestName}</span>
                        <Badge variant="outline" className="text-xs">
                          {entry.partySize} {entry.partySize === 1 ? 'guest' : 'guests'}
                        </Badge>
                        {entry.guestResponse === 'on_my_way' && (
                          <Badge className="bg-[#C8FF42] text-[#17132E] hover:bg-[#C8FF42] font-bold border-0">
                            On Their Way
                          </Badge>
                        )}
                        {holdLabel && (
                          <span className="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded bg-muted">
                            <Clock className="w-3 h-3" />
                            {holdLabel}
                          </span>
                        )}
                      </div>
                      {entry.zoneId && zoneById.get(entry.zoneId) && (
                        <p className="text-xs text-muted-foreground">{zoneById.get(entry.zoneId).name}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-11 rounded-xl cursor-pointer gap-1 bg-[#C8FF42] hover:bg-[#b8f52c] text-[#17132E] font-bold border-0"
                        onClick={() =>
                          waitlistAction.mutate({
                            id: entry.id,
                            action: entry.status === 'ready' ? 'rebuzz' : 'ready',
                          })
                        }
                      >
                        <BellRing className="w-3.5 h-3.5" />
                        {entry.status === 'ready' ? 'Ring Again' : 'Table Ready'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white cursor-pointer gap-1"
                        onClick={() => waitlistAction.mutate({ id: entry.id, action: 'seated' })}
                      >
                        <Check className="w-3.5 h-3.5" />
                        Seat
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="min-h-11 text-muted-foreground hover:text-destructive cursor-pointer"
                        onClick={() => waitlistAction.mutate({ id: entry.id, action: 'expired' })}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="lg:col-span-6 rounded-2xl border bg-card p-5 space-y-4">
          <h2 className="font-bold text-base flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-[#6236FF]" />
            <span>Reservations ({reservations.length})</span>
          </h2>

          {reservations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No upcoming reservations scheduled.</p>
          ) : (
            <div className="divide-y rounded-xl border">
              {reservations.map(res => {
                const table = tableById.get(res.tableId);
                return (
                  <div key={res.id} className="p-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-[#EFEAFF] text-[#4B1FE0]">
                          {table?.tableCode || 'Table'}
                        </span>
                        <span className="font-semibold text-sm">{res.guestName}</span>
                        <Badge variant="outline" className="text-xs">
                          {res.partySize} {res.partySize === 1 ? 'guest' : 'guests'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">
                        {new Date(res.startAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                        {res.guestPhone ? ` · ${res.guestPhone}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {res.status === 'confirmed' && (
                        <Button
                          type="button"
                          size="sm"
                          className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white cursor-pointer"
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
                          className="min-h-11 rounded-xl cursor-pointer"
                          onClick={() => reservationStatus.mutate({ id: res.id, status: 'completed' })}
                        >
                          Finish Table
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="min-h-11 text-muted-foreground hover:text-destructive cursor-pointer"
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

      {/* Clean Visual Floor Overview (Read-only for Reception, QR accessible in 1 tap) */}
      <section className="rounded-2xl border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base">Floor Tables ({tables.length})</h2>
          <span className="text-xs text-muted-foreground">Tap QR to show or print a table’s menu code</span>
        </div>

        {tables.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No floor tables configured yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {tables.map(t => {
              const isSeated = seatedTableIds.has(t.id);
              return (
                <div
                  key={t.id}
                  className={`rounded-2xl border p-3.5 flex items-center justify-between gap-2 ${
                    isSeated ? 'border-[#6236FF] bg-[#EFEAFF]/40' : 'bg-background'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="font-mono text-base">{t.tableCode}</strong>
                      <Badge variant={isSeated ? 'default' : 'secondary'} className="text-[11px]">
                        {isSeated ? 'Seated' : 'Open'}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground block mt-0.5">
                      {zoneById.get(t.zoneId)?.name || 'Main Floor'} · {t.minCovers}–{t.maxCovers} seats
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {cafe && (
                      <button
                        type="button"
                        aria-label={`Table ${t.tableCode} QR`}
                        onClick={() =>
                          setQrModal({
                            venueName: cafe.name,
                            title: `Table ${t.tableCode} Menu`,
                            code: t.tableCode,
                            qrUrl: `${publicBase}/table/${t.qrToken}`,
                            nfcUrl: `${publicBase}/table/${t.qrToken}`,
                            accentHex: cafe.brandAccentHex,
                          })
                        }
                        className="w-11 h-11 rounded-xl border hover:bg-muted grid place-items-center cursor-pointer"
                      >
                        <QrCode className="w-4 h-4 text-[#6236FF]" />
                      </button>
                    )}
                    {isManager && showFloorSetup && (
                      <button
                        type="button"
                        aria-label={`Delete table ${t.tableCode}`}
                        onClick={() => deleteTable.mutate(t.id)}
                        className="w-11 h-11 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 grid place-items-center cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Manager-Only Collapsible Floor & Zone Setup */}
      {isManager && showFloorSetup && (
        <div className="grid lg:grid-cols-12 gap-5 pt-2">
          <form
            onSubmit={e => {
              e.preventDefault();
              addZone.mutate();
            }}
            className="lg:col-span-5 rounded-2xl border bg-card p-5 space-y-4"
          >
            <h2 className="font-bold text-base">Add Dining Zone</h2>
            <div className="grid sm:grid-cols-2 gap-2.5">
              <div>
                <Label className="text-xs">Zone Name (English) *</Label>
                <Input value={zoneName} onChange={e => setZoneName(e.target.value)} placeholder="Indoor Lounge" required className="min-h-11 mt-1" />
              </div>
              <div>
                <Label className="text-xs">Arabic Label</Label>
                <Input value={zoneNameAr} onChange={e => setZoneNameAr(e.target.value)} placeholder="الصالة الداخلية" className="min-h-11 mt-1" />
              </div>
            </div>
            <Button type="submit" size="sm" className="min-h-11 rounded-xl cursor-pointer gap-1" disabled={!zoneName.trim() || addZone.isPending}>
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
                    className="w-11 h-11 rounded-xl grid place-items-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
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
            className="lg:col-span-7 rounded-2xl border bg-card p-5 space-y-4"
          >
            <h2 className="font-bold text-base">Add Table to Floor</h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-2.5 items-end">
              <div>
                <Label className="text-xs">Zone *</Label>
                <select
                  className="manager-select w-full min-h-11 text-sm mt-1"
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
                <Input value={tableCode} onChange={e => setTableCode(e.target.value)} placeholder="T-05" required className="min-h-11 font-mono mt-1" />
              </div>
              <div>
                <Label className="text-xs">Min / Max Seats</Label>
                <div className="flex gap-1 mt-1">
                  <Input type="number" min={1} max={30} value={minCovers} onChange={e => setMinCovers(Number(e.target.value))} className="min-h-11" />
                  <Input type="number" min={1} max={30} value={maxCovers} onChange={e => setMaxCovers(Number(e.target.value))} className="min-h-11" />
                </div>
              </div>
              <Button type="submit" className="min-h-11 rounded-xl cursor-pointer gap-1" disabled={!zones.length || !tableCode.trim() || addTable.isPending}>
                <Plus className="w-4 h-4" />
                Add Table
              </Button>
            </div>
            <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={isCombinable} onChange={e => setIsCombinable(e.target.checked)} className="accent-primary" />
              <span>Allow combining with adjacent tables for larger groups</span>
            </label>
          </form>
        </div>
      )}

      <NfcEncodeDialog target={qrModal} onClose={() => setQrModal(null)} />
    </div>
  );
}
