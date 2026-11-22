import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { BellRing, Car, CheckCircle2, Clock, Plus, QrCode, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { playStaffArrivalChime } from '@/lib/pagerAudio';
import { useRealtimeStream } from '@/lib/useRealtimeStream';
import { LocalQrBox } from '@/components/hospitality/LocalQrBox';

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
  const [bayCode, setBayCode] = useState('');
  const [bayLabel, setBayLabel] = useState('');
  const [bayType, setBayType] = useState<'curbside' | 'drive_thru'>('curbside');
  const [qrBay, setQrBay] = useState<any | null>(null);
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
        order: (query.data?.bays.length || 0),
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

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <p className="manager-eyebrow">RUNNER &amp; DRIVE-THRU DISPATCH</p>
        <h1 className="text-3xl font-bold">Drive-Thru Lanes &amp; Curbside Pickup Board</h1>
        <p className="text-sm text-muted-foreground">
          Live arrived-vehicle identification with car color swatches, license plates, wait timers, and permanent Bay QR signage.
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
            No vehicles checked into bays right now. Guests scanning a Bay QR appear here immediately with an arrival chime.
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
                  className="rounded-2xl border-2 border-sky-500/50 bg-card p-4 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="px-3 py-1 rounded-xl bg-sky-600 text-white font-mono font-black text-sm">
                      {bay ? bay.code : 'EN ROUTE'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      {v.etaStatus === '5_mins_away' ? 'ETA 5 mins' : `Waiting ${waitMins}m`}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border p-3 bg-muted/40">
                    <span
                      className="w-8 h-8 rounded-full border-2 border-slate-400 shrink-0"
                      style={{ backgroundColor: VEHICLE_SWATCH[v.vehicleColor] || '#94A3B8' }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <strong className="block text-sm font-mono">{v.licensePlate || 'NO PLATE'}</strong>
                      <span className="text-xs text-muted-foreground">
                        {v.vehicleColor || 'Car'} {v.vehicleType || ''} · Ticket {v.ticketCode}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      className="min-h-10 cursor-pointer gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => pagerTransition.mutate({ id: v.id, action: 'ready' })}
                    >
                      <BellRing className="w-4 h-4" />
                      Buzz Car
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-10 cursor-pointer gap-1"
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
            <Input value={bayCode} onChange={e => setBayCode(e.target.value)} placeholder="BAY-01 or LANE-1" required className="h-10 font-mono uppercase" />
          </div>
          <div>
            <Label className="text-xs">Signage Label *</Label>
            <Input value={bayLabel} onChange={e => setBayLabel(e.target.value)} placeholder="Curbside Bay 1 (Front)" required className="h-10" />
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
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`QR code for ${bay.code}`}
                  onClick={() => setQrBay(bay)}
                  className="p-2 rounded-lg border hover:bg-muted cursor-pointer"
                >
                  <QrCode className="w-4 h-4 text-primary" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${bay.code}`}
                  onClick={() => deleteBay.mutate(bay.id)}
                  className="p-2 text-muted-foreground hover:text-destructive cursor-pointer"
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
            <DialogTitle className="text-center font-mono">{qrBay?.code} Signage QR</DialogTitle>
            <DialogDescription className="text-center">
              Print on parking-bay signage — pre-fills this bay into checkout or car-side check-in.
            </DialogDescription>
          </DialogHeader>
          {qrBay && (
            <div className="space-y-3 py-2">
              <div className="grid place-items-center">
                <LocalQrBox url={`${window.location.origin}/bay/${qrBay.qrToken}`} size={196} />
              </div>
              <p className="text-xs font-mono break-all text-muted-foreground">
                {`${window.location.origin}/bay/${qrBay.qrToken}`}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
