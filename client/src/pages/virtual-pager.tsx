import { useEffect, useState } from 'react';
import { useRoute, Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  BellRing,
  Car,
  CheckCircle2,
  ChevronDown,
  Clock,
  Coffee,
  ExternalLink,
  Gamepad2,
  MapPin,
  Receipt,
  ShieldCheck,
  Sparkles,
  Star,
  Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandedReceiptSheet } from '@/components/hospitality/BrandedReceiptSheet';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { cafeThemeStyle } from '@/lib/cafeTheme';
import { localizedEntityText, MenuLanguageProvider, MenuLanguageSwitch, useMenuLanguage } from '@/lib/menuLanguage';
import { formatCurrencyForLocale, resolveVenueConfig } from '@shared/venueConfig';
import {
  armLockScreenAudioKeepAlive,
  preArmAudioOnUserGesture,
  setLockScreenAckHandler,
  startContinuousRinger,
  stopContinuousRinger,
  subscribeLockScreenArmedState,
  subscribeRingingState,
} from '@/lib/lockScreenRinger';
import {
  autoSyncLockScreenPushIfPermitted,
  isScopePushPreviouslyArmed,
  reportGuestAudioKeepAliveArmed,
  subscribeGuestLockScreenPush,
} from '@/lib/mobileBridge';
import { dismissGuestPass, readGuestProfile, saveGuestPass, saveGuestProfile } from '@/lib/guestSession';
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
        <span
          className="text-xs font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary"
          role="status"
          aria-atomic="true"
        >
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
        Tap the espresso cup while your order brews — lock-screen ringing stays armed.
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
  const isSilentPreview =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1';
  const savedProfile = readGuestProfile();

  const [audioArmed, setAudioArmed] = useState(false);
  const [claimedOnce, setClaimedOnce] = useState(false);
  const [pushMode, setPushMode] = useState<'none' | 'native_push' | 'web_push' | 'audio_keepalive_only'>(() =>
    token && isScopePushPreviouslyArmed(`pager:${token}`) ? 'web_push' : 'none',
  );
  const [pushNote, setPushNote] = useState('');
  const [isRinging, setIsRinging] = useState(false);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [showGame, setShowGame] = useState(false);
  const [curbsideExpanded, setCurbsideExpanded] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [feedbackSaved, setFeedbackSaved] = useState<{
    promptGoogleReview: boolean;
    googleMapsReviewUrl: string | null;
  } | null>(null);
  const [bayId, setBayId] = useState('');
  const [vehicleColor, setVehicleColor] = useState(savedProfile.vehicleColor || 'White');
  const [vehicleType, setVehicleType] = useState<string>(savedProfile.vehicleType || 'SUV');
  const [licensePlate, setLicensePlate] = useState(savedProfile.licensePlate);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => subscribeRingingState(setIsRinging), []);
  useEffect(() => subscribeLockScreenArmedState(setAudioArmed), []);
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const pagerQuery = useQuery<any>({
    enabled: Boolean(token),
    queryKey: ['/api/public/pager', token],
    queryFn: async () => {
      const claimQuery = !isSilentPreview && !claimedOnce ? '?claim=1' : '';
      if (!isSilentPreview && !claimedOnce) setClaimedOnce(true);
      const res = await fetch(`/api/public/pager/${token}${claimQuery}`);
      if (!res.ok) throw new Error('Pager ticket not found');
      return res.json();
    },
    refetchInterval: 3500,
    refetchIntervalInBackground: true,
  });

  const data = pagerQuery.data;
  const ticket = data?.ticket;
  const restaurant = data?.restaurant;
  const venueCfg = resolveVenueConfig(restaurant?.venueConfig);
  const readySubtitle = language === 'ar' ? venueCfg.pagerReadySubtitleAr : venueCfg.pagerReadySubtitle;
  const alertsArmed =
    audioArmed || pushMode === 'web_push' || pushMode === 'native_push' || Boolean(ticket?.pushArmed);

  const ackMutation = useMutation({
    mutationFn: async () => {
      if (!token || isSilentPreview) return null;
      const res = await apiRequest('POST', `/api/public/pager/${token}/ack`, {});
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/public/pager', token] });
    },
  });

  useEffect(() => {
    if (!token || isSilentPreview) return;
    setLockScreenAckHandler(() => {
      ackMutation.mutate();
    });
    return () => setLockScreenAckHandler(null);
  }, [token, isSilentPreview]);

  // Auto-bind Web Push silently on mount when Notification permission is already granted
  useEffect(() => {
    if (!token || isSilentPreview) return;
    let active = true;
    void autoSyncLockScreenPushIfPermitted(`pager:${token}`).then(res => {
      if (active && res.ok) {
        setPushMode('web_push');
      }
    });
    return () => {
      active = false;
    };
  }, [token, isSilentPreview]);

  // Auto-arm lock-screen speaker keep-alive on the guest's very first touch anywhere on the pass
  useEffect(() => {
    if (!token || !ticket || !restaurant || isSilentPreview || audioArmed || ticket.status === 'collected') return;
    const onFirstTouch = () => {
      void armLockScreenAudioKeepAlive({ cafeName: restaurant.name, ticketCode: ticket.ticketCode }).then(ok => {
        if (ok) void reportGuestAudioKeepAliveArmed(`pager:${token}`);
      });
    };
    window.addEventListener('pointerdown', onFirstTouch, { once: true, passive: true });
    window.addEventListener('keydown', onFirstTouch, { once: true });
    return () => {
      window.removeEventListener('pointerdown', onFirstTouch);
      window.removeEventListener('keydown', onFirstTouch);
    };
  }, [token, ticket?.ticketCode, ticket?.status, restaurant?.name, isSilentPreview, audioArmed]);

  useRealtimeStream(token ? `/api/public/stream/pager/${token}` : null, event => {
    void queryClient.invalidateQueries({ queryKey: ['/api/public/pager', token] });
    if (isSilentPreview) return;
    if (event.type === 'pager.acknowledged') {
      stopContinuousRinger(
        restaurant && ticket ? { cafeName: restaurant.name, ticketCode: ticket.ticketCode } : undefined,
      );
      return;
    }
    if (event.type === 'pager.buzzed' || event.data?.ticket?.status === 'ready') {
      startContinuousRinger({
        cafeName: restaurant?.name || 'Café',
        ticketCode: ticket?.ticketCode || event.data?.ticket?.ticketCode || 'READY',
        subtitle: readySubtitle,
      });
    }
  });

  const prevStatusKey = `${ticket?.status || ''}:${ticket?.buzzCount || 0}`;
  const [seenKey, setSeenKey] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!ticket || !restaurant || isSilentPreview) return;
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
  }, [ticket, restaurant, token, isSilentPreview]);

  useEffect(() => {
    if (!ticket || isSilentPreview) return;
    if (seenKey && seenKey !== prevStatusKey) {
      if (ticket.status === 'ready') {
        startContinuousRinger({
          cafeName: restaurant?.name || 'dingzi',
          ticketCode: ticket.ticketCode,
          subtitle: readySubtitle,
        });
      } else if (ticket.status === 'collected' || ticket.status === 'no_show') {
        stopContinuousRinger();
      }
    }
    setSeenKey(prevStatusKey);
  }, [prevStatusKey, seenKey, ticket, restaurant?.name, readySubtitle, isSilentPreview]);

  async function handleArmLockScreen() {
    if (!ticket || !restaurant) return;
    // Start audio keep-alive synchronously BEFORE awaiting Push permission so iOS Safari preserves user activation
    const audioPromise = preArmAudioOnUserGesture({ cafeName: restaurant.name, ticketCode: ticket.ticketCode });
    const subRes = await subscribeGuestLockScreenPush(`pager:${token}`);
    await audioPromise;
    setPushMode(subRes.mode);
    setPushNote(subRes.reason || '');
    void queryClient.invalidateQueries({ queryKey: ['/api/public/pager', token] });
  }

  function handleStopAndAcknowledge() {
    stopContinuousRinger(
      ticket && restaurant && ticket.status !== 'collected'
        ? { cafeName: restaurant.name, ticketCode: ticket.ticketCode }
        : undefined,
    );
    ackMutation.mutate();
  }

  const testPushMutation = useMutation({
    mutationFn: async () => {
      if (ticket && restaurant) {
        void preArmAudioOnUserGesture({ cafeName: restaurant.name, ticketCode: ticket.ticketCode });
      }
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
      saveGuestProfile({
        vehicleColor,
        vehicleType,
        ...(licensePlate.trim() ? { licensePlate } : {}),
      });
      const res = await apiRequest('POST', '/api/public/curbside/checkin', {
        trackingToken: token,
        bayId: bayId || ticket?.bayId,
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
      <div className="min-h-screen grid place-items-center bg-[#F6F5FC] text-[#17132E] p-6" role="status">
        <div className="text-center space-y-3">
          <DingziMark size={44} />
          <p className="font-semibold text-sm">Connecting to live virtual pager…</p>
        </div>
      </div>
    );
  }

  if (!ticket || !restaurant) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#F6F5FC] text-[#17132E] p-6">
        <div className="max-w-sm rounded-3xl border bg-white p-7 text-center space-y-4 shadow-sm">
          <DingziMark size={42} />
          <h1 className="text-xl font-bold">Pager not found</h1>
          <p className="text-muted-foreground text-sm">Scan the QR code from the counter or receipt again.</p>
          <Link href="/">
            <Button className="w-full cursor-pointer min-h-11 rounded-xl">Browse venues</Button>
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
  const elapsedMins = ticket.createdAt
    ? Math.max(0, Math.floor((nowMs - new Date(ticket.createdAt).getTime()) / 60_000))
    : 0;
  const orderLines: any[] = data.order?.lineItems || [];
  const doneCount = orderLines.filter(l => Boolean(l.prepared)).length;
  const isCurbsideContext =
    Boolean(ticket.bayId) ||
    data.order?.channel === 'curbside' ||
    data.order?.channel === 'drive_thru' ||
    curbsideExpanded;

  return (
    <div
      dir={dir}
      lang={language}
      style={{
        ...cafeThemeStyle(restaurant.theme, restaurant.brandAccentHex),
        paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))',
      }}
      className={`min-h-dvh bg-[#F6F5FC] text-[#17132E] transition-colors duration-300 ${
        isRinging ? 'ring-8 ring-inset ring-[#C8FF42]' : ''
      }`}
    >
      <div className="max-w-lg mx-auto px-4 space-y-4">
        <header className="flex items-center justify-between gap-3 py-1">
          <div className="flex items-center gap-3 min-w-0">
            <DingziMark size={40} />
            <div className="min-w-0">
              <h1 className="font-bold text-base sm:text-lg truncate leading-tight">
                {localizedEntityText(language, restaurant.name, restaurant.nameAr, label)}
              </h1>
              <p className="text-xs text-[#57507A] font-medium">
                <span className="lowercase font-display font-extrabold text-[#6236FF]" dir="ltr" lang="en">
                  dingzi
                </span>{' '}
                · {t('Virtual Pager')}
              </p>
            </div>
          </div>
          <MenuLanguageSwitch />
        </header>

        {/* Continuous Acknowledgeable Lock-Screen Alarm Banner — Volt Lime (#C8FF42) + Midnight Indigo (#17132E) 15.3:1 AAA */}
        {isRinging && (
          <div
            role="alert"
            className="rounded-3xl bg-[#C8FF42] text-[#17132E] p-5 shadow-xl space-y-3 border-2 border-[#17132E]"
          >
            <div className="flex items-center gap-3">
              <BellRing className="w-7 h-7 motion-safe:animate-bell-swing shrink-0 text-[#17132E]" aria-hidden="true" />
              <div>
                <strong className="block text-lg font-display font-extrabold leading-tight">
                  {t('Ding! Your food is ready.')} ({ticket.ticketCode})
                </strong>
                <span className="text-xs font-medium text-[#17132E]/85">
                  Show this screen at the pickup counter — tap below to silence alarm.
                </span>
              </div>
            </div>
            <Button
              type="button"
              data-testid="button-stop-ringing"
              onClick={handleStopAndAcknowledge}
              className="w-full min-h-14 rounded-2xl font-bold text-base bg-[#17132E] text-white hover:bg-[#241E42] cursor-pointer gap-2"
            >
              <BellOff className="w-5 h-5" aria-hidden="true" />
              <span>Stop Ringing · On My Way</span>
            </Button>
          </div>
        )}

        {/* Primary Live Telemetry Cockpit Card */}
        <section
          className={`rounded-3xl border-2 p-6 text-center shadow-lg transition-colors duration-300 ${
            isReady ? 'border-[#C8FF42] bg-[#17132E] text-white' : 'border-[#E5E2F2] bg-white'
          }`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                isReady ? 'bg-[#C8FF42] text-[#17132E]' : 'bg-[#EFEAFF] text-[#4B1FE0]'
              }`}
            >
              {isReady ? (
                <BellRing className="w-3.5 h-3.5 motion-safe:animate-pulse" aria-hidden="true" />
              ) : (
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>
                {isReady
                  ? t('Ready for Pickup!')
                  : isCollected
                    ? t('Order Collected')
                    : ticket.status === 'preparing'
                      ? t('Preparing Now')
                      : t('Waiting in Queue')}
              </span>
            </span>

            {!isCollected && (
              <span className={`text-xs font-mono ${isReady ? 'text-white/75' : 'text-[#57507A]'}`}>
                {elapsedMins === 0 ? 'Just now' : `${elapsedMins}m elapsed`}
              </span>
            )}
          </div>

          <div
            className={`text-6xl font-black tracking-tight my-2 font-mono ${
              isReady ? 'text-[#C8FF42]' : 'text-[#17132E]'
            }`}
            data-testid="text-pager-code"
          >
            {ticket.ticketCode}
          </div>

          {ticket.customerName && (
            <p className={`text-sm font-semibold ${isReady ? 'text-white/85' : 'text-[#57507A]'}`}>
              {ticket.customerName}
            </p>
          )}

          <div className="mt-1.5 flex justify-center">
            <span
              data-testid="badge-private-1to1-pager"
              className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                isReady ? 'text-white/75' : 'text-[#57507A]'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{language === 'ar' ? 'تنبيه خاص ١-لـ-١' : 'Private 1-to-1 alert'}</span>
            </span>
          </div>

          {!isReady && !isCollected && (
            <div className="mt-4 flex items-center justify-center gap-3 text-xs font-mono text-[#57507A]">
              <span>
                {t('Queue ahead')}: <strong className="text-[#17132E]">{data.queueAhead === 0 ? 'Next' : data.queueAhead}</strong>
              </span>
              <span>·</span>
              <span>
                {t('Est. prep')}:{' '}
                <strong className="text-[#17132E]">
                  ~{data.dynamicPrepMins ?? ticket.estimatedPrepMins}m
                </strong>
              </span>
            </div>
          )}

          {isReady && (
            <div className="mt-4 p-3.5 rounded-2xl bg-[#C8FF42] text-[#17132E] font-display font-extrabold text-sm">
              {readySubtitle} · {ticket.ticketCode}
              {ticket.acknowledgedAt && (
                <span className="block text-xs font-semibold text-[#17132E]/80 mt-0.5">
                  Counter notified — you are on your way
                </span>
              )}
            </div>
          )}

          <ol className="grid grid-cols-4 gap-1.5 sm:gap-2 mt-6 text-[11px] sm:text-xs">
            {steps.map((step, idx) => {
              const done = currentIdx >= idx;
              return (
                <li key={step.id} className="space-y-1.5 min-w-0">
                  <div
                    className={`h-2 rounded-full transition-colors ${
                      done ? (isReady ? 'bg-[#C8FF42]' : 'bg-[#6236FF]') : isReady ? 'bg-[#241E42]' : 'bg-[#E5E2F2]'
                    }`}
                  />
                  <span
                    className={`block leading-tight break-words ${
                      done
                        ? isReady
                          ? 'font-semibold text-white'
                          : 'font-semibold text-[#17132E]'
                        : isReady
                          ? 'text-white/60'
                          : 'text-[#57507A]'
                    }`}
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>

          {/* Integrated 1-Tap Sound & Lock-Screen Bar */}
          {!isCollected && (
            <div className="mt-5 pt-4 border-t border-current/10 flex flex-col min-[460px]:flex-row gap-2 text-start">
              <Button
                type="button"
                variant={alertsArmed ? 'secondary' : 'default'}
                className={`w-full min-[460px]:flex-1 min-w-0 min-h-12 rounded-2xl font-semibold cursor-pointer gap-2 ${
                  !alertsArmed && !isReady
                    ? 'bg-[#17132E] hover:bg-[#241E42] text-white'
                    : alertsArmed && isReady
                      ? 'bg-[#241E42] text-white hover:bg-[#312959] border border-white/15'
                      : ''
                }`}
                onClick={handleArmLockScreen}
                data-testid="button-enable-pager-alerts"
              >
                {alertsArmed ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" aria-hidden="true" />
                ) : (
                  <Bell className="w-5 h-5 shrink-0" aria-hidden="true" />
                )}
                <span className="truncate">
                  {alertsArmed ? 'Lock-Screen Ring Active' : 'Tap to Arm Lock-Screen Ring'}
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => testPushMutation.mutate()}
                disabled={testPushMutation.isPending}
                data-testid="button-test-pager-ring"
                className={`w-full min-[460px]:w-auto min-h-11 min-[460px]:min-h-12 px-4 rounded-2xl font-semibold cursor-pointer gap-1.5 shrink-0 ${
                  isReady ? 'border-white/25 bg-[#241E42] text-white hover:bg-[#312959]' : ''
                }`}
              >
                <Volume2 className="w-4 h-4" aria-hidden="true" />
                <span>Test Ring</span>
              </Button>
            </div>
          )}
          {!isCollected && (
            <p className={`text-[11px] mt-2 ${isReady ? 'text-white/75' : 'text-[#57507A]'}`}>
              {alertsArmed
                ? pushMode === 'web_push' || pushMode === 'native_push' || ticket.pushArmed
                  ? 'Push + Lock-Screen Speaker Keep-Alive active — safe to lock your phone.'
                  : pushNote || 'Lock-Screen Speaker Keep-Alive active — safe to lock your phone.'
                : 'Tap once before locking your phone so your speaker & vibration ring when ready.'}
            </p>
          )}
        </section>

        {/* Live Kitchen Order Receipt */}
        {data.order && (
          <section className="rounded-2xl border border-[#E5E2F2] bg-white p-4 space-y-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 font-semibold">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold">{data.order.orderNumber}</span>
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
              <span className="px-2.5 py-0.5 rounded-full text-xs bg-[#F6F5FC] border border-[#E5E2F2] font-mono">
                {data.order.paymentStatus === 'paid' ? 'Paid' : 'Pay at Venue'} · {data.order.total}{' '}
                {data.order.currency}
              </span>
            </div>

            {orderLines.length > 0 && (
              <div className="h-1.5 w-full rounded-full bg-[#F6F5FC] overflow-hidden">
                <div
                  className="h-full bg-[#6236FF] transition-all duration-300"
                  style={{ width: `${Math.round((doneCount / orderLines.length) * 100)}%` }}
                />
              </div>
            )}

            <ul className="divide-y divide-[#E5E2F2] text-xs text-[#57507A]">
              {orderLines.map((line: any, i: number) => (
                <li key={i} className="py-2 flex justify-between items-start gap-2">
                  <span className="inline-flex items-start gap-1.5">
                    {line.prepared && (
                      <CheckCircle2 className="w-4 h-4 text-[#6236FF] shrink-0 mt-0.5" aria-hidden="true" />
                    )}
                    <span>
                      <strong className="text-[#17132E]">
                        {line.quantity}× {label(line.name)}
                      </strong>
                      {line.variantLabel ? ` (${line.variantLabel})` : ''}
                      {line.modifiers?.length ? ` · ${line.modifiers.map((m: any) => m.label).join(', ')}` : ''}
                      {line.notes ? ` · “${line.notes}”` : ''}
                    </span>
                  </span>
                  <span className="font-mono font-semibold text-[#17132E] shrink-0">{line.lineTotal}</span>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="button-open-guest-branded-receipt"
              onClick={() => setReceiptDialogOpen(true)}
              className="w-full min-h-11 rounded-xl text-xs cursor-pointer gap-1.5 font-semibold"
            >
              <Receipt className="w-3.5 h-3.5 text-[#6236FF]" aria-hidden="true" />
              <span>{language === 'ar' ? 'عرض الفاتورة وتقسيم الحساب' : 'View Branded Receipt & Split Check'}</span>
            </Button>

            <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
              <DialogContent dir={dir} lang={language} className="max-w-md max-h-[90vh] overflow-y-auto rounded-3xl">
                <DialogTitle className="text-base font-bold">
                  {localizedEntityText(language, restaurant.name, restaurant.nameAr, label)} · {data.order.orderNumber}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {language === 'ar'
                    ? 'فاتورة رقمية رسمية مع إمكانية الطباعة أو الحفظ أو تقسيم الحساب.'
                    : 'Official digital brand receipt — split the check, print, or save.'}
                </DialogDescription>
                <BrandedReceiptSheet
                  venue={restaurant}
                  order={data.order}
                  ticketCode={ticket.ticketCode}
                  qrUrl={typeof window !== 'undefined' ? window.location.href : null}
                  qrCaption={`Pager ${ticket.ticketCode} · Live Status Pass`}
                  allowSplitCalculator
                />
              </DialogContent>
            </Dialog>
          </section>
        )}

        {/* Progressive-Disclosure Curbside / Drive-Thru Bay Arrival Check-in */}
        {restaurant.driveThruEnabled && !isCollected && data.bays?.length > 0 && (
          <section className="rounded-2xl border border-[#E5E2F2] bg-white p-4 space-y-3">
            {!isCurbsideContext ? (
              <button
                type="button"
                onClick={() => setCurbsideExpanded(true)}
                className="w-full min-h-11 flex items-center justify-between gap-3 text-start cursor-pointer"
              >
                <span className="inline-flex items-center gap-2.5 text-sm font-semibold text-[#17132E]">
                  <span className="w-9 h-9 rounded-xl bg-[#EFEAFF] text-[#6236FF] grid place-items-center shrink-0">
                    <Car className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <span>
                    <strong className="block text-sm">{t('Curbside & Drive-Thru')}</strong>
                    <small className="text-xs text-[#57507A] font-normal">
                      Parked outside? Check in your car so we bring it out.
                    </small>
                  </span>
                </span>
                <ChevronDown className="w-4 h-4 text-[#57507A] shrink-0" />
              </button>
            ) : (
              <>
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
                        <option key={b.id} value={b.id}>
                          {b.code} — {b.label}
                        </option>
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
                      {venueCfg.vehicleColors.map(c => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">{t('Vehicle Type')}</Label>
                    <select
                      className="manager-select w-full h-11 text-sm"
                      value={vehicleType}
                      onChange={e => setVehicleType(e.target.value)}
                    >
                      {venueCfg.vehicleTypes.map(v => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">{t('License Plate')}</Label>
                    <Input
                      value={licensePlate}
                      onChange={e => setLicensePlate(e.target.value)}
                      placeholder="QAT 48291"
                      className="h-11 rounded-xl font-mono uppercase"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 rounded-xl cursor-pointer"
                    disabled={!(bayId || ticket.bayId) || !licensePlate.trim() || checkinMutation.isPending}
                    onClick={() => checkinMutation.mutate('5_mins_away')}
                  >
                    {t('5 Mins Away')}
                  </Button>
                  <Button
                    type="button"
                    className="min-h-11 rounded-xl cursor-pointer gap-1.5"
                    disabled={!(bayId || ticket.bayId) || !licensePlate.trim() || checkinMutation.isPending}
                    onClick={() => checkinMutation.mutate('arrived')}
                  >
                    <MapPin className="w-4 h-4" aria-hidden="true" />
                    <span>{t("I'm Here — Check In")}</span>
                  </Button>
                </div>
              </>
            )}
          </section>
        )}

        {/* Post-Pickup Reputation Loop */}
        {(isCollected || isReady) && (
          <section className="rounded-2xl border border-[#E5E2F2] bg-white p-5 space-y-3 text-center">
            <h2 className="font-bold text-base">{t('Rate your experience')}</h2>
            {ticket.rating || feedbackSaved ? (
              <div className="space-y-3">
                <div className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-sm">
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  <span>Thank you for your {ticket.rating || rating}-star feedback!</span>
                </div>
                {(feedbackSaved?.googleMapsReviewUrl ||
                  ((ticket.rating || rating) >= venueCfg.reviewPromptMinStars && restaurant.googleMapsReviewUrl)) && (
                  <div>
                    <a
                      href={feedbackSaved?.googleMapsReviewUrl || restaurant.googleMapsReviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button className="w-full min-h-11 rounded-xl cursor-pointer gap-2">
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
                      className="w-11 h-11 rounded-xl border border-[#E5E2F2] grid place-items-center cursor-pointer transition-colors hover:bg-[#EFEAFF]/50"
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
                      className="rounded-xl"
                    />
                    <Button
                      type="button"
                      className="w-full min-h-11 rounded-xl cursor-pointer"
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
              <section className="rounded-2xl border border-[#E5E2F2] bg-white p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#4B1FE0]">
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t("Today's specials")}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {data.specials.map((item: any) => (
                    <div key={item.id} className="rounded-xl border border-[#E5E2F2] bg-[#F6F5FC] p-2.5 text-xs space-y-1">
                      <strong className="block truncate">
                        {localizedEntityText(language, item.name, item.nameAr, label)}
                      </strong>
                      <span className="font-mono text-[#57507A]">
                        {Number(item.price).toFixed(2)}{' '}
                        {formatCurrencyForLocale(restaurant.currency, language, venueCfg.currencySymbolAr)}
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
                    className="w-full min-h-11 rounded-2xl bg-white border-[#E5E2F2] cursor-pointer gap-2"
                    onClick={() => setShowGame(true)}
                  >
                    <Gamepad2 className="w-4 h-4 text-[#6236FF]" aria-hidden="true" />
                    <span>Play Barista Reflex Game while waiting</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        <PwaInstallBanner compact />

        <footer className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <Link href={`/menu/${restaurant.id}`}>
            <Button variant="ghost" className="cursor-pointer min-h-11 text-sm rounded-xl">
              Back to {label(restaurant.name)} Menu
            </Button>
          </Link>
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer min-h-11 text-xs rounded-xl bg-white border-[#E5E2F2]"
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
