import { useState } from 'react';
import { useRoute, Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Bell, BellRing, Check, Coffee, Users, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { cafeThemeStyle } from '@/lib/cafeTheme';
import { MenuLanguageProvider, MenuLanguageSwitch, useMenuLanguage } from '@/lib/menuLanguage';
import { playPagerReadyAlert, unlockGuestAlerts } from '@/lib/pagerAudio';
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
  const [alertsEnabled, setAlertsEnabled] = useState(false);

  const query = useQuery<any>({
    enabled: Boolean(token),
    queryKey: ['/api/public/waitlist-ticket', token],
    queryFn: async () => {
      const res = await fetch(`/api/public/waitlist-ticket/${token}`);
      if (!res.ok) throw new Error('Waitlist entry not found');
      return res.json();
    },
    refetchInterval: 5000,
  });

  const data = query.data;
  const entry = data?.entry;
  const restaurant = data?.restaurant;

  useRealtimeStream(token ? `/api/public/stream/waitlist/${token}` : null, ev => {
    void queryClient.invalidateQueries({ queryKey: ['/api/public/waitlist-ticket', token] });
    if (ev.type === 'waitlist.buzzed' || ev.data?.entry?.status === 'ready') {
      playPagerReadyAlert(restaurant?.name || 'Host Stand', 'Your table is ready — held for 10 minutes!');
    }
  });

  const respondMutation = useMutation({
    mutationFn: async (action: 'on_my_way' | 'release_spot') => {
      const res = await apiRequest('POST', `/api/public/waitlist-ticket/${token}/respond`, { action });
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/public/waitlist-ticket', token] });
    },
  });

  if (query.isLoading) {
    return <div className="min-h-screen grid place-items-center p-6">Loading waitlist pass…</div>;
  }
  if (!entry || !restaurant) {
    return <div className="min-h-screen grid place-items-center p-6">Waitlist pass not found.</div>;
  }

  const isReady = entry.status === 'ready';

  return (
    <div
      dir={dir}
      lang={language}
      style={cafeThemeStyle(restaurant.theme, restaurant.brandAccentHex)}
      className="min-h-screen bg-background text-foreground p-4"
    >
      <div className="max-w-md mx-auto py-6 space-y-5">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Coffee className="w-6 h-6 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold">{t('Walk-In Waitlist')}</p>
              <h1 className="font-bold">{label(restaurant.name)}</h1>
            </div>
          </div>
          <MenuLanguageSwitch />
        </header>

        <section
          className={`rounded-3xl border-2 p-6 text-center space-y-3 shadow-lg ${
            isReady ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' : 'bg-card'
          }`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
            {isReady ? <BellRing className="w-4 h-4 animate-bounce" /> : <Users className="w-4 h-4" />}
            {entry.status.toUpperCase()}
          </span>
          <div className="text-5xl font-black font-mono">{entry.ticketCode}</div>
          <p className="text-sm font-medium">
            {entry.guestName} · Party of {entry.partySize}
            {data.zone ? ` · ${data.zone.name}` : ''}
          </p>

          {entry.status === 'waiting' && (
            <p className="text-xs text-muted-foreground bg-muted rounded-xl py-2 px-3">
              Parties ahead of you: <strong>{data.partiesAhead}</strong>
            </p>
          )}

          {isReady && (
            <div className="p-3 rounded-2xl bg-emerald-600 text-white text-sm font-semibold">
              Your table is ready! Held for 10 minutes at the host stand.
            </div>
          )}

          {entry.guestResponse === 'on_my_way' && (
            <p className="text-xs font-semibold text-emerald-700">Host notified that you are on your way!</p>
          )}
        </section>

        {entry.status === 'waiting' || isReady ? (
          <>
            <Button
              type="button"
              variant={alertsEnabled ? 'secondary' : 'default'}
              className="w-full min-h-12 rounded-2xl cursor-pointer gap-2"
              onClick={async () => {
                await unlockGuestAlerts();
                setAlertsEnabled(true);
                playPagerReadyAlert(restaurant.name, 'Waitlist alerts active!');
              }}
            >
              <Bell className="w-4 h-4" />
              <span>{alertsEnabled ? t('Alerts Active — Phone will ring when ready') : t('Enable Sound & Vibration Alerts')}</span>
            </Button>

            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                className="min-h-11 cursor-pointer gap-1.5"
                disabled={respondMutation.isPending || entry.guestResponse === 'on_my_way'}
                onClick={() => respondMutation.mutate('on_my_way')}
              >
                <Check className="w-4 h-4" />
                {t('On My Way')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 cursor-pointer gap-1.5 text-destructive"
                disabled={respondMutation.isPending}
                onClick={() => respondMutation.mutate('release_spot')}
              >
                <XCircle className="w-4 h-4" />
                {t('Release Spot')}
              </Button>
            </div>
          </>
        ) : null}

        <div className="text-center">
          <Link href={`/menu/${restaurant.id}`}>
            <Button variant="ghost" className="cursor-pointer">Browse Menu While You Wait</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
