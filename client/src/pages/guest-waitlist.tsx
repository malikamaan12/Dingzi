import { useEffect, useState } from 'react';
import { useRoute, Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Bell, BellOff, BellRing, Check, ShieldCheck, Users, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { cafeThemeStyle } from '@/lib/cafeTheme';
import { localizedEntityText, MenuLanguageProvider, MenuLanguageSwitch, useMenuLanguage } from '@/lib/menuLanguage';
import { resolveVenueConfig } from '@shared/venueConfig';
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

export default function GuestWaitlistPage() {
  return (
    <MenuLanguageProvider>
      <GuestWaitlistContent />
    </MenuLanguageProvider>
  );
}

function GuestWaitlistContent() {
  const [, params] = useRoute('/waitlist/:token');
  const token = params?.token || '';
  const { language, dir, t, label } = useMenuLanguage();
  const [alertsArmed, setAlertsArmed] = useState(false);
  const [isRinging, setIsRinging] = useState(false);

  useEffect(() => subscribeRingingState(setIsRinging), []);

  const query = useQuery<any>({
    enabled: Boolean(token),
    queryKey: ['/api/public/waitlist-ticket', token],
    queryFn: async () => {
      const res = await fetch(`/api/public/waitlist-ticket/${token}`);
      if (!res.ok) throw new Error('Waitlist entry not found');
      return res.json();
    },
    refetchInterval: 4000,
  });

  const data = query.data;
  const entry = data?.entry;
  const restaurant = data?.restaurant;
  const venueCfg = resolveVenueConfig(restaurant?.venueConfig);
  const readyBannerText = (language === 'ar' ? venueCfg.waitlistReadySubtitleAr : venueCfg.waitlistReadySubtitle).replace(
    '{mins}',
    String(venueCfg.waitlistHoldMins),
  );

  useEffect(() => {
    if (!entry || !restaurant) return;
    if (['waiting', 'ready'].includes(entry.status)) {
      saveGuestPass({
        kind: 'waitlist',
        trackingToken: token,
        code: entry.ticketCode,
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
      });
    } else {
      dismissGuestPass('waitlist', token);
    }
  }, [entry, restaurant, token]);

  useRealtimeStream(token ? `/api/public/stream/waitlist/${token}` : null, ev => {
    void queryClient.invalidateQueries({ queryKey: ['/api/public/waitlist-ticket', token] });
    if (ev.type === 'waitlist.buzzed' || ev.data?.entry?.status === 'ready') {
      startContinuousRinger({
        cafeName: restaurant?.name || 'Host Stand',
        ticketCode: entry?.ticketCode || 'TABLE',
        subtitle: readyBannerText,
      });
    }
  });

  const respondMutation = useMutation({
    mutationFn: async (action: 'on_my_way' | 'release_spot') => {
      stopContinuousRinger();
      const res = await apiRequest('POST', `/api/public/waitlist-ticket/${token}/respond`, { action });
      return res.json();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['/api/public/waitlist-ticket', token] }),
  });

  if (query.isLoading) return <div className="min-h-screen grid place-items-center p-6">Loading waitlist pass…</div>;
  if (!entry || !restaurant) return <div className="min-h-screen grid place-items-center p-6">Waitlist pass not found.</div>;

  const isReady = entry.status === 'ready';

  return (
    <div
      dir={dir}
      lang={language}
      style={{
        ...cafeThemeStyle(restaurant.theme, restaurant.brandAccentHex),
        paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))',
      }}
      className="min-h-screen bg-background text-foreground px-4"
    >
      <div className="max-w-md mx-auto py-4 space-y-4">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <DingziMark size={38} />
            <div>
              <p className="text-xs text-muted-foreground font-semibold">
                <span className="lowercase font-display font-extrabold text-[#6236FF]" dir="ltr" lang="en">dingzi</span> · {t('Walk-In Waitlist')}
              </p>
              <h1 className="font-bold">{localizedEntityText(language, restaurant.name, restaurant.nameAr, label)}</h1>
            </div>
          </div>
          <MenuLanguageSwitch />
        </header>

        <PwaInstallBanner compact />

        {isRinging && (
          <div role="alert" className="rounded-3xl bg-[#C8FF42] text-[#17132E] border-2 border-[#17132E] p-5 shadow-xl space-y-3">
            <div className="flex items-center gap-2.5">
              <BellRing className="w-6 h-6 motion-safe:animate-pulse text-[#17132E]" aria-hidden="true" />
              <strong className="text-base font-extrabold">Table Ready! ({entry.ticketCode})</strong>
            </div>
            <Button
              type="button"
              onClick={() => stopContinuousRinger()}
              className="w-full min-h-12 rounded-2xl font-bold bg-[#17132E] text-white hover:bg-[#241E42] cursor-pointer gap-2"
            >
              <BellOff className="w-4 h-4" aria-hidden="true" />
              Stop Ringing
            </Button>
          </div>
        )}

        <section
          className={`rounded-3xl border-2 p-6 text-center space-y-3 shadow-lg ${
            isReady ? 'border-[#C8FF42] bg-[#17132E] text-white' : 'bg-card'
          }`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
              isReady ? 'bg-[#C8FF42] text-[#17132E]' : 'bg-[#EFEAFF] text-[#4B1FE0]'
            }`}
          >
            {isReady ? <BellRing className="w-4 h-4 motion-safe:animate-pulse" aria-hidden="true" /> : <Users className="w-4 h-4" aria-hidden="true" />}
            {entry.status.toUpperCase()}
          </span>
          <div className={`text-5xl font-black font-mono ${isReady ? 'text-[#C8FF42]' : ''}`}>{entry.ticketCode}</div>
          <p className="text-sm font-medium">
            {entry.guestName} · Party of {entry.partySize}
            {data.zone ? ` · ${language === 'ar' && data.zone.nameAr ? data.zone.nameAr : data.zone.name}` : ''}
          </p>

          {entry.status === 'waiting' && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#57507A]">
                {t('Skip the crowd. Your table will ding you.')}
              </p>
              <p className="text-xs text-muted-foreground bg-muted rounded-xl py-2 px-3 font-mono">
                {t('Parties ahead of you')}: <strong>{data.partiesAhead}</strong>
              </p>
            </div>
          )}

          {isReady && (
            <div className="p-3 rounded-2xl bg-[#C8FF42] text-[#17132E] text-sm font-extrabold">
              {readyBannerText}
            </div>
          )}

          {entry.guestResponse === 'on_my_way' && (
            <p className={`text-xs font-semibold ${isReady ? 'text-[#C8FF42]' : 'text-[#4B1FE0]'}`}>Host notified that you are on your way!</p>
          )}
        </section>

        {entry.status === 'waiting' || isReady ? (
          <>
            <Button
              type="button"
              variant={alertsArmed ? 'secondary' : 'default'}
              className="w-full min-h-12 rounded-2xl cursor-pointer gap-2 font-semibold"
              onClick={async () => {
                await armLockScreenAudioKeepAlive({ cafeName: restaurant.name, ticketCode: entry.ticketCode });
                await subscribeGuestLockScreenPush(`waitlist:${token}`);
                setAlertsArmed(true);
              }}
            >
              {alertsArmed ? <ShieldCheck className="w-5 h-5 text-emerald-600" aria-hidden="true" /> : <Bell className="w-5 h-5" aria-hidden="true" />}
              <span>{alertsArmed ? 'Lock-Screen Push & Ringer Armed' : 'Arm Lock-Screen Ringing & Push'}</span>
            </Button>

            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                className="min-h-12 cursor-pointer gap-1.5"
                disabled={respondMutation.isPending || entry.guestResponse === 'on_my_way'}
                onClick={() => respondMutation.mutate('on_my_way')}
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                {t('On My Way')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-12 cursor-pointer gap-1.5 text-destructive"
                disabled={respondMutation.isPending}
                onClick={() => respondMutation.mutate('release_spot')}
              >
                <XCircle className="w-4 h-4" aria-hidden="true" />
                {t('Release Spot')}
              </Button>
            </div>
          </>
        ) : null}

        <div className="text-center">
          <Link href={`/menu/${restaurant.id}`}>
            <Button variant="ghost" className="cursor-pointer min-h-11">Browse Menu While You Wait</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
