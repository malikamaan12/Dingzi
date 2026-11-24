import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { BellRing, Car, CheckCircle2, Clock, Download, ExternalLink, Plus, QrCode, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useManagerMenu } from '@/lib/managerMenu';
import { playStaffArrivalChime } from '@/lib/pagerAudio';
import { useRealtimeStream } from '@/lib/useRealtimeStream';
import { LocalQrBox } from '@/components/hospitality/LocalQrBox';
import QRCodeStyling from 'qr-code-styling';

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
  const { toast } = useToast();
  const menuQuery = useManagerMenu();
  const cafe = menuQuery.data?.restaurant;

  const [bayCode, setBayCode] = useState('');
  const [bayLabel, setBayLabel] = useState('');
  const [bayType, setBayType] = useState<'curbside' | 'drive_thru'>('curbside');
  const [qrBay, setQrBay] = useState<any | null>(null);
  const [carPagerTicket, setCarPagerTicket] = useState<any | null>(null);

  // Car-Side Pager Issuer state (PRD §4.4.2)
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
        title: `Vehicle Arrived · ${ev.data?.bay?.code || 'Curbside'}`,
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
      toast({ title: 'Service bay created' });
    },
    onError: (e: Error) => toast({ title: 'Could not add bay', description: e.message, variant: 'destructive' }),
  });

  const issueCarSidePager = useMutation({
    mutationFn: async () => {
      if (!cafe) throw new Error('Venue not loaded');
      const targetBayId = csBayId || query.data?.bays[0]?.id;
      if (!targetBayId) throw new Error('Add at least one bay or lane first');
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
      setCarPagerTicket(data.ticket);
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/bays'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/pagers'] });
      toast({
        title: `Car-Side Pager ${data.ticket.ticketCode} Linked`,
        description: 'Have the driver scan the QR to receive lock-screen ready ringing.',
      });
    },
    onError: (e: Error) => toast({ title: 'Could not issue car-side pager', description: e.message, variant: 'destructive' }),
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

  async function downloadBaySignageSvg(bay: any) {
    const qr = new QRCodeStyling({
      width: 600,
      height: 600,
      type: 'svg',
      data: `${window.location.origin}/bay/${bay.qrToken}`,
      margin: 24,
      dotsOptions: { color: '#17132E', type: 'rounded' },
      backgroundOptions: { color: '#FFFFFF' },
      cornersSquareOptions: { type: 'extra-rounded', color: '#6236FF' },
      cornersDotOptions: { type: 'dot', color: '#4B1FE0' },
    });
    await qr.download({ extension: 'svg', name: `dingzi-bay-${bay.code.toLowerCase()}` });
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <p className="manager-eyebrow">RUNNER &amp; DRIVE-THRU DISPATCH</p>
        <h1 className="text-2xl sm:text-3xl font-bold">Drive-Thru Lanes &amp; Curbside Pickup Board</h1>
        <p className="text-sm text-muted-foreground">
          Live arrived-vehicle identification with car color swatches, license plates, car-side pager linking, and printable Bay QR bollards.
        </p>
      </div>

      {/* Live Arrived Vehicles Dispatch Board */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Car className="w-5 h-5 text-primary" />
          Active Drive-Thru &amp; Curbside Vehicles ({vehicles.length})
        </h2>
        {vehicles.length === 0 ? (
          <div className="manager-panel p-10 text-center text-muted-foreground">
            No vehicles checked into bays right now. Guests scanning a Bay QR or issued a Car-Side Pager appear here immediately with an arrival chime.
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
                  className="rounded-2xl border-2 border-[#6236FF]/45 bg-card p-4 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between rounded-xl bg-[#17132E] text-white px-3 py-2">
                    <span className="px-2.5 py-1 rounded-lg bg-[#C8FF42] text-[#17132E] font-mono font-black text-xs">
                      {bay ? `BAY ARRIVED · ${bay.code}` : 'EN ROUTE'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-white/80">
                      <Clock className="w-3.5 h-3.5 text-[#C8FF42]" />
                      {v.etaStatus === '5_mins_away' ? 'ETA 5 mins' : `Waiting ${waitMins}m`}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border p-3 bg-muted/40">
                    <span
                      className="w-8 h-8 rounded-full border-2 border-slate-400 shrink-0"
                      style={{ backgroundColor: VEHICLE_SWATCH[v.vehicleColor] || '#94A3B8' }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <strong className="block text-sm font-mono">{v.licensePlate || 'NO PLATE'}</strong>
                      <span className="text-xs text-muted-foreground">
                        {v.vehicleColor || 'Car'} {v.vehicleType || ''} · Ticket {v.ticketCode}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Show QR for ${v.ticketCode}`}
                      onClick={() => setCarPagerTicket(v)}
                      className="w-11 h-11 rounded-xl border hover:bg-muted grid place-items-center shrink-0 cursor-pointer"
                    >
                      <QrCode className="w-4 h-4 text-primary" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      className="min-h-11 cursor-pointer gap-1 bg-[#C8FF42] hover:bg-[#b8f52c] text-[#17132E] font-extrabold border-0"
                      onClick={() => pagerTransition.mutate({ id: v.id, action: 'ready' })}
                    >
                      <BellRing className="w-4 h-4" />
                      Buzz Car
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11 cursor-pointer gap-1"
                      onClick={() => pagerTransition.mutate({ id: v.id, action: 'collected' })}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Handed Off
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Car-Side Order & Pager Linker (PRD §4.4.2) */}
      {bays.length > 0 && (
        <section className="manager-panel p-5 space-y-4">
          <div>
            <h2 className="font-bold text-base">Car-Side Virtual Pager Linker (Window &amp; Runner Orders)</h2>
            <p className="text-xs text-muted-foreground">
              Take an order car-side in any mode and link a live Virtual Pager QR directly to the guest’s bay and vehicle.
            </p>
          </div>
          <form
            onSubmit={e => {
              e.preventDefault();
              issueCarSidePager.mutate();
            }}
            className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
          >
            <div>
              <Label className="text-xs">Bay / Lane *</Label>
              <select
                className="manager-select w-full h-10 text-sm"
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
              <select className="manager-select w-full h-10 text-sm" value={csColor} onChange={e => setCsColor(e.target.value)}>
                {Object.keys(VEHICLE_SWATCH).map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Body Type</Label>
              <select className="manager-select w-full h-10 text-sm" value={csType} onChange={e => setCsType(e.target.value as any)}>
                {['SUV', 'Sedan', 'Pickup', 'Coupe', 'Other'].map(v => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">License Plate *</Label>
              <Input
                value={csPlate}
                onChange={e => setCsPlate(e.target.value)}
                placeholder="QAT 84210"
                required
                className="h-10 font-mono uppercase"
              />
            </div>
            <div>
              <Label className="text-xs">Guest Name</Label>
              <Input value={csCustomer} onChange={e => setCsCustomer(e.target.value)} placeholder="Driver" className="h-10" />
            </div>
            <Button type="submit" className="h-10 cursor-pointer gap-1.5" disabled={!csPlate.trim() || issueCarSidePager.isPending}>
              <QrCode className="w-4 h-4" />
              Issue Car Pager
            </Button>
          </form>
        </section>
      )}

      {/* Configure Lanes & Bays */}
      <section className="manager-panel p-5 space-y-4">
        <h2 className="font-bold text-base">Configure Curbside Bays &amp; Drive-Thru Lanes</h2>
        <form
          onSubmit={e => {
            e.preventDefault();
            addBay.mutate();
          }}
          className="grid sm:grid-cols-4 gap-3 items-end"
        >
          <div>
            <Label className="text-xs">Bay / Lane Code *</Label>
            <Input
              value={bayCode}
              onChange={e => setBayCode(e.target.value)}
              placeholder="BAY-01 or LANE-1"
              required
              className="h-10 font-mono uppercase"
            />
          </div>
          <div>
            <Label className="text-xs">Signage Label *</Label>
            <Input
              value={bayLabel}
              onChange={e => setBayLabel(e.target.value)}
              placeholder="Curbside Bay 1 (Front)"
              required
              className="h-10"
            />
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <select className="manager-select w-full h-10 text-sm" value={bayType} onChange={e => setBayType(e.target.value as any)}>
              <option value="curbside">Curbside Parking Bay</option>
              <option value="drive_thru">Drive-Thru Lane</option>
            </select>
          </div>
          <Button type="submit" className="h-10 cursor-pointer gap-1" disabled={!bayCode.trim() || !bayLabel.trim() || addBay.isPending}>
            <Plus className="w-4 h-4" />
            Add Bay
          </Button>
        </form>

        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-2">
          {bays.map(bay => (
            <div key={bay.id} className="rounded-xl border p-3 flex items-center justify-between gap-2 text-xs">
              <div>
                <div className="flex items-center gap-1.5">
                  <strong className="font-mono text-sm">{bay.code}</strong>
                  <Badge variant="outline">{bay.bayType === 'drive_thru' ? 'Lane' : 'Bay'}</Badge>
                </div>
                <span className="text-muted-foreground block mt-0.5">{bay.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  aria-label={`QR code for ${bay.code}`}
                  onClick={() => setQrBay(bay)}
                  className="w-11 h-11 rounded-xl border hover:bg-muted grid place-items-center cursor-pointer"
                >
                  <QrCode className="w-4 h-4 text-primary" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${bay.code}`}
                  onClick={() => deleteBay.mutate(bay.id)}
                  className="w-11 h-11 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 grid place-items-center cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Dialog open={Boolean(qrBay)} onOpenChange={open => !open && setQrBay(null)}>
        <DialogContent className="max-w-sm text-center rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-center font-mono">{qrBay?.code} Bollard Signage QR</DialogTitle>
            <DialogDescription className="text-center">
              Permanent UUID target — pre-fills this bay into checkout or car-side check-in.
            </DialogDescription>
          </DialogHeader>
          {qrBay && (
            <div className="space-y-3 py-2">
              <div className="grid place-items-center">
                <LocalQrBox url={`${window.location.origin}/bay/${qrBay.qrToken}`} size={196} />
              </div>
              <p className="text-xs font-mono break-all text-muted-foreground">{`${window.location.origin}/bay/${qrBay.qrToken}`}</p>
              <Button type="button" variant="outline" className="w-full cursor-pointer gap-2" onClick={() => downloadBaySignageSvg(qrBay)}>
                <Download className="w-4 h-4" />
                Download Printable SVG
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(carPagerTicket)} onOpenChange={open => !open && setCarPagerTicket(null)}>
        <DialogContent className="max-w-sm text-center rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-center font-mono text-2xl">{carPagerTicket?.ticketCode}</DialogTitle>
            <DialogDescription className="text-center">
              Have the driver scan from their window for live lock-screen pickup ringing.
            </DialogDescription>
          </DialogHeader>
          {carPagerTicket && (
            <div className="space-y-3 py-2">
              <div className="grid place-items-center">
                <LocalQrBox url={`${window.location.origin}/pager/${carPagerTicket.trackingToken}`} size={196} />
              </div>
              <a
                href={`/pager/${carPagerTicket.trackingToken}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                <span>Open Guest Pager Pass</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
