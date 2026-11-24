import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Bell,
  CalendarDays,
  Car,
  Check,
  CreditCard,
  ExternalLink,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  Truck,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { apiRequest } from '@/lib/queryClient';
import { saveGuestPass } from '@/lib/guestSession';
import { useMenuLanguage } from '@/lib/menuLanguage';
import type { PublicCafe, PublicHospitalityConfig } from '@shared/schema';

export interface GuestCartItem {
  key: string;
  menuItemId: string;
  name: string;
  quantity: number;
  variantId: string | null;
  variantLabel: string | null;
  modifiers: Record<string, string[]>;
  modifierSummary: string[];
  unitTotal: string;
  notes?: string;
}

interface Props {
  restaurant: PublicCafe;
  cart: GuestCartItem[];
  setCart: React.Dispatch<React.SetStateAction<GuestCartItem[]>>;
  initialTableCode?: string | null;
  initialBayId?: string | null;
  initialAction?: string | null;
}

export default function GuestHospitalityBar({
  restaurant,
  cart,
  setCart,
  initialTableCode,
  initialBayId,
  initialAction,
}: Props) {
  const { language, dir, t, label } = useMenuLanguage();
  const [, navigate] = useLocation();

  const [pagerOpen, setPagerOpen] = useState(false);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [curbsideOpen, setCurbsideOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  // Pager lookup state
  const [lookupCode, setLookupCode] = useState('');
  const [lookupError, setLookupError] = useState('');

  // Reservation state
  const todayIso = new Date().toISOString().slice(0, 10);
  const [resDate, setResDate] = useState(todayIso);
  const [resParty, setResParty] = useState(2);
  const [resZone, setResZone] = useState('');
  const [resSlot, setResSlot] = useState('');
  const [resName, setResName] = useState('');
  const [resPhone, setResPhone] = useState('');
  const [resNotes, setResNotes] = useState('');
  const [resError, setResError] = useState('');

  // Waitlist state
  const [wlName, setWlName] = useState('');
  const [wlPhone, setWlPhone] = useState('');
  const [wlParty, setWlParty] = useState(2);
  const [wlZone, setWlZone] = useState('');
  const [wlError, setWlError] = useState('');

  // Curbside state
  const [csBayId, setCsBayId] = useState(initialBayId || '');
  const [csName, setCsName] = useState('');
  const [csColor, setCsColor] = useState('White');
  const [csType, setCsType] = useState<'Sedan' | 'SUV' | 'Pickup' | 'Coupe' | 'Other'>('SUV');
  const [csPlate, setCsPlate] = useState('');
  const [csError, setCsError] = useState('');

  // Cart checkout state
  const [channel, setChannel] = useState<'dine_in' | 'counter_pickup' | 'curbside' | 'drive_thru'>(
    initialBayId ? 'curbside' : initialTableCode ? 'dine_in' : 'counter_pickup',
  );
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [tableCode, setTableCode] = useState(initialTableCode || '');
  const [bayId, setBayId] = useState(initialBayId || '');
  const [vehColor, setVehColor] = useState('White');
  const [vehType, setVehType] = useState<'Sedan' | 'SUV' | 'Pickup' | 'Coupe' | 'Other'>('SUV');
  const [plate, setPlate] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [orderError, setOrderError] = useState('');
  const [pendingGateway, setPendingGateway] = useState<{
    orderId: string;
    orderNumber: string;
    total: string;
    provider: 'skipcash' | 'sadad';
    paymentReference: string;
    signatureToken: string;
  } | null>(null);

  useEffect(() => {
    if (initialBayId) {
      setBayId(initialBayId);
      setCsBayId(initialBayId);
      setChannel('curbside');
    }
    if (initialTableCode) {
      setTableCode(initialTableCode);
      setChannel('dine_in');
    }
  }, [initialBayId, initialTableCode]);

  useEffect(() => {
    if (!initialAction) return;
    if (initialAction === 'waitlist' && restaurant.waitlistEnabled) setWaitlistOpen(true);
    else if (initialAction === 'reserve' && restaurant.reservationsEnabled) setReserveOpen(true);
    else if (initialAction === 'pager') setPagerOpen(true);
    else if (initialAction === 'curbside' && restaurant.driveThruEnabled) setCurbsideOpen(true);
    else if (initialAction === 'delivery') setDeliveryOpen(true);
    else if (initialAction === 'cart' && restaurant.orderingMode !== 'browse_and_pager') setCartOpen(true);
  }, [initialAction, restaurant.waitlistEnabled, restaurant.reservationsEnabled, restaurant.driveThruEnabled, restaurant.orderingMode]);

  const hospitalityQuery = useQuery<PublicHospitalityConfig>({
    queryKey: ['/api/public/hospitality', restaurant.id],
    queryFn: async () => {
      const res = await fetch(`/api/public/hospitality/${restaurant.id}`);
      if (!res.ok) throw new Error('Failed to load hospitality config');
      return res.json();
    },
    staleTime: 15_000,
  });

  const config = hospitalityQuery.data;
  const aggregators = config?.aggregators || [];
  const zones = config?.zones || [];
  const bays = config?.bays || [];

  const availabilityQuery = useQuery<{ slots: { time: string; startIso: string; availableTables: number }[] }>({
    enabled: reserveOpen && Boolean(resDate),
    queryKey: ['/api/public/reservations/availability', restaurant.id, resDate, resParty, resZone],
    queryFn: async () => {
      const params = new URLSearchParams({ date: resDate, partySize: String(resParty) });
      if (resZone) params.set('zoneId', resZone);
      const res = await fetch(`/api/public/reservations/${restaurant.id}/availability?${params}`);
      if (!res.ok) return { slots: [] };
      return res.json();
    },
  });

  const lookupMutation = useMutation({
    mutationFn: async () => {
      setLookupError('');
      const res = await apiRequest('POST', '/api/public/pager/lookup', {
        restaurantId: restaurant.id,
        ticketCode: lookupCode.trim(),
      });
      return res.json();
    },
    onSuccess: data => {
      saveGuestPass({
        kind: 'pager',
        trackingToken: data.trackingToken,
        code: data.ticketCode,
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
      });
      setPagerOpen(false);
      navigate(`/pager/${data.trackingToken}`);
    },
    onError: (e: Error) => setLookupError(e.message),
  });

  const reserveMutation = useMutation({
    mutationFn: async () => {
      setResError('');
      const res = await apiRequest('POST', `/api/public/reservations/${restaurant.id}`, {
        guestName: resName.trim(),
        guestPhone: resPhone.trim(),
        partySize: resParty,
        zoneId: resZone || null,
        startIso: resSlot,
        notes: resNotes.trim() || null,
      });
      return res.json();
    },
    onSuccess: data => {
      saveGuestPass({
        kind: 'booking',
        trackingToken: data.reservation.trackingToken,
        code: data.table?.tableCode ? `Table ${data.table.tableCode}` : 'Reserved',
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        startAt: data.reservation.startAt,
      });
      setReserveOpen(false);
      navigate(`/booking/${data.reservation.trackingToken}`);
    },
    onError: (e: Error) => setResError(e.message),
  });

  const waitlistMutation = useMutation({
    mutationFn: async () => {
      setWlError('');
      const res = await apiRequest('POST', `/api/public/waitlist/${restaurant.id}`, {
        guestName: wlName.trim(),
        guestPhone: wlPhone.trim() || null,
        partySize: wlParty,
        zoneId: wlZone || null,
      });
      return res.json();
    },
    onSuccess: data => {
      saveGuestPass({
        kind: 'waitlist',
        trackingToken: data.entry.trackingToken,
        code: data.entry.ticketCode,
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
      });
      setWaitlistOpen(false);
      navigate(`/waitlist/${data.entry.trackingToken}`);
    },
    onError: (e: Error) => setWlError(e.message),
  });

  const curbsideMutation = useMutation({
    mutationFn: async () => {
      setCsError('');
      const res = await apiRequest('POST', '/api/public/curbside/checkin', {
        restaurantId: restaurant.id,
        bayId: csBayId,
        etaStatus: 'arrived',
        customerName: csName.trim() || undefined,
        vehicleColor: csColor,
        vehicleType: csType,
        licensePlate: csPlate.trim(),
      });
      return res.json();
    },
    onSuccess: data => {
      saveGuestPass({
        kind: 'pager',
        trackingToken: data.ticket.trackingToken,
        code: data.ticket.ticketCode,
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
      });
      setCurbsideOpen(false);
      navigate(`/pager/${data.ticket.trackingToken}`);
    },
    onError: (e: Error) => setCsError(e.message),
  });

  const orderMutation = useMutation({
    mutationFn: async () => {
      setOrderError('');
      const res = await apiRequest('POST', '/api/public/orders', {
        restaurantId: restaurant.id,
        channel,
        customerName: custName.trim(),
        customerPhone: custPhone.trim() || null,
        tableCode: channel === 'dine_in' ? tableCode.trim() || null : null,
        bayId: channel === 'curbside' || channel === 'drive_thru' ? bayId || null : null,
        vehicleColor: channel === 'curbside' || channel === 'drive_thru' ? vehColor : null,
        vehicleType: channel === 'curbside' || channel === 'drive_thru' ? vehType : null,
        licensePlate: channel === 'curbside' || channel === 'drive_thru' ? plate.trim() || null : null,
        notes: orderNotes.trim() || null,
        items: cart.map(item => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          variantId: item.variantId,
          modifiers: item.modifiers,
          ...(item.notes ? { notes: item.notes } : {}),
        })),
      });
      return res.json();
    },
    onSuccess: data => {
      if (data.checkout?.checkoutMode === 'sandbox_interactive') {
        setPendingGateway({
          orderId: data.order.id,
          orderNumber: data.order.orderNumber,
          total: data.order.total,
          provider: data.checkout.provider,
          paymentReference: data.checkout.paymentReference,
          signatureToken: data.checkout.signatureToken,
        });
        return;
      }
      if (data.checkout?.checkoutMode === 'hosted_redirect') {
        window.location.href = data.checkout.checkoutUrl;
        return;
      }
      setCart([]);
      setCartOpen(false);
      if (data.pager?.trackingToken) {
        saveGuestPass({
          kind: 'pager',
          trackingToken: data.pager.trackingToken,
          code: data.pager.ticketCode,
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
        });
        navigate(`/pager/${data.pager.trackingToken}`);
      }
    },
    onError: (e: Error) => setOrderError(e.message),
  });

  const confirmGatewayMutation = useMutation({
    mutationFn: async () => {
      if (!pendingGateway) return;
      const res = await apiRequest('POST', `/api/public/payments/${pendingGateway.orderId}/confirm-sandbox`, {
        provider: pendingGateway.provider,
        paymentReference: pendingGateway.paymentReference,
        signatureToken: pendingGateway.signatureToken,
      });
      return res.json();
    },
    onSuccess: data => {
      setPendingGateway(null);
      setCart([]);
      setCartOpen(false);
      if (data?.pager?.trackingToken) {
        saveGuestPass({
          kind: 'pager',
          trackingToken: data.pager.trackingToken,
          code: data.pager.ticketCode,
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
        });
        navigate(`/pager/${data.pager.trackingToken}`);
      }
    },
    onError: (e: Error) => setOrderError(e.message),
  });

  const totalCartItems = cart.reduce((sum, i) => sum + i.quantity, 0);
  const totalCartAmount = cart
    .reduce((sum, i) => sum + Number(i.unitTotal) * i.quantity, 0)
    .toFixed(2);
  const orderingEnabled = restaurant.orderingMode !== 'browse_and_pager';

  async function handleAggregatorClick(agg: any) {
    try {
      void fetch('/api/public/aggregator-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          aggregatorId: agg.id,
          platform: agg.platform,
          locale: language,
        }),
      });
    } catch {}
    window.open(agg.url, '_blank', 'noopener,noreferrer');
  }

  return (
    <>
      {/* Context Pill for Pre-filled Table or Parking Bay QR */}
      {(initialTableCode || initialBayId) && (
        <div className="my-2 px-3.5 py-2 rounded-2xl bg-[#EFEAFF] text-[#4B1FE0] border border-[#E5E2F2] text-xs font-semibold flex items-center justify-between">
          <span>
            {initialTableCode
              ? `Dine-In Table ${initialTableCode} connected`
              : `Curbside Bay connected`}
          </span>
          {!orderingEnabled && initialBayId && (
            <button
              type="button"
              onClick={() => setCurbsideOpen(true)}
              className="underline font-bold cursor-pointer text-[#4B1FE0]"
            >
              Check In Car →
            </button>
          )}
        </div>
      )}

      {/* Hospitality Quick-Action Strip */}
      <div
        className="flex flex-wrap gap-2 my-3"
        role="region"
        aria-label="Hospitality services"
      >
        <button
          type="button"
          onClick={() => setPagerOpen(true)}
          data-testid="button-open-pager-lookup"
          className="inline-flex items-center gap-1.5 px-3.5 min-h-11 rounded-2xl border bg-card/90 text-foreground text-xs font-semibold shadow-sm hover:shadow transition-all cursor-pointer"
        >
          <Bell className="w-4 h-4 text-primary" />
          <span>{t('Virtual Pager')}</span>
        </button>

        {restaurant.reservationsEnabled && (
          <button
            type="button"
            onClick={() => setReserveOpen(true)}
            data-testid="button-open-reservations"
            className="inline-flex items-center gap-1.5 px-3.5 min-h-11 rounded-2xl border bg-card/90 text-foreground text-xs font-semibold shadow-sm hover:shadow transition-all cursor-pointer"
          >
            <CalendarDays className="w-4 h-4 text-primary" />
            <span>{t('Book Table')}</span>
          </button>
        )}

        {restaurant.waitlistEnabled && (
          <button
            type="button"
            onClick={() => setWaitlistOpen(true)}
            data-testid="button-open-waitlist"
            className="inline-flex items-center gap-1.5 px-3.5 min-h-11 rounded-2xl border bg-card/90 text-foreground text-xs font-semibold shadow-sm hover:shadow transition-all cursor-pointer"
          >
            <Users className="w-4 h-4 text-primary" />
            <span>{t('Walk-In Waitlist')}</span>
          </button>
        )}

        {restaurant.driveThruEnabled && bays.length > 0 && (
          <button
            type="button"
            onClick={() => setCurbsideOpen(true)}
            data-testid="button-open-curbside"
            className="inline-flex items-center gap-1.5 px-3.5 min-h-11 rounded-2xl border bg-card/90 text-foreground text-xs font-semibold shadow-sm hover:shadow transition-all cursor-pointer"
          >
            <Car className="w-4 h-4 text-primary" />
            <span>{t('Curbside & Drive-Thru')}</span>
          </button>
        )}

        {aggregators.length > 0 && (
          <button
            type="button"
            onClick={() => setDeliveryOpen(true)}
            data-testid="button-open-delivery"
            className="inline-flex items-center gap-1.5 px-3.5 min-h-11 rounded-2xl border bg-card/90 text-foreground text-xs font-semibold shadow-sm hover:shadow transition-all cursor-pointer"
          >
            <Truck className="w-4 h-4 text-primary" />
            <span>{t('Get Delivery')}</span>
          </button>
        )}
      </div>

      {/* Floating Cart Bar when Branch Ordering Mode is Active */}
      {orderingEnabled && totalCartItems > 0 && (
        <div className="fixed bottom-4 inset-x-4 z-40 max-w-lg mx-auto">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            data-testid="button-open-cart"
            className="w-full min-h-14 px-5 rounded-2xl bg-primary text-primary-foreground shadow-xl flex items-center justify-between font-semibold transition-transform hover:-translate-y-0.5 cursor-pointer"
          >
            <span className="inline-flex items-center gap-2.5" role="status" aria-atomic="true">
              <ShoppingBag className="w-5 h-5" />
              <span>
                {t('View Cart')} ({totalCartItems})
              </span>
            </span>
            <span className="font-mono font-bold">
              {totalCartAmount} {restaurant.currency}
            </span>
          </button>
        </div>
      )}

      {/* 1. Virtual Pager Lookup Dialog */}
      <Dialog open={pagerOpen} onOpenChange={setPagerOpen}>
        <DialogContent dir={dir} lang={language} className="max-w-sm rounded-3xl">
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            {t('Track Pager')}
          </DialogTitle>
          <DialogDescription>
            Enter the pager code from the cashier or your POS receipt number to receive instant sound & vibration alerts.
          </DialogDescription>
          <form
            onSubmit={e => {
              e.preventDefault();
              if (lookupCode.trim()) lookupMutation.mutate();
            }}
            className="space-y-3 mt-2"
          >
            <Input
              value={lookupCode}
              onChange={e => setLookupCode(e.target.value)}
              placeholder={t('Enter receipt or pager # (e.g. A-001)')}
              className="h-12 font-mono text-base uppercase"
              required
            />
            {lookupError && <p className="text-xs text-destructive font-medium">{lookupError}</p>}
            <Button type="submit" className="w-full min-h-11 cursor-pointer" disabled={lookupMutation.isPending}>
              {lookupMutation.isPending ? 'Checking…' : t('Track Pager')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* 2. Advance Table Reservation Dialog */}
      <Dialog open={reserveOpen} onOpenChange={setReserveOpen}>
        <DialogContent dir={dir} lang={language} className="max-w-md rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            {t('Reserve a Table')}
          </DialogTitle>
          <DialogDescription>
            Conflict-free instant table allocation for {label(restaurant.name)}.
          </DialogDescription>
          <form
            onSubmit={e => {
              e.preventDefault();
              reserveMutation.mutate();
            }}
            className="space-y-3 mt-2"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" min={todayIso} value={resDate} onChange={e => { setResDate(e.target.value); setResSlot(''); }} className="h-11" required />
              </div>
              <div>
                <Label className="text-xs">{t('Party Size')}</Label>
                <select className="manager-select w-full h-11" value={resParty} onChange={e => { setResParty(Number(e.target.value)); setResSlot(''); }}>
                  {[1, 2, 3, 4, 5, 6, 8, 10, 12].map(n => (
                    <option key={n} value={n}>{n} {n === 1 ? 'Guest' : 'Guests'}</option>
                  ))}
                </select>
              </div>
            </div>

            {zones.length > 0 && (
              <div>
                <Label className="text-xs">{t('Dining Zone')}</Label>
                <select className="manager-select w-full h-11" value={resZone} onChange={e => { setResZone(e.target.value); setResSlot(''); }}>
                  <option value="">{t('Any Zone')}</option>
                  {zones.map(z => (
                    <option key={z.id} value={z.id}>{language === 'ar' && z.nameAr ? z.nameAr : z.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <Label className="text-xs">{t('Available Times')}</Label>
              <div className="grid grid-cols-4 gap-1.5 mt-1 max-h-36 overflow-y-auto p-1">
                {availabilityQuery.isLoading ? (
                  <p className="col-span-4 text-xs text-muted-foreground">Checking tables…</p>
                ) : (availabilityQuery.data?.slots || []).length === 0 ? (
                  <p className="col-span-4 text-xs text-muted-foreground">No open tables for this filter.</p>
                ) : (
                  (availabilityQuery.data?.slots || []).map(slot => (
                    <button
                      key={slot.startIso}
                      type="button"
                      onClick={() => setResSlot(slot.startIso)}
                      className={`py-2 px-2 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                        resSlot === slot.startIso
                          ? 'bg-[#EFEAFF] text-[#4B1FE0] border-[#6236FF] ring-1 ring-[#6236FF]'
                          : 'bg-[#F6F5FC] border-[#E5E2F2] text-[#17132E] hover:bg-[#EFEAFF] hover:text-[#4B1FE0]'
                      }`}
                    >
                      {slot.time}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{t('Your Name')} *</Label>
                <Input value={resName} onChange={e => setResName(e.target.value)} required className="h-11" />
              </div>
              <div>
                <Label className="text-xs">Mobile Phone *</Label>
                <Input type="tel" value={resPhone} onChange={e => setResPhone(e.target.value)} placeholder="+974 …" required className="h-11" />
              </div>
            </div>

            <Input value={resNotes} onChange={e => setResNotes(e.target.value)} placeholder="Special requests (high chair, celebration…)" className="h-11" />
            {resError && <p className="text-xs text-destructive font-medium">{resError}</p>}

            <Button
              type="submit"
              className="w-full min-h-11 cursor-pointer"
              disabled={!resSlot || !resName.trim() || !resPhone.trim() || reserveMutation.isPending}
            >
              {reserveMutation.isPending ? 'Booking…' : t('Confirm Reservation')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* 3. Live Walk-In Virtual Waitlist Dialog */}
      <Dialog open={waitlistOpen} onOpenChange={setWaitlistOpen}>
        <DialogContent dir={dir} lang={language} className="max-w-sm rounded-3xl">
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            {t('Join Live Waitlist')}
          </DialogTitle>
          <DialogDescription>
            Receive a live browser pager ticket — your phone rings as soon as your table is ready.
          </DialogDescription>
          <form
            onSubmit={e => {
              e.preventDefault();
              waitlistMutation.mutate();
            }}
            className="space-y-3 mt-2"
          >
            <div>
              <Label className="text-xs">{t('Your Name')} *</Label>
              <Input value={wlName} onChange={e => setWlName(e.target.value)} required className="h-11" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t('Party Size')}</Label>
                <select className="manager-select w-full h-11" value={wlParty} onChange={e => setWlParty(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6, 8, 10].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">{t('Phone (Optional)')}</Label>
                <Input type="tel" value={wlPhone} onChange={e => setWlPhone(e.target.value)} className="h-11" />
              </div>
            </div>
            {zones.length > 0 && (
              <div>
                <Label className="text-xs">{t('Dining Zone')}</Label>
                <select className="manager-select w-full h-11" value={wlZone} onChange={e => setWlZone(e.target.value)}>
                  <option value="">{t('Any Zone')}</option>
                  {zones.map(z => (
                    <option key={z.id} value={z.id}>{language === 'ar' && z.nameAr ? z.nameAr : z.name}</option>
                  ))}
                </select>
              </div>
            )}
            {wlError && <p className="text-xs text-destructive">{wlError}</p>}
            <Button type="submit" className="w-full min-h-11 cursor-pointer" disabled={!wlName.trim() || waitlistMutation.isPending}>
              {waitlistMutation.isPending ? 'Joining…' : t('Join Waitlist')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* 4. Curbside / Drive-Thru Car-Side Check-In Dialog */}
      <Dialog open={curbsideOpen} onOpenChange={setCurbsideOpen}>
        <DialogContent dir={dir} lang={language} className="max-w-sm rounded-3xl">
          <DialogTitle className="flex items-center gap-2">
            <Car className="w-5 h-5 text-primary" />
            {t('Curbside & Drive-Thru')}
          </DialogTitle>
          <DialogDescription>
            Check in with your bay and car details to alert our runner screen immediately.
          </DialogDescription>
          <form
            onSubmit={e => {
              e.preventDefault();
              curbsideMutation.mutate();
            }}
            className="space-y-3 mt-2"
          >
            <div>
              <Label className="text-xs">{t('Select Parking Bay')} *</Label>
              <select className="manager-select w-full h-11" value={csBayId} onChange={e => setCsBayId(e.target.value)} required>
                <option value="">Choose bay or lane…</option>
                {bays.map(b => (
                  <option key={b.id} value={b.id}>{b.code} — {b.label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t('Vehicle Color')}</Label>
                <select className="manager-select w-full h-11" value={csColor} onChange={e => setCsColor(e.target.value)}>
                  {['White', 'Black', 'Silver', 'Gray', 'Blue', 'Red', 'Sand', 'Green'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">{t('Vehicle Type')}</Label>
                <select className="manager-select w-full h-11" value={csType} onChange={e => setCsType(e.target.value as any)}>
                  {['SUV', 'Sedan', 'Pickup', 'Coupe', 'Other'].map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t('License Plate')} *</Label>
                <Input value={csPlate} onChange={e => setCsPlate(e.target.value)} placeholder="QAT 49120" required className="h-11" />
              </div>
              <div>
                <Label className="text-xs">{t('Your Name')}</Label>
                <Input value={csName} onChange={e => setCsName(e.target.value)} placeholder="Guest" className="h-11" />
              </div>
            </div>
            {csError && <p className="text-xs text-destructive">{csError}</p>}
            <Button type="submit" className="w-full min-h-11 cursor-pointer" disabled={!csBayId || !csPlate.trim() || curbsideMutation.isPending}>
              {curbsideMutation.isPending ? 'Checking in…' : t("I'm Here — Check In")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* 5. Aggregator Delivery Storefront Handoff Bottom Sheet */}
      <Dialog open={deliveryOpen} onOpenChange={setDeliveryOpen}>
        <DialogContent dir={dir} lang={language} className="max-w-sm rounded-3xl">
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            {t('Order Delivery via Partner')}
          </DialogTitle>
          <DialogDescription>
            Choose your preferred delivery partner for {label(restaurant.name)}.
          </DialogDescription>
          <div className="space-y-2.5 mt-2">
            {aggregators.map(agg => {
              const badge = language === 'ar' ? agg.badgeAr || agg.badgeEn : agg.badgeEn || agg.badgeAr;
              const brandColors: Record<string, string> = {
                talabat: 'bg-[#FF5A00] text-white',
                snoonu: 'bg-[#D90429] text-white',
                keeta: 'bg-[#FFB703] text-slate-950',
                custom: 'bg-primary text-primary-foreground',
              };
              return (
                <button
                  key={agg.id}
                  type="button"
                  data-testid={`button-aggregator-${agg.platform}`}
                  onClick={() => handleAggregatorClick(agg)}
                  className="w-full min-h-14 p-3.5 rounded-2xl border bg-card hover:bg-muted/60 flex items-center justify-between gap-3 transition-all cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`px-2.5 py-1 rounded-xl text-xs font-black uppercase shrink-0 ${brandColors[agg.platform] || brandColors.custom}`}>
                      {agg.platform}
                    </span>
                    <div className="min-w-0">
                      <strong className="block text-sm truncate">{agg.displayName}</strong>
                      {badge && <span className="text-xs text-primary font-medium">{badge}</span>}
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* 6. Configurable Cart & Checkout Sheet (Mode B: Pay at Venue & Mode C: SkipCash / Sadad Online) */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent
          side={dir === 'rtl' ? 'left' : 'right'}
          dir={dir}
          lang={language}
          className="w-full sm:max-w-md overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>{t('Your Order')}</SheetTitle>
            <SheetDescription>
              {restaurant.orderingMode === 'full_online_checkout'
                ? `Secure online payment via ${(restaurant.paymentGateway || 'skipcash').toUpperCase()}`
                : 'Sent straight to the barista KDS — pay when you pick up or at your table.'}
            </SheetDescription>
          </SheetHeader>

          {pendingGateway ? (
            <div className="mt-6 rounded-2xl border-2 border-primary/30 bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase px-2.5 py-1 rounded-lg bg-primary/10 text-primary">
                  {pendingGateway.provider.toUpperCase()} Gateway
                </span>
                <span className="font-mono text-xs text-muted-foreground">{pendingGateway.paymentReference}</span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Order {pendingGateway.orderNumber}</p>
                <p className="text-2xl font-black mt-1">
                  {pendingGateway.total} {restaurant.currency}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Apple Pay · Google Pay · NAPS Qatar Debit · Visa / Mastercard (Signed HMAC Verification)
              </p>
              {orderError && <p className="text-xs text-destructive">{orderError}</p>}
              <Button
                type="button"
                data-testid="button-confirm-online-payment"
                className="w-full min-h-12 cursor-pointer gap-2"
                disabled={confirmGatewayMutation.isPending}
                onClick={() => confirmGatewayMutation.mutate()}
              >
                <CreditCard className="w-4 h-4" />
                {confirmGatewayMutation.isPending
                  ? 'Verifying Payment…'
                  : `Authorize ${pendingGateway.total} ${restaurant.currency}`}
              </Button>
            </div>
          ) : (
            <form
              onSubmit={e => {
                e.preventDefault();
                orderMutation.mutate();
              }}
              className="mt-5 space-y-4"
            >
              <div className="space-y-2">
                {cart.map(item => (
                  <div key={item.key} className="rounded-2xl border p-3 flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <strong className="block truncate">{label(item.name)}</strong>
                      {item.variantLabel && <span className="text-xs text-muted-foreground block">{item.variantLabel}</span>}
                      {item.modifierSummary.length > 0 && (
                        <span className="text-xs text-muted-foreground block">{item.modifierSummary.join(', ')}</span>
                      )}
                      {item.notes && (
                        <span className="text-[11px] italic text-[#57507A] block">“{item.notes}”</span>
                      )}
                      <span className="text-xs font-semibold text-primary mt-1 block">
                        {(Number(item.unitTotal) * item.quantity).toFixed(2)} {restaurant.currency}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        onClick={() =>
                          setCart(prev =>
                            item.quantity <= 1
                              ? prev.filter(i => i.key !== item.key)
                              : prev.map(i => (i.key === item.key ? { ...i, quantity: i.quantity - 1 } : i)),
                          )
                        }
                        className="w-8 h-8 rounded-lg border grid place-items-center cursor-pointer"
                      >
                        {item.quantity <= 1 ? <Trash2 className="w-3.5 h-3.5 text-destructive" /> : <Minus className="w-3.5 h-3.5" />}
                      </button>
                      <span className="w-6 text-center font-semibold text-xs">{item.quantity}</span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        onClick={() =>
                          setCart(prev => prev.map(i => (i.key === item.key ? { ...i, quantity: i.quantity + 1 } : i)))
                        }
                        className="w-8 h-8 rounded-lg border grid place-items-center cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <Label className="text-xs">{t('Order Channel')}</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {[
                    { id: 'counter_pickup', label: t('Counter Pickup') },
                    { id: 'dine_in', label: t('Dine-In Table') },
                    ...(restaurant.driveThruEnabled
                      ? [
                          { id: 'curbside', label: t('Curbside Bay') },
                          { id: 'drive_thru', label: t('Drive-Thru') },
                        ]
                      : []),
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setChannel(opt.id as any)}
                      className={`min-h-11 px-3 rounded-xl border text-xs font-semibold flex items-center justify-between cursor-pointer ${
                        channel === opt.id ? 'border-primary bg-primary/10 text-primary' : 'bg-card'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {channel === opt.id && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">{t('Your Name')} *</Label>
                  <Input value={custName} onChange={e => setCustName(e.target.value)} required className="h-11" data-testid="input-order-customer-name" />
                </div>
                <div>
                  <Label className="text-xs">{t('Phone (Optional)')}</Label>
                  <Input type="tel" value={custPhone} onChange={e => setCustPhone(e.target.value)} className="h-11" />
                </div>
              </div>

              {channel === 'dine_in' && (
                <div>
                  <Label className="text-xs">{t('Table Code')}</Label>
                  <Input value={tableCode} onChange={e => setTableCode(e.target.value)} placeholder="e.g. T-04" className="h-11" />
                </div>
              )}

              {(channel === 'curbside' || channel === 'drive_thru') && (
                <div className="space-y-2 rounded-2xl border p-3 bg-muted/30">
                  {bays.length > 0 && (
                    <div>
                      <Label className="text-xs">{t('Select Parking Bay')}</Label>
                      <select className="manager-select w-full h-11" value={bayId} onChange={e => setBayId(e.target.value)}>
                        <option value="">Will select upon arrival</option>
                        {bays.map(b => (
                          <option key={b.id} value={b.id}>{b.code} — {b.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <select className="manager-select h-11 text-xs" value={vehColor} onChange={e => setVehColor(e.target.value)}>
                      {['White', 'Black', 'Silver', 'Blue', 'Red', 'Sand'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select className="manager-select h-11 text-xs" value={vehType} onChange={e => setVehType(e.target.value as any)}>
                      {['SUV', 'Sedan', 'Pickup', 'Coupe'].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <Input value={plate} onChange={e => setPlate(e.target.value)} placeholder="Plate #" className="h-11 text-xs" />
                  </div>
                </div>
              )}

              <Input value={orderNotes} onChange={e => setOrderNotes(e.target.value)} placeholder={t('Order Notes')} className="h-11" />

              <div className="flex items-center justify-between pt-2 border-t font-bold text-base">
                <span>{t('Estimated total')}</span>
                <span>
                  {totalCartAmount} {restaurant.currency}
                </span>
              </div>

              {orderError && <p className="text-xs text-destructive font-medium">{orderError}</p>}

              <Button
                type="submit"
                data-testid="button-submit-guest-order"
                className="w-full min-h-12 rounded-2xl cursor-pointer font-semibold"
                disabled={!cart.length || !custName.trim() || orderMutation.isPending}
              >
                {orderMutation.isPending
                  ? 'Submitting…'
                  : restaurant.orderingMode === 'full_online_checkout'
                    ? t('Pay Online & Place Order')
                    : t('Place Order (Pay at Venue)')}
              </Button>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
