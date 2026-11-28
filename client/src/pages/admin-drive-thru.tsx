import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { BellRing, Car, CheckCircle2, Clock, ExternalLink, Plus, QrCode, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useManagerMenu } from '@/lib/managerMenu';
import { playStaffArrivalChime } from '@/lib/pagerAudio';
import { useRealtimeStream } from '@/lib/useRealtimeStream';
import { LocalQrBox } from '@/components/hospitality/LocalQrBox';
import { NfcEncodeDialog } from '@/components/qr-nfc/NfcEncodeDialog';
import { publicExperienceOrigin } from '@shared/menuIdentity';

const VEHICLE_SWATCH: Record<string, string> = {
  White: '#F8FAFC',
  Black: '#0F172A',
  Silver: '#CBD5E1',
  Gray: '#64748B',
  Blue: '#2563EB',
  Red: '#DC2626',
  Sand: '#D4A373',
  Green: '#15803D',
};

export default function AdminDriveThruPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const menuQuery = useManagerMenu();
  const cafe = menuQuery.data?.restaurant;

  const isManager =
    user?.role === 'super_admin' ||
    user?.staffRole === 'tenant_owner' ||
    user?.staffRole === 'branch_manager';

  const [showWalkUpForm, setShowWalkUpForm] = useState(false);
  const [showBaySetup, setShowBaySetup] = useState(false);

  const [bayCode, setBayCode] = useState('');
  const [bayLabel, setBayLabel] = useState('');
  const [bayType, setBayType] = useState<'curbside' | 'drive_thru'>('curbside');
  const [qrBay, setQrBay] = useState<any | null>(null);
  const [carPagerTicket, setCarPagerTicket] = useState<any | null>(null);

  const [csBayId, setCsBayId] = useState('');
  const [csColor, setCsColor] = useState('White');
  const [csType, setCsType] = useState<'SUV' | 'Sedan' | 'Pickup' | 'Coupe' | 'Other'>('SUV');
  const [csPlate, setCsPlate] = useState('');
  const [csCustomer, setCsCustomer] = useState('');

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, []);

  const query = useQuery<{ bays: any[]; activeVehicles: any[] }>({
    queryKey: ['/api/hospitality/bays'],
    refetchInterval: 5000,
  });

  useRealtimeStream('/api/hospitality/stream', ev => {
    void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/bays'] });
    if (ev.type === 'curbside.arrived') {
      playStaffArrivalChime();
      toast({
        title: `Car Arrived · ${ev.data?.bay?.code || 'Curbside'}`,
        description: `${ev.data?.ticket?.vehicleColor || ''} ${ev.data?.ticket?.vehicleType || ''} (${ev.data?.ticket?.licensePlate || ''})`,
      });
    }
  });

  const addBay = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/hospitality/bays', {
        code: bayCode.trim(),
        label: bayLabel.trim(),
        bayType,
        order: query.data?.bays.length || 0,
      });
      return res.json();
    },
    onSuccess: () => {
      setBayCode('');
      setBayLabel('');
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/bays'] });
      toast({ title: 'Parking bay added' });
    },
    onError: (e: Error) => toast({ title: 'Could not add bay', description: e.message, variant: 'destructive' }),
  });

  const issueCarSidePager = useMutation({
    mutationFn: async () => {
      if (!cafe) throw new Error('Venue not loaded');
      const targetBayId = csBayId || query.data?.bays[0]?.id;
      if (!targetBayId) throw new Error('Add at least one bay first');
      const res = await apiRequest('POST', '/api/public/curbside/checkin', {
        restaurantId: cafe.id,
        bayId: targetBayId,
        etaStatus: 'arrived',
        customerName: csCustomer.trim() || undefined,
        vehicleColor: csColor,
        vehicleType: csType,
        licensePlate: csPlate.trim(),
      });
      return res.json();
    },
    onSuccess: data => {
      setCsPlate('');
      setCsCustomer('');
      setShowWalkUpForm(false);
      setCarPagerTicket(data.ticket);
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/bays'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/pagers'] });
      toast({
        title: `Car Pager ${data.ticket.ticketCode} ready`,
        description: 'Ask the driver to scan the QR code.',
      });
    },
    onError: (e: Error) => toast({ title: 'Could not issue car pager', description: e.message, variant: 'destructive' }),
  });

  const deleteBay = useMutation({
    mutationFn: async (id: string) => apiRequest('DELETE', `/api/hospitality/bays/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/bays'] }),
  });

  const pagerTransition = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      const res = await apiRequest('POST', `/api/hospitality/pagers/${id}/transition`, { action });
      return res.json();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/bays'] }),
  });

  const bays = query.data?.bays || [];
  const vehicles = query.data?.activeVehicles || [];
  const bayById = new Map(bays.map(b => [b.id, b]));
  const publicBase = publicExperienceOrigin(typeof window !== 'undefined' ? window.location.origin : '');

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Curbside Cars</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            See which cars are parked outside, ring their phones, and hand off orders.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {bays.length > 0 && (
            <Button
              type="button"
              onClick={() => setShowWalkUpForm(v => !v)}
              className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white cursor-pointer gap-2 flex-1 sm:flex-none"
            >
              <Plus className="w-4 h-4" />
              <span>Check In Car</span>
            </Button>
          )}
          {isManager && (
            <Button
              type="button"
              variant={showBaySetup ? 'default' : 'outline'}
              onClick={() => setShowBaySetup(v => !v)}
              className="min-h-11 rounded-xl cursor-pointer gap-2 flex-1 sm:flex-none"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>{showBaySetup ? 'Done Editing Bays' : 'Manage Bays'}</span>
            </Button>
          )}
        </div>
      </header>

      {/* Progressive Disclosure: Walk-Up Car Check-In */}
      {showWalkUpForm && bays.length > 0 && (
        <form
          onSubmit={e => {
            e.preventDefault();
            issueCarSidePager.mutate();
          }}
          className="rounded-2xl border bg-card p-5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm">Check In Waiting Car</h2>
            <button
              type="button"
              aria-label="Close car check-in form"
              onClick={() => setShowWalkUpForm(false)}
              className="w-9 h-9 rounded-lg grid place-items-center text-muted-foreground hover:bg-muted cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
            <div>
              <Label className="text-xs">Bay *</Label>
              <select
                className="manager-select w-full min-h-11 text-sm mt-1"
                value={csBayId || bays[0]?.id || ''}
                onChange={e => setCsBayId(e.target.value)}
              >
                {bays.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Car Color</Label>
              <select className="manager-select w-full min-h-11 text-sm mt-1" value={csColor} onChange={e => setCsColor(e.target.value)}>
                {Object.keys(VEHICLE_SWATCH).map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Car Type</Label>
              <select className="manager-select w-full min-h-11 text-sm mt-1" value={csType} onChange={e => setCsType(e.target.value as any)}>
                {['SUV', 'Sedan', 'Pickup', 'Coupe', 'Other'].map(v => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Plate # *</Label>
              <Input
                value={csPlate}
                onChange={e => setCsPlate(e.target.value)}
                placeholder="QAT 84210"
                required
                className="min-h-11 font-mono uppercase mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Driver Name</Label>
              <Input value={csCustomer} onChange={e => setCsCustomer(e.target.value)} placeholder="Optional" className="min-h-11 mt-1" />
            </div>
            <Button type="submit" className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white cursor-pointer gap-1.5" disabled={!csPlate.trim() || issueCarSidePager.isPending}>
              <QrCode className="w-4 h-4" />
              Give Car Pager
            </Button>
          </div>
        </form>
      )}

      {/* Live Arrived Vehicles Dispatch Board */}
      <section className="space-y-3">
        <h2 className="text-base font-bold flex items-center gap-2">
          <Car className="w-5 h-5 text-[#6236FF]" />
          <span>Cars Outside Now ({vehicles.length})</span>
        </h2>
        {vehicles.length === 0 ? (
          <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
            No cars waiting outside right now. When a guest scans a Parking Bay QR, their car color and plate appear here immediately.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {vehicles.map(v => {
              const bay = v.bayId ? bayById.get(v.bayId) : null;
              const waitMins = v.arrivedAt
                ? Math.max(0, Math.floor((now - new Date(v.arrivedAt).getTime()) / 60_000))
                : 0;
              return (
                <article
                  key={v.id}
                  data-testid={`card-curbside-vehicle-${v.licensePlate || v.ticketCode}`}
                  className="rounded-2xl border-2 border-[#6236FF]/35 bg-card p-4 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between rounded-xl bg-[#17132E] text-white px-3 py-2">
                    <span className="px-2.5 py-1 rounded-lg bg-[#C8FF42] text-[#17132E] font-mono font-black text-xs">
                      {bay ? `PARKED · ${bay.code}` : 'ON THE WAY'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-white/80">
                      <Clock className="w-3.5 h-3.5 text-[#C8FF42]" />
                      {v.etaStatus === '5_mins_away' ? '5 mins away' : `${waitMins}m waiting`}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border p-3 bg-muted/40">
                    <span
                      className="w-8 h-8 rounded-full border-2 border-slate-400 shrink-0"
                      style={{ backgroundColor: VEHICLE_SWATCH[v.vehicleColor] || '#57507A' }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <strong className="block text-sm font-mono">{v.licensePlate || 'NO PLATE'}</strong>
                      <span className="text-xs text-muted-foreground">
                        {v.vehicleColor || 'Car'} {v.vehicleType || ''} · Pager {v.ticketCode}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Show QR for ${v.ticketCode}`}
                      onClick={() => setCarPagerTicket(v)}
                      className="w-11 h-11 rounded-xl border hover:bg-muted grid place-items-center shrink-0 cursor-pointer"
                    >
                      <QrCode className="w-4 h-4 text-[#6236FF]" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      className="min-h-11 rounded-xl cursor-pointer gap-1 bg-[#C8FF42] hover:bg-[#b8f52c] text-[#17132E] font-extrabold border-0"
                      onClick={() => pagerTransition.mutate({ id: v.id, action: 'ready' })}
                    >
                      <BellRing className="w-4 h-4" />
                      Ring Car
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11 rounded-xl cursor-pointer gap-1"
                      onClick={() => pagerTransition.mutate({ id: v.id, action: 'collected' })}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Delivered
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Parking Bay Signs (Read-only QR access for Reception; Add/Delete only when Manager clicks Manage Bays) */}
      {bays.length > 0 && (
        <section className="rounded-2xl border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base">Parking Bays ({bays.length})</h2>
            <span className="text-xs text-muted-foreground">Tap QR to print or write NFC bay sign</span>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {bays.map(bay => (
              <div key={bay.id} className="rounded-xl border p-3 flex items-center justify-between gap-2 text-xs">
                <div>
                  <div className="flex items-center gap-1.5">
                    <strong className="font-mono text-sm">{bay.code}</strong>
                    <Badge variant="outline">{bay.bayType === 'drive_thru' ? 'Lane' : 'Bay'}</Badge>
                  </div>
                  <span className="text-muted-foreground block mt-0.5">{bay.label}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    aria-label={`QR code for ${bay.code}`}
                    onClick={() => setQrBay(bay)}
                    className="w-11 h-11 rounded-xl border hover:bg-muted grid place-items-center cursor-pointer"
                  >
                    <QrCode className="w-4 h-4 text-[#6236FF]" />
                  </button>
                  {isManager && showBaySetup && (
                    <button
                      type="button"
                      aria-label={`Delete ${bay.code}`}
                      onClick={() => deleteBay.mutate(bay.id)}
                      className="w-11 h-11 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 grid place-items-center cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {isManager && showBaySetup && (
        <section className="rounded-2xl border bg-card p-5 space-y-4">
          <h2 className="font-bold text-base">Add Curbside Bay or Drive-Thru Lane</h2>
          <form
            onSubmit={e => {
              e.preventDefault();
              addBay.mutate();
            }}
            className="grid sm:grid-cols-4 gap-3 items-end"
          >
            <div>
              <Label className="text-xs">Bay Code *</Label>
              <Input
                value={bayCode}
                onChange={e => setBayCode(e.target.value)}
                placeholder="BAY-03"
                required
                className="min-h-11 font-mono uppercase mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Sign Label *</Label>
              <Input
                value={bayLabel}
                onChange={e => setBayLabel(e.target.value)}
                placeholder="Curbside Spot 3"
                required
                className="min-h-11 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <select className="manager-select w-full min-h-11 text-sm mt-1" value={bayType} onChange={e => setBayType(e.target.value as any)}>
                <option value="curbside">Curbside Parking Bay</option>
                <option value="drive_thru">Drive-Thru Lane</option>
              </select>
            </div>
            <Button type="submit" className="min-h-11 rounded-xl cursor-pointer gap-1" disabled={!bayCode.trim() || !bayLabel.trim() || addBay.isPending}>
              <Plus className="w-4 h-4" />
              Add Bay
            </Button>
          </form>
        </section>
      )}

      <NfcEncodeDialog
        target={
          qrBay
            ? {
                venueName: cafe?.name || 'dingzi',
                title: `${qrBay.code} — ${qrBay.label}`,
                code: qrBay.code,
                qrUrl: `${publicBase}/bay/${qrBay.qrToken}`,
                nfcUrl: `${publicBase}/bay/${qrBay.qrToken}`,
                accentHex: cafe?.brandAccentHex,
              }
            : null
        }
        onClose={() => setQrBay(null)}
      />

      <Dialog open={Boolean(carPagerTicket)} onOpenChange={open => !open && setCarPagerTicket(null)}>
        <DialogContent className="max-w-sm text-center rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-center font-mono text-2xl">{carPagerTicket?.ticketCode}</DialogTitle>
            <DialogDescription className="text-center">
              Ask the driver to scan so only their phone rings when ready.
            </DialogDescription>
          </DialogHeader>
          {carPagerTicket && (
            <div className="space-y-3 py-2">
              <div className="grid place-items-center">
                <LocalQrBox url={`${publicBase}/pager/${carPagerTicket.trackingToken}`} size={196} />
              </div>
              <a
                href={`/pager/${carPagerTicket.trackingToken}?preview=1`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                <span>Open Silent Preview</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
