import { useEffect, useState } from 'react';
import { useRoute, Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  BellRing,
  Car,
  CheckCircle2,
  Clock,
  Coffee,
  Download,
  ExternalLink,
  Gamepad2,
  MapPin,
  ShieldCheck,
  Sparkles,
  Star,
  Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { cafeThemeStyle } from '@/lib/cafeTheme';
import { MenuLanguageProvider, MenuLanguageSwitch, useMenuLanguage } from '@/lib/menuLanguage';
import {
  armLockScreenAudioKeepAlive,
  startContinuousRinger,
  stopContinuousRinger,
  subscribeRingingState,
} from '@/lib/lockScreenRinger';
import { subscribeGuestLockScreenPush } from '@/lib/mobileBridge';
import { dismissGuestPass, saveGuestPass } from '@/lib/guestSession';
import { PwaInstallBanner } from '@/components/mobile/PwaInstallBanner';
import { DingziMark } from '@/components/staff-brand';
import { useRealtimeStream } from '@/lib/useRealtimeStream';

function BeanCatcherMiniGame() {
  const [score, setScore] = useState(0);
  const [targetIdx, setTargetIdx] = useState(4);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTargetIdx(Math.floor(Math.random() * 9));
    }, 850);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Gamepad2 className="w-4 h-4 text-primary" aria-hidden="true" />
          <span>Barista Reflex Mini-Game</span>
        </div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary" role="status" aria-atomic="true">
          Score: {score}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto">
        {Array.from({ length: 9 }, (_, idx) => {
          const active = idx === targetIdx;
          return (
            <button
              key={idx}
              type="button"
              aria-label={active ? 'Tap active coffee cup' : 'Empty tile'}
              onClick={() => {
                if (active) {
                  setScore(s => s + 1);
                  setTargetIdx(Math.floor(Math.random() * 9));
                }
              }}
              className={`h-14 rounded-xl border flex items-center justify-center transition-colors duration-150 cursor-pointer ${
                active
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted'
              }`}
            >
              {active && <Coffee className="w-6 h-6" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-center text-muted-foreground mt-2">
        Tap the espresso cup while your order brews — lock-screen ringing stays armed!
      </p>
    </div>
  );
}

export default function VirtualPagerPage() {
  return (
    <MenuLanguageProvider>
      <VirtualPagerContent />
    </MenuLanguageProvider>
  );
}

function VirtualPagerContent() {
  const [, params] = useRoute('/pager/:token');
  const token = params?.token || '';
  const { language, dir, t, label } = useMenuLanguage();

  const [alertsArmed, setAlertsArmed] = useState(false);
  const [pushMode, setPushMode] = useState<'none' | 'native_push' | 'web_push' | 'audio_keepalive_only'>('none');
  const [pushNote, setPushNote] = useState('');
  const [isRinging, setIsRinging] = useState(false);
  const [showGame, setShowGame] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [feedbackSaved, setFeedbackSaved] = useState<{ promptGoogleReview: boolean; googleMapsReviewUrl: string | null } | null>(null);
  const [bayId, setBayId] = useState('');
  const [vehicleColor, setVehicleColor] = useState('White');
  const [vehicleType, setVehicleType] = useState<'Sedan' | 'SUV' | 'Pickup' | 'Coupe' | 'Other'>('SUV');
  const [licensePlate, setLicensePlate] = useState('');

  useEffect(() => subscribeRingingState(setIsRinging), []);

  const pagerQuery = useQuery<any>({
    enabled: Boolean(token),
    queryKey: ['/api/public/pager', token],
    queryFn: async () => {
      const res = await fetch(`/api/public/pager/${token}`);
      if (!res.ok) throw new Error('Pager ticket not found');
      return res.json();
    },
    refetchInterval: 3500,
  });

  const data = pagerQuery.data;
  const ticket = data?.ticket;
  const restaurant = data?.restaurant;

  useRealtimeStream(token ? `/api/public/stream/pager/${token}` : null, event => {
    void queryClient.invalidateQueries({ queryKey: ['/api/public/pager', token] });
    if (event.type === 'pager.buzzed' || event.data?.ticket?.status === 'ready') {
      startContinuousRinger({
        cafeName: restaurant?.name || 'Café',
        ticketCode: ticket?.ticketCode || event.data?.ticket?.ticketCode || 'READY',
        subtitle: 'Your order is hot and ready at the pickup counter!',
      });
    }
  });

  const prevStatusKey = `${ticket?.status || ''}:${ticket?.buzzCount || 0}`;
  const [seenKey, setSeenKey] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!ticket || !restaurant) return;
    if (['waiting', 'preparing', 'ready'].includes(ticket.status)) {
      saveGuestPass({
        kind: 'pager',
        trackingToken: token,
        code: ticket.ticketCode,
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
      });
    } else if (['collected', 'no_show'].includes(ticket.status)) {
      dismissGuestPass('pager', token);
    }
  }, [ticket, restaurant, token]);

  useEffect(() => {
    if (!ticket) return;
    if (seenKey && seenKey !== prevStatusKey) {
      if (ticket.status === 'ready') {
        startContinuousRinger({
          cafeName: restaurant?.name || 'Dingzi',
          ticketCode: ticket.ticketCode,
          subtitle: 'Your order is ready for pickup!',
        });
      } else if (ticket.status === 'collected' || ticket.status === 'no_show') {
        stopContinuousRinger();
      }
    }
    setSeenKey(prevStatusKey);
  }, [prevStatusKey, seenKey, ticket, restaurant?.name]);

  async function handleArmLockScreen() {
    if (!ticket || !restaurant) return;
    await armLockScreenAudioKeepAlive({ cafeName: restaurant.name, ticketCode: ticket.ticketCode });
    const subRes = await subscribeGuestLockScreenPush(`pager:${token}`);
    setAlertsArmed(true);
    setPushMode(subRes.mode);
    setPushNote(subRes.reason || '');
  }

  const testPushMutation = useMutation({
    mutationFn: async () => {
      if (!alertsArmed) await handleArmLockScreen();
      startContinuousRinger({
        cafeName: restaurant?.name || 'Pager',
        ticketCode: ticket?.ticketCode || 'TEST',
        subtitle: 'Lock-screen speaker & vibration test active — tap Stop Ringing.',
      });
      const res = await apiRequest('POST', '/api/public/push/test', { scope: `pager:${token}` });
      return res.json();
    },
  });

  const checkinMutation = useMutation({
    mutationFn: async (etaStatus: '5_mins_away' | 'arrived') => {
      const res = await apiRequest('POST', '/api/public/curbside/checkin', {
        trackingToken: token,
        bayId,
        etaStatus,
        vehicleColor,
        vehicleType,
        licensePlate,
      });
      return res.json();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['/api/public/pager', token] }),
  });

  const feedbackMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/public/pager/${token}/feedback`, { rating, comment });
      return res.json();
    },
    onSuccess: res => {
      setFeedbackSaved(res);
      void queryClient.invalidateQueries({ queryKey: ['/api/public/pager', token] });
    },
  });

  if (pagerQuery.isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-foreground p-6">
        <div className="text-center space-y-3">
          <Coffee className="w-10 h-10 mx-auto text-primary animate-pulse" aria-hidden="true" />
          <p className="font-medium">Connecting to live virtual pager…</p>
        </div>
      </div>
    );
  }

  if (!ticket || !restaurant) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-foreground p-6">
        <div className="max-w-sm text-center space-y-4">
          <h1 className="text-2xl font-bold">Pager not found</h1>
          <p className="text-muted-foreground text-sm">Scan the QR code from the counter or receipt again.</p>
          <Link href="/">
            <Button className="cursor-pointer min-h-11">Browse cafés</Button>
          </Link>
        </div>
      </div>
    );
  }

  const isReady = ticket.status === 'ready';
  const isCollected = ticket.status === 'collected';
  const steps = [
    { id: 'waiting', label: t('Waiting in Queue') },
    { id: 'preparing', label: t('Preparing Now') },
    { id: 'ready', label: t('Ready for Pickup!') },
    { id: 'collected', label: t('Order Collected') },
  ];
  const currentIdx = steps.findIndex(s => s.id === ticket.status);

  return (
    <div
      dir={dir}
      lang={language}
      style={{
        ...cafeThemeStyle(restaurant.theme, restaurant.brandAccentHex),
        paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))',
      }}
      className={`min-h-screen bg-background text-foreground transition-colors duration-300 ${
        isRinging ? 'ring-8 ring-inset ring-[#C8FF42]' : ''
      }`}
    >
      <div className="max-w-lg mx-auto px-4 space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <DingziMark size={42} />
            <div className="min-w-0">
              <p className="text-xs tracking-wide text-muted-foreground font-semibold">
                <span className="lowercase font-display font-extrabold text-[#6236FF]" dir="ltr" lang="en">dingzi</span> · {t('Virtual Pager')}
              </p>
              <h1 className="font-bold text-lg truncate">{label(restaurant.name)}</h1>
            </div>
          </div>
          <MenuLanguageSwitch />
        </header>

        <PwaInstallBanner compact />

        {/* Continuous Acknowledgeable Lock-Screen Alarm Banner — Volt Lime (#C8FF42) + Midnight Indigo (#17132E) 15.3:1 AAA */}
        {isRinging && (
          <div
            role="alert"
            className="rounded-3xl bg-[#C8FF42] text-[#17132E] p-5 shadow-dz-volt space-y-3 border-2 border-[#17132E]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <BellRing className="w-7 h-7 motion-safe:animate-bell-swing shrink-0 text-[#17132E]" aria-hidden="true" />
                <div>
                  <strong className="block text-lg font-display font-extrabold leading-tight">
                    {t('Ding! Your food is ready.')} ({ticket.ticketCode})
                  </strong>
                  <span className="text-xs font-medium text-[#17132E]/85">
                    Head to the pickup counter — tap below to silence alarm.
                  </span>
                </div>
              </div>
            </div>
            <Button
              type="button"
              data-testid="button-stop-ringing"
              onClick={() =>
                stopContinuousRinger(
                  !isCollected ? { cafeName: restaurant.name, ticketCode: ticket.ticketCode } : undefined,
                )
              }
              className="w-full min-h-14 rounded-2xl font-bold text-base bg-[#17132E] text-white hover:bg-[#241E42] cursor-pointer gap-2"
            >
              <BellOff className="w-5 h-5" aria-hidden="true" />
              <span>Stop Ringing · On My Way</span>
            </Button>
          </div>
        )}

        {/* Primary Ticket Card */}
        <section
          className={`rounded-3xl border-2 p-6 text-center shadow-lg transition-colors duration-300 ${
            isReady
              ? 'border-[#C8FF42] bg-[#17132E] text-white'
              : 'border-border bg-card'
          }`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-3 ${
              isReady
                ? 'bg-[#C8FF42] text-[#17132E]'
                : 'bg-[#EFEAFF] text-[#4B1FE0]'
            }`}
          >
            {isReady ? <BellRing className="w-4 h-4 motion-safe:animate-pulse" aria-hidden="true" /> : <Clock className="w-4 h-4" aria-hidden="true" />}
            <span>
              {isReady
                ? t('Ready for Pickup!')
                : isCollected
                  ? t('Order Collected')
                  : ticket.status === 'preparing'
                    ? t('Preparing Now')
                    : t('Waiting in Queue')}
            </span>
          </div>

          <div
            className={`text-5xl font-black tracking-tight my-2 font-mono ${
              isReady ? 'text-[#C8FF42]' : 'text-foreground'
            }`}
            data-testid="text-pager-code"
          >
            {ticket.ticketCode}
          </div>
          {ticket.customerName && (
            <p className={`text-sm font-medium ${isReady ? 'text-white/80' : 'text-muted-foreground'}`}>{ticket.customerName}</p>
          )}

          {!isReady && !isCollected && (
            <div className="mt-4 space-y-2.5">
              <p className="text-xs font-semibold text-[#57507A]">
                {t("Sit easy. We'll ding your phone when it's hot.")}
              </p>
              <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground font-mono">
                <span className="px-3 py-1.5 rounded-xl bg-muted font-medium">
                  {t('Queue ahead')}: <strong className="text-foreground">{data.queueAhead}</strong>
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-muted font-medium">
                  {t('Est. prep')}: <strong className="text-foreground">~{ticket.estimatedPrepMins} min</strong>
                </span>
              </div>
            </div>
          )}

          {isReady && (
            <div className="mt-4 p-3.5 rounded-2xl bg-[#C8FF42] text-[#17132E] font-display font-extrabold text-sm shadow-dz-volt">
              {t('Ding! Your food is ready.')} · {ticket.ticketCode}
            </div>
          )}

          <ol className="grid grid-cols-4 gap-1.5 sm:gap-2 mt-6 text-[11px] sm:text-xs">
            {steps.map((step, idx) => {
              const done = currentIdx >= idx;
              return (
                <li key={step.id} className="space-y-1.5 min-w-0">
                  <div
                    className={`h-2 rounded-full transition-colors ${
                      done ? (isReady ? 'bg-[#C8FF42]' : 'bg-[#6236FF]') : isReady ? 'bg-[#241E42]' : 'bg-muted'
                    }`}
                  />
                  <span
                    className={`block leading-tight break-words ${
                      done
                        ? isReady
                          ? 'font-semibold text-white'
                          : 'font-semibold text-foreground'
                        : isReady
                          ? 'text-white/60'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Lock-Screen Push + Audio Keep-Alive Arming Panel */}
        {!isCollected && (
          <section className="rounded-2xl border bg-card p-4 space-y-2.5">
            <div className="flex flex-col min-[390px]:flex-row gap-2">
              <Button
                type="button"
                variant={alertsArmed ? 'secondary' : 'default'}
                className="flex-1 min-h-12 rounded-2xl font-semibold cursor-pointer gap-2"
                onClick={handleArmLockScreen}
                data-testid="button-enable-pager-alerts"
              >
                {alertsArmed ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden="true" />
                ) : (
                  <Bell className="w-5 h-5 shrink-0" aria-hidden="true" />
                )}
                <span className="truncate">
                  {alertsArmed
                    ? 'Lock-Screen Push & Ringer Armed'
                    : 'Arm Lock-Screen Ringing & Push'}
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => testPushMutation.mutate()}
                disabled={testPushMutation.isPending}
                data-testid="button-test-pager-ring"
                className="min-h-12 px-3.5 rounded-2xl font-semibold cursor-pointer gap-1.5 shrink-0"
              >
                <Volume2 className="w-4 h-4" aria-hidden="true" />
                <span>Test Ring</span>
              </Button>
            </div>
            {alertsArmed && (
              <p className="text-xs text-muted-foreground px-1">
                {pushMode === 'web_push' || pushMode === 'native_push'
                  ? 'Encrypted background Push + Lock-Screen Audio Keep-Alive active — safe to lock your phone.'
                  : pushNote || 'Lock-Screen Audio Keep-Alive + Wake Lock active.'}
              </p>
            )}
          </section>
        )}

        {/* Order Summary */}
        {data.order && (() => {
          const orderLines: any[] = data.order.lineItems || [];
          const doneCount = orderLines.filter(l => Boolean(l.prepared)).length;
          return (
          <section className="rounded-2xl border bg-card p-4 space-y-2.5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 font-semibold">
              <div className="flex items-center gap-2">
                <span>{data.order.orderNumber}</span>
                {orderLines.length > 0 && doneCount > 0 && (
                  <span
                    data-testid="badge-guest-items-prepared"
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      doneCount === orderLines.length
                        ? 'bg-[#C8FF42] text-[#17132E]'
                        : 'bg-[#EFEAFF] text-[#4B1FE0]'
                    }`}
                  >
                    {t('{done}/{total} prepared', { done: doneCount, total: orderLines.length })}
                  </span>
                )}
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-xs bg-muted">
                {data.order.paymentStatus === 'paid' ? 'Paid' : 'Pay at Venue'} · {data.order.total} {data.order.currency}
              </span>
            </div>
            <ul className="divide-y text-xs text-muted-foreground">
              {orderLines.map((line: any, i: number) => (
                <li key={i} className="py-1.5 flex justify-between items-start gap-2">
                  <span className="inline-flex items-start gap-1.5">
                    {line.prepared && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#6236FF] shrink-0 mt-0.5" aria-hidden="true" />
                    )}
                    <span>
                      <strong className="text-foreground">{line.quantity}× {label(line.name)}</strong>
                      {line.variantLabel ? ` (${line.variantLabel})` : ''}
                      {line.modifiers?.length ? ` · ${line.modifiers.map((m: any) => m.label).join(', ')}` : ''}
                      {line.notes ? ` · “${line.notes}”` : ''}
                    </span>
                  </span>
                  <span className="font-medium text-foreground shrink-0">{line.lineTotal}</span>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="button-download-guest-receipt"
              onClick={() => {
                const lines = [
                  restaurant.name,
                  `Order: ${data.order.orderNumber} · Pager: ${ticket.ticketCode}`,
                  `Date: ${new Date(data.order.createdAt).toLocaleString()}`,
                  `Status: ${data.order.paymentStatus.toUpperCase()}`,
                  '--------------------------------',
                  ...orderLines.map(
                    (l: any) => `${l.quantity}x ${l.name}${l.variantLabel ? ` (${l.variantLabel})` : ''} - ${l.lineTotal} ${data.order.currency}`,
                  ),
                  '--------------------------------',
                  `TOTAL: ${data.order.total} ${data.order.currency}`,
                ];
                const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
                const u = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = u;
                a.download = `dingzi-receipt-${data.order.orderNumber}.txt`;
                a.click();
                URL.revokeObjectURL(u);
              }}
              className="w-full min-h-10 rounded-xl text-xs cursor-pointer gap-1.5"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download Order Receipt</span>
            </Button>
          </section>
          );
        })()}

        {/* Curbside / Drive-Thru Bay Arrival Check-in */}
        {restaurant.driveThruEnabled && !isCollected && data.bays?.length > 0 && (
          <section className="rounded-2xl border bg-card p-4 space-y-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 font-semibold text-sm">
                <Car className="w-4 h-4 text-[#6236FF]" aria-hidden="true" />
                <span>{t('Curbside & Drive-Thru')}</span>
                {data.bay && (
                  <span className="ms-auto text-xs px-2.5 py-0.5 rounded-full bg-[#C8FF42] text-[#17132E] font-mono font-bold">
                    {data.bay.code}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#57507A]">
                {t("Park easy. Scan your bay and we'll bring it out.")}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <Label className="text-xs">{t('Select Parking Bay')}</Label>
                <select
                  className="manager-select w-full h-11 text-sm"
                  value={bayId || ticket.bayId || ''}
                  onChange={e => setBayId(e.target.value)}
                >
                  <option value="">Select bay…</option>
                  {data.bays.map((b: any) => (
                    <option key={b.id} value={b.id}>{b.code} — {b.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">{t('Vehicle Color')}</Label>
                <select
                  className="manager-select w-full h-11 text-sm"
                  value={vehicleColor}
                  onChange={e => setVehicleColor(e.target.value)}
                >
                  {['White', 'Black', 'Silver', 'Gray', 'Blue', 'Red', 'Sand', 'Green'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">{t('Vehicle Type')}</Label>
                <select
                  className="manager-select w-full h-11 text-sm"
                  value={vehicleType}
                  onChange={e => setVehicleType(e.target.value as any)}
                >
                  {['SUV', 'Sedan', 'Pickup', 'Coupe', 'Other'].map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">{t('License Plate')}</Label>
                <Input
                  value={licensePlate}
                  onChange={e => setLicensePlate(e.target.value)}
                  placeholder="QAT 48291"
                  className="h-11"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 cursor-pointer"
                disabled={!(bayId || ticket.bayId) || !licensePlate.trim() || checkinMutation.isPending}
                onClick={() => checkinMutation.mutate('5_mins_away')}
              >
                {t('5 Mins Away')}
              </Button>
              <Button
                type="button"
                className="min-h-11 cursor-pointer"
                disabled={!(bayId || ticket.bayId) || !licensePlate.trim() || checkinMutation.isPending}
                onClick={() => checkinMutation.mutate('arrived')}
              >
                <MapPin className="w-4 h-4 mr-1.5" aria-hidden="true" />
                {t("I'm Here — Check In")}
              </Button>
            </div>
          </section>
        )}

        {/* Post-Pickup Reputation Loop */}
        {(isCollected || isReady) && (
          <section className="rounded-2xl border bg-card p-5 space-y-3 text-center">
            <h2 className="font-semibold text-base">{t('Rate your experience')}</h2>
            {ticket.rating || feedbackSaved ? (
              <div className="space-y-3">
                <div className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-sm">
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  <span>Thank you for your {ticket.rating || rating}-star feedback!</span>
                </div>
                {(feedbackSaved?.googleMapsReviewUrl || ((ticket.rating || rating) >= 4 && restaurant.googleMapsReviewUrl)) && (
                  <div>
                    <a
                      href={feedbackSaved?.googleMapsReviewUrl || restaurant.googleMapsReviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button className="w-full min-h-11 cursor-pointer gap-2">
                        <Star className="w-4 h-4 fill-current" aria-hidden="true" />
                        <span>{t('Leave a Google Maps Review')}</span>
                        <ExternalLink className="w-4 h-4" aria-hidden="true" />
                      </Button>
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      aria-label={`Rate ${star} stars`}
                      onClick={() => setRating(star)}
                      className="w-11 h-11 rounded-xl border grid place-items-center cursor-pointer transition-colors hover:bg-muted"
                    >
                      <Star
                        className={`w-6 h-6 ${
                          star <= rating ? 'fill-[#6236FF] text-[#6236FF]' : 'text-muted-foreground'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                {rating > 0 && (
                  <div className="space-y-2">
                    <Input
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder="Any quick note for our barista team? (optional)"
                    />
                    <Button
                      type="button"
                      className="w-full min-h-11 cursor-pointer"
                      disabled={feedbackMutation.isPending}
                      onClick={() => feedbackMutation.mutate()}
                    >
                      Submit Rating
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* Specials & Mini-Game */}
        {!isCollected && (
          <div className="space-y-3">
            {data.specials?.length > 0 && (
              <section className="rounded-2xl border bg-card p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t("Today's specials")}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {data.specials.map((item: any) => (
                    <div key={item.id} className="rounded-xl border p-2.5 text-xs space-y-1">
                      <strong className="block truncate">{label(item.name)}</strong>
                      <span className="text-muted-foreground">
                        {Number(item.price).toFixed(2)} {restaurant.currency}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {restaurant.pagerMiniGameEnabled && (
              <div>
                {showGame ? (
                  <BeanCatcherMiniGame />
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full min-h-11 rounded-2xl cursor-pointer gap-2"
                    onClick={() => setShowGame(true)}
                  >
                    <Gamepad2 className="w-4 h-4" aria-hidden="true" />
                    <span>Play Barista Reflex Game while waiting</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <Link href={`/menu/${restaurant.id}`}>
            <Button variant="ghost" className="cursor-pointer min-h-11 text-sm">
              Back to {label(restaurant.name)} Menu
            </Button>
          </Link>
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer min-h-11 text-xs rounded-xl"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 2000);
              } catch {}
            }}
          >
            {copiedLink ? t('Pass link copied!') : t('Share Pass')}
          </Button>
        </footer>
      </div>
    </div>
  );
}
