import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Car,
  RotateCcw,
  Truck,
  Users,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import {
  readGuestProfile,
  readLastGuestOrder,
  saveGuestPass,
  saveGuestProfile,
  saveLastGuestOrder,
} from '@/lib/guestSession';
import { preArmAudioOnUserGesture } from '@/lib/lockScreenRinger';
import { localizedEntityText, useMenuLanguage } from '@/lib/menuLanguage';
import { GuestCheckoutAndDeliveryModals } from './GuestCheckoutAndDeliveryModals';
import { GuestVenueServiceDialogs, type PendingDepositSession } from './GuestVenueServiceDialogs';
import { TableCompanionBar } from './TableCompanionBar';
import {
  computeOrderTotalsWithVenueFees,
  formatCurrencyForLocale,
  partySizeOptionsForVenue,
  resolveVenueConfig,
} from '@shared/venueConfig';
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
  trailingActions?: React.ReactNode;
}

export default function GuestHospitalityBar({
  restaurant,
  cart,
  setCart,
  initialTableCode,
  initialBayId,
  initialAction,
  trailingActions,
}: Props) {
  const { language, dir, t, label } = useMenuLanguage();
  const [, navigate] = useLocation();
  const venueCfg = resolveVenueConfig(restaurant.venueConfig);
  const partyOptions = partySizeOptionsForVenue(venueCfg.maxPartySize);
  const currencyDisplay = formatCurrencyForLocale(restaurant.currency, language, venueCfg.currencySymbolAr);
  const cafeDisplayName = localizedEntityText(language, restaurant.name, restaurant.nameAr, label);
  const savedProfile = readGuestProfile();

  const [pagerOpen, setPagerOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [curbsideOpen, setCurbsideOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const [lookupCode, setLookupCode] = useState('');
  const [lookupError, setLookupError] = useState('');

  const todayIso = new Date().toISOString().slice(0, 10);
  const [resDate, setResDate] = useState(todayIso);
  const [resParty, setResParty] = useState(2);
  const [resZone, setResZone] = useState('');
  const [resSlot, setResSlot] = useState('');
  const [resName, setResName] = useState(savedProfile.name);
  const [resPhone, setResPhone] = useState(savedProfile.phone);
  const [resNotes, setResNotes] = useState('');
  const [resError, setResError] = useState('');
  const [pendingDepositGateway, setPendingDepositGateway] = useState<PendingDepositSession | null>(null);

  const [wlName, setWlName] = useState(savedProfile.name);
  const [wlPhone, setWlPhone] = useState(savedProfile.phone);
  const [wlParty, setWlParty] = useState(2);
  const [wlZone, setWlZone] = useState('');
  const [wlError, setWlError] = useState('');

  const [csBayId, setCsBayId] = useState(initialBayId || '');
  const [csName, setCsName] = useState(savedProfile.name);
  const [csColor, setCsColor] = useState(savedProfile.vehicleColor || venueCfg.vehicleColors[0] || 'White');
  const [csType, setCsType] = useState<string>(savedProfile.vehicleType || venueCfg.vehicleTypes[0] || 'SUV');
  const [csPlate, setCsPlate] = useState(savedProfile.licensePlate);
  const [csError, setCsError] = useState('');

  const [channel, setChannel] = useState<'dine_in' | 'counter_pickup' | 'curbside' | 'drive_thru'>(
    initialBayId ? 'curbside' : initialTableCode ? 'dine_in' : 'counter_pickup',
  );
  const [custName, setCustName] = useState(savedProfile.name);
  const [custPhone, setCustPhone] = useState(savedProfile.phone);
  const [tableCode, setTableCode] = useState(initialTableCode || '');
  const [bayId, setBayId] = useState(initialBayId || '');
  const [vehColor, setVehColor] = useState(savedProfile.vehicleColor || venueCfg.vehicleColors[0] || 'White');
  const [vehType, setVehType] = useState<string>(savedProfile.vehicleType || venueCfg.vehicleTypes[0] || 'SUV');
  const [plate, setPlate] = useState(savedProfile.licensePlate);
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
  }, [
    initialAction,
    restaurant.waitlistEnabled,
    restaurant.reservationsEnabled,
    restaurant.driveThruEnabled,
    restaurant.orderingMode,
  ]);

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

  const availabilityQuery = useQuery<{
    slots: { time: string; startIso: string; availableTables: number; requiresCombination?: boolean }[];
  }>({
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
      setPagerOpen(false);
      if (data.trackingToken) {
        saveGuestPass({
          kind: 'pager',
          trackingToken: data.trackingToken,
          code: data.ticketCode,
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
        });
        navigate(`/pager/${data.trackingToken}`);
        return;
      }
      if (data.coasterToken) {
        navigate(`/tag/${data.coasterToken}`);
      }
    },
    onError: (e: Error) => setLookupError(e.message),
  });

  const reserveMutation = useMutation({
    mutationFn: async () => {
      setResError('');
      saveGuestProfile({ name: resName, phone: resPhone });
      setCustName(prev => prev || resName.trim());
      setCustPhone(prev => prev || resPhone.trim());
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
      const tableCodes =
        data.combinedTables && data.combinedTables.length > 1
          ? `Tables ${data.combinedTables.map((tb: any) => tb.tableCode).join('+')}`
          : data.table?.tableCode
            ? `Table ${data.table.tableCode}`
            : 'Reserved';

      if (data.checkout?.checkoutMode === 'sandbox_interactive') {
        setPendingDepositGateway({
          reservationId: data.reservation.id,
          trackingToken: data.reservation.trackingToken,
          tableLabel: tableCodes,
          startAt: data.reservation.startAt,
          amount: String(data.reservation.depositAmount),
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

      saveGuestPass({
        kind: 'booking',
        trackingToken: data.reservation.trackingToken,
        code: tableCodes,
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        startAt: data.reservation.startAt,
      });
      setReserveOpen(false);
      navigate(`/booking/${data.reservation.trackingToken}`);
    },
    onError: (e: Error) => setResError(e.message),
  });

  const confirmDepositMutation = useMutation({
    mutationFn: async () => {
      if (!pendingDepositGateway) return;
      const res = await apiRequest(
        'POST',
        `/api/public/reservations/${pendingDepositGateway.reservationId}/confirm-deposit`,
        {
          provider: pendingDepositGateway.provider,
          paymentReference: pendingDepositGateway.paymentReference,
          signatureToken: pendingDepositGateway.signatureToken,
        },
      );
      return res.json();
    },
    onSuccess: data => {
      const passInfo = pendingDepositGateway;
      setPendingDepositGateway(null);
      setReserveOpen(false);
      if (data?.reservation?.trackingToken) {
        saveGuestPass({
          kind: 'booking',
          trackingToken: data.reservation.trackingToken,
          code: passInfo?.tableLabel || 'Reserved',
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          startAt: data.reservation.startAt,
        });
        navigate(`/booking/${data.reservation.trackingToken}`);
      }
    },
    onError: (e: Error) => setResError(e.message),
  });

  const waitlistMutation = useMutation({
    mutationFn: async () => {
      setWlError('');
      saveGuestProfile({ name: wlName, ...(wlPhone.trim() ? { phone: wlPhone } : {}) });
      setCustName(prev => prev || wlName.trim());
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
      saveGuestProfile({
        ...(csName.trim() ? { name: csName } : {}),
        vehicleColor: csColor,
        vehicleType: csType,
        licensePlate: csPlate,
      });
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
      saveGuestProfile({
        name: custName,
        ...(custPhone.trim() ? { phone: custPhone } : {}),
        ...(channel === 'curbside' || channel === 'drive_thru'
          ? {
              vehicleColor: vehColor,
              vehicleType: vehType,
              ...(plate.trim() ? { licensePlate: plate } : {}),
            }
          : {}),
      });
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
      saveLastGuestOrder(restaurant.id, cart);
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
  const subtotalCents = cart.reduce((sum, i) => sum + Math.round(Number(i.unitTotal) * 100) * i.quantity, 0);
  const feeTotals = computeOrderTotalsWithVenueFees(subtotalCents, venueCfg);
  const totalCartAmount = feeTotals.total;
  const orderingEnabled = restaurant.orderingMode !== 'browse_and_pager';
  const lastSavedOrder = orderingEnabled && cart.length === 0 ? readLastGuestOrder(restaurant.id) : [];
  const cartLeadSummary =
    cart.length > 0
      ? cart.length === 1
        ? label(cart[0].name)
        : `${label(cart[0].name)} +${cart.length - 1}`
      : '';

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
      {initialTableCode && (
        <TableCompanionBar
          restaurant={restaurant}
          tableCode={initialTableCode}
          language={language}
          dir={dir}
        />
      )}

      {!initialTableCode && initialBayId && (
        <div className="my-2 px-4 py-2.5 rounded-2xl bg-[#17132E] text-white border border-[#241E42] text-xs font-semibold flex items-center justify-between gap-3 shadow-sm">
          <span className="inline-flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#C8FF42]" aria-hidden="true" />
            <span className="inline-flex items-center gap-1.5">
              <Car className="w-3.5 h-3.5 text-[#C8FF42]" />
              <span>Curbside Pickup Bay Connected</span>
            </span>
          </span>
          {!orderingEnabled && (
            <button
              type="button"
              onClick={() => setCurbsideOpen(true)}
              className="px-2.5 py-1 rounded-lg bg-[#C8FF42] text-[#17132E] font-extrabold cursor-pointer"
            >
              Check In Car →
            </button>
          )}
        </div>
      )}

      <div
        className="flex flex-nowrap overflow-x-auto no-scrollbar py-2 gap-1.5 my-1 snap-x"
        role="region"
        aria-label="Hospitality services"
      >
        {lastSavedOrder.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setCart(lastSavedOrder);
              setCartOpen(true);
            }}
            data-testid="button-reorder-last-visit"
            className="inline-flex items-center gap-1.5 px-3 min-h-10 shrink-0 snap-start whitespace-nowrap rounded-full border border-[#6236FF]/30 bg-[#EFEAFF] text-[#4B1FE0] text-xs font-semibold hover:bg-[#E4DCFF] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>
              {language === 'ar' ? 'إعادة آخر طلب' : `Reorder (${label(lastSavedOrder[0].name)})`}
            </span>
          </button>
        )}

        {restaurant.reservationsEnabled && (
          <button
            type="button"
            onClick={() => setReserveOpen(true)}
            data-testid="button-open-reservations"
            className="inline-flex items-center gap-1.5 px-3 min-h-10 shrink-0 snap-start whitespace-nowrap rounded-full border border-[#E5E2F2] bg-[#F6F5FC] text-[#17132E] text-xs font-medium hover:bg-[#EFEAFF] hover:border-[#CBC5E8] transition-colors cursor-pointer"
          >
            <CalendarDays className="w-3.5 h-3.5 text-[#57507A] shrink-0" />
            <span>{t('Book Table')}</span>
          </button>
        )}

        {restaurant.waitlistEnabled && (
          <button
            type="button"
            onClick={() => setWaitlistOpen(true)}
            data-testid="button-open-waitlist"
            className="inline-flex items-center gap-1.5 px-3 min-h-10 shrink-0 snap-start whitespace-nowrap rounded-full border border-[#E5E2F2] bg-[#F6F5FC] text-[#17132E] text-xs font-medium hover:bg-[#EFEAFF] hover:border-[#CBC5E8] transition-colors cursor-pointer"
          >
            <Users className="w-3.5 h-3.5 text-[#57507A] shrink-0" />
            <span>{t('Walk-In Waitlist')}</span>
          </button>
        )}

        {restaurant.driveThruEnabled && bays.length > 0 && (
          <button
            type="button"
            onClick={() => setCurbsideOpen(true)}
            data-testid="button-open-curbside"
            className="inline-flex items-center gap-1.5 px-3 min-h-10 shrink-0 snap-start whitespace-nowrap rounded-full border border-[#E5E2F2] bg-[#F6F5FC] text-[#17132E] text-xs font-medium hover:bg-[#EFEAFF] hover:border-[#CBC5E8] transition-colors cursor-pointer"
          >
            <Car className="w-3.5 h-3.5 text-[#57507A] shrink-0" />
            <span>{t('Curbside')}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setPagerOpen(true)}
          data-testid="button-open-pager-lookup"
          className="inline-flex items-center gap-1.5 px-3 min-h-10 shrink-0 snap-start whitespace-nowrap rounded-full border border-[#E5E2F2] bg-[#F6F5FC] text-[#17132E] text-xs font-medium hover:bg-[#EFEAFF] hover:border-[#CBC5E8] transition-colors cursor-pointer"
        >
          <Bell className="w-3.5 h-3.5 text-[#57507A] shrink-0" />
          <span>{t('Track Pager')}</span>
        </button>

        {aggregators.length > 0 && (
          <button
            type="button"
            onClick={() => setDeliveryOpen(true)}
            data-testid="button-open-delivery"
            className="inline-flex items-center gap-1.5 px-3 min-h-10 shrink-0 snap-start whitespace-nowrap rounded-full border border-[#E5E2F2] bg-[#F6F5FC] text-[#17132E] text-xs font-medium hover:bg-[#EFEAFF] hover:border-[#CBC5E8] transition-colors cursor-pointer"
          >
            <Truck className="w-3.5 h-3.5 text-[#57507A] shrink-0" />
            <span>{t('Get Delivery')}</span>
          </button>
        )}
        {trailingActions}
      </div>

      {orderingEnabled && totalCartItems > 0 && (
        <div
          style={{ bottom: 'max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))' }}
          className="fixed inset-x-4 z-40 max-w-md mx-auto"
        >
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            data-testid="button-open-cart"
            className="w-full min-h-14 px-4 rounded-2xl bg-[#17132E] hover:bg-[#241E42] text-white shadow-xl flex items-center justify-between gap-3 transition-all duration-150 active:scale-[0.99] cursor-pointer"
          >
            <span className="inline-flex items-center gap-3 min-w-0" role="status" aria-atomic="true">
              <span className="min-w-7 h-7 px-2 rounded-full bg-white/15 text-white font-mono text-xs font-bold grid place-items-center shrink-0">
                {totalCartItems}
              </span>
              <span className="text-start min-w-0">
                <strong className="block text-sm font-semibold leading-tight">{t('View Cart')}</strong>
                <small className="block text-[11px] text-white/65 truncate">{cartLeadSummary}</small>
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-sm text-white shrink-0">
              <span>
                <bdi dir="ltr">{totalCartAmount}</bdi> {currencyDisplay}
              </span>
              <ArrowRight className="w-4 h-4 text-white/75 rtl:rotate-180" aria-hidden="true" />
            </span>
          </button>
        </div>
      )}

      <GuestVenueServiceDialogs
        restaurant={restaurant}
        cafeDisplayName={cafeDisplayName}
        language={language}
        dir={dir}
        t={t}
        partyOptions={partyOptions}
        zones={zones}
        bays={bays}
        pagerOpen={pagerOpen}
        setPagerOpen={setPagerOpen}
        lookupCode={lookupCode}
        setLookupCode={setLookupCode}
        lookupError={lookupError}
        lookupPending={lookupMutation.isPending}
        onSubmitLookup={() => {
          void preArmAudioOnUserGesture({ cafeName: restaurant.name, ticketCode: lookupCode.trim() || 'PAGER' });
          lookupMutation.mutate();
        }}
        reserveOpen={reserveOpen}
        setReserveOpen={setReserveOpen}
        todayIso={todayIso}
        resDate={resDate}
        setResDate={setResDate}
        resParty={resParty}
        setResParty={setResParty}
        resZone={resZone}
        setResZone={setResZone}
        resSlot={resSlot}
        setResSlot={setResSlot}
        resName={resName}
        setResName={setResName}
        resPhone={resPhone}
        setResPhone={setResPhone}
        resNotes={resNotes}
        setResNotes={setResNotes}
        resError={resError}
        availabilityLoading={availabilityQuery.isLoading}
        availabilitySlots={availabilityQuery.data?.slots || []}
        reservePending={reserveMutation.isPending}
        onSubmitReserve={() => reserveMutation.mutate()}
        pendingDepositGateway={pendingDepositGateway}
        setPendingDepositGateway={setPendingDepositGateway}
        confirmDepositPending={confirmDepositMutation.isPending}
        onConfirmDeposit={() => confirmDepositMutation.mutate()}
        waitlistOpen={waitlistOpen}
        setWaitlistOpen={setWaitlistOpen}
        wlName={wlName}
        setWlName={setWlName}
        wlPhone={wlPhone}
        setWlPhone={setWlPhone}
        wlParty={wlParty}
        setWlParty={setWlParty}
        wlZone={wlZone}
        setWlZone={setWlZone}
        wlError={wlError}
        waitlistPending={waitlistMutation.isPending}
        onSubmitWaitlist={() => {
          void preArmAudioOnUserGesture({ cafeName: restaurant.name, ticketCode: 'WAITLIST' });
          waitlistMutation.mutate();
        }}
        curbsideOpen={curbsideOpen}
        setCurbsideOpen={setCurbsideOpen}
        csBayId={csBayId}
        setCsBayId={setCsBayId}
        csName={csName}
        setCsName={setCsName}
        csColor={csColor}
        setCsColor={setCsColor}
        csType={csType}
        setCsType={setCsType}
        csPlate={csPlate}
        setCsPlate={setCsPlate}
        csError={csError}
        curbsidePending={curbsideMutation.isPending}
        onSubmitCurbside={() => {
          void preArmAudioOnUserGesture({ cafeName: restaurant.name, ticketCode: 'CURBSIDE' });
          curbsideMutation.mutate();
        }}
      />

      <GuestCheckoutAndDeliveryModals
        restaurant={restaurant}
        language={language}
        dir={dir}
        t={t}
        label={label}
        aggregators={aggregators}
        deliveryOpen={deliveryOpen}
        setDeliveryOpen={setDeliveryOpen}
        onAggregatorClick={handleAggregatorClick}
        cartOpen={cartOpen}
        setCartOpen={setCartOpen}
        cart={cart}
        setCart={setCart}
        bays={bays}
        channel={channel}
        setChannel={setChannel}
        custName={custName}
        setCustName={setCustName}
        custPhone={custPhone}
        setCustPhone={setCustPhone}
        tableCode={tableCode}
        setTableCode={setTableCode}
        bayId={bayId}
        setBayId={setBayId}
        vehColor={vehColor}
        setVehColor={setVehColor}
        vehType={vehType}
        setVehType={setVehType}
        plate={plate}
        setPlate={setPlate}
        orderNotes={orderNotes}
        setOrderNotes={setOrderNotes}
        totalCartAmount={totalCartAmount}
        orderError={orderError}
        orderPending={orderMutation.isPending}
        onSubmitOrder={() => {
          void preArmAudioOnUserGesture({ cafeName: restaurant.name, ticketCode: 'ORDER' });
          orderMutation.mutate();
        }}
        pendingGateway={pendingGateway}
        confirmGatewayPending={confirmGatewayMutation.isPending}
        onConfirmGateway={() => {
          void preArmAudioOnUserGesture({ cafeName: restaurant.name, ticketCode: pendingGateway?.orderNumber || 'ORDER' });
          confirmGatewayMutation.mutate();
        }}
        scannerOpen={scannerOpen}
        setScannerOpen={setScannerOpen}
      />
    </>
  );
}
