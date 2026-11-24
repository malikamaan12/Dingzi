import { useEffect, useState } from 'react';
import { useRoute, Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  CalendarCheck2,
  CalendarPlus,
  Clock,
  MapPin,
  Phone,
  Share2,
  Users,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { cafeThemeStyle } from '@/lib/cafeTheme';
import { buildReservationIcsFile, dismissGuestPass, saveGuestPass } from '@/lib/guestSession';
import { MenuLanguageProvider, MenuLanguageSwitch, useMenuLanguage } from '@/lib/menuLanguage';
import { PwaInstallBanner } from '@/components/mobile/PwaInstallBanner';

export default function GuestBookingPage() {
  return (
    <MenuLanguageProvider>
      <GuestBookingContent />
    </MenuLanguageProvider>
  );
}

function GuestBookingContent() {
  const [, params] = useRoute('/booking/:token');
  const token = params?.token || '';
  const { language, dir, t, label } = useMenuLanguage();
  const [copied, setCopied] = useState(false);

  const query = useQuery<any>({
    enabled: Boolean(token),
    queryKey: ['/api/public/booking', token],
    queryFn: async () => {
      const res = await fetch(`/api/public/booking/${token}`);
      if (!res.ok) throw new Error('Reservation not found');
      return res.json();
    },
    refetchInterval: 15_000,
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/public/booking/${token}/cancel`, {});
      return res.json();
    },
    onSuccess: () => {
      dismissGuestPass('booking', token);
      void queryClient.invalidateQueries({ queryKey: ['/api/public/booking', token] });
    },
  });

  const data = query.data;
  const reservation = data?.reservation;
  const table = data?.table;
  const zone = data?.zone;
  const restaurant = data?.restaurant;

  useEffect(() => {
    if (!reservation || !restaurant) return;
    if (reservation.status === 'confirmed' || reservation.status === 'seated') {
      saveGuestPass({
        kind: 'booking',
        trackingToken: token,
        code: table?.tableCode ? `Table ${table.tableCode}` : 'Reserved',
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        startAt: reservation.startAt,
      });
    } else {
      dismissGuestPass('booking', token);
    }
  }, [reservation, restaurant, table?.tableCode, token]);

  if (query.isLoading) {
    return <div className="min-h-screen grid place-items-center bg-[#F6F5FC] text-[#17132E] p-6">Loading reservation…</div>;
  }
  if (!reservation || !restaurant) {
    return <div className="min-h-screen grid place-items-center bg-[#F6F5FC] text-[#17132E] p-6">Reservation not found.</div>;
  }

  const start = new Date(reservation.startAt);
  const isConfirmed = reservation.status === 'confirmed';

  function handleDownloadIcs() {
    const ics = buildReservationIcsFile({
      restaurantName: restaurant.name,
      address: restaurant.address,
      tableCode: table?.tableCode,
      partySize: reservation.partySize,
      startAtIso: reservation.startAt,
      endAtIso: reservation.endAt,
      bookingUrl: window.location.href,
    });
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dingzi-reservation-${table?.tableCode || 'table'}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      dir={dir}
      lang={language}
      style={{
        ...cafeThemeStyle(restaurant.theme, restaurant.brandAccentHex),
        paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))',
      }}
      className="min-h-screen bg-background text-foreground p-4"
    >
      <div className="max-w-md mx-auto py-4 space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase font-semibold text-muted-foreground">Dingzi · {t('Table Reservation')}</p>
            <h1 className="text-xl font-bold">{label(restaurant.name)}</h1>
          </div>
          <MenuLanguageSwitch />
        </header>

        <PwaInstallBanner compact />

        <section className="rounded-3xl border bg-card p-6 shadow-md space-y-4" role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase px-3 py-1 rounded-full ${
                isConfirmed ? 'bg-[#C8FF42] text-[#17132E]' : 'bg-[#EFEAFF] text-[#4B1FE0]'
              }`}
            >
              <CalendarCheck2 className="w-4 h-4" aria-hidden="true" />
              {reservation.status}
            </span>
            {table && <span className="font-mono font-bold text-sm px-2.5 py-1 rounded-lg bg-muted">Table {table.tableCode}</span>}
          </div>

          <div className="space-y-2.5 text-sm">
            <p className="text-lg font-bold">{reservation.guestName}</p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
              <span>{start.toLocaleString(language === 'ar' ? 'ar-QA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <Users className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
              <span>
                Party of {reservation.partySize}
                {zone ? ` · ${language === 'ar' && zone.nameAr ? zone.nameAr : zone.name}` : ''}
              </span>
            </p>
            {restaurant.address && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                <span>{restaurant.address}</span>
              </p>
            )}
            {reservation.notes && (
              <p className="text-xs rounded-xl bg-muted px-3 py-2 text-muted-foreground">“{reservation.notes}”</p>
            )}
          </div>

          {isConfirmed && (
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                data-testid="button-booking-ics"
                onClick={handleDownloadIcs}
                className="min-h-11 rounded-xl cursor-pointer gap-1.5 text-xs font-semibold"
              >
                <CalendarPlus className="w-4 h-4" aria-hidden="true" />
                <span>{t('Add to Calendar (.ics)')}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.href);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {}
                }}
                className="min-h-11 rounded-xl cursor-pointer gap-1.5 text-xs font-semibold"
              >
                <Share2 className="w-4 h-4" aria-hidden="true" />
                <span>{copied ? t('Pass link copied!') : t('Share Pass')}</span>
              </Button>
            </div>
          )}

          {(restaurant.address || restaurant.phone) && (
            <div className="flex flex-wrap gap-2">
              {restaurant.address && (
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(restaurant.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1"
                >
                  <Button type="button" variant="outline" className="w-full min-h-11 rounded-xl cursor-pointer gap-1.5 text-xs">
                    <MapPin className="w-4 h-4 text-primary" aria-hidden="true" />
                    <span>{t('Directions')}</span>
                  </Button>
                </a>
              )}
              {restaurant.phone && (
                <a href={`tel:${restaurant.phone}`} className="flex-1">
                  <Button type="button" variant="outline" className="w-full min-h-11 rounded-xl cursor-pointer gap-1.5 text-xs">
                    <Phone className="w-4 h-4 text-primary" aria-hidden="true" />
                    <span>{t('Call café')}</span>
                  </Button>
                </a>
              )}
            </div>
          )}

          {isConfirmed && (
            <Button
              type="button"
              variant="outline"
              className="w-full min-h-11 rounded-xl text-destructive cursor-pointer gap-2"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              <XCircle className="w-4 h-4" aria-hidden="true" />
              {t('Cancel Reservation')}
            </Button>
          )}
        </section>

        <div className="text-center">
          <Link href={`/menu/${restaurant.id}`}>
            <Button variant="ghost" className="cursor-pointer min-h-11">
              Explore {label(restaurant.name)} Menu
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
