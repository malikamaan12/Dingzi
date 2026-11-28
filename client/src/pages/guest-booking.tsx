import { useEffect, useState } from 'react';
import { useRoute, Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  CalendarCheck2,
  CalendarPlus,
  Clock,
  CreditCard,
  MapPin,
  Phone,
  Share2,
  Users,
  UtensilsCrossed,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { cafeThemeStyle } from '@/lib/cafeTheme';
import { buildReservationIcsFile, dismissGuestPass, saveGuestPass } from '@/lib/guestSession';
import { localizedEntityText, MenuLanguageProvider, MenuLanguageSwitch, useMenuLanguage } from '@/lib/menuLanguage';
import { PwaInstallBanner } from '@/components/mobile/PwaInstallBanner';
import { DingziMark } from '@/components/staff-brand';

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
  const [confirmCancel, setConfirmCancel] = useState(false);

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
      setConfirmCancel(false);
      dismissGuestPass('booking', token);
      void queryClient.invalidateQueries({ queryKey: ['/api/public/booking', token] });
    },
  });

  const data = query.data;
  const reservation = data?.reservation;
  const table = data?.table;
  const combinedTables: any[] = data?.combinedTables || [];
  const zone = data?.zone;
  const restaurant = data?.restaurant;
  const pendingDepositCheckout = data?.pendingDepositCheckout;
  const tableDisplayLabel =
    combinedTables.length > 1
      ? `Tables ${combinedTables.map(tb => tb.tableCode).join(' + ')}`
      : table?.tableCode
        ? `Table ${table.tableCode}`
        : 'Reserved';

  const confirmDepositMutation = useMutation({
    mutationFn: async () => {
      if (!pendingDepositCheckout || !reservation) return;
      const res = await apiRequest(
        'POST',
        `/api/public/reservations/${reservation.id}/confirm-deposit`,
        {
          provider: pendingDepositCheckout.provider,
          paymentReference: pendingDepositCheckout.paymentReference,
          signatureToken: pendingDepositCheckout.signatureToken,
        },
      );
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/public/booking', token] });
    },
  });

  useEffect(() => {
    if (!reservation || !restaurant) return;
    if (
      reservation.status === 'confirmed' ||
      reservation.status === 'seated' ||
      reservation.status === 'pending_deposit'
    ) {
      saveGuestPass({
        kind: 'booking',
        trackingToken: token,
        code: tableDisplayLabel,
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        startAt: reservation.startAt,
      });
    } else {
      dismissGuestPass('booking', token);
    }
  }, [reservation, restaurant, tableDisplayLabel, token]);

  if (query.isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#F6F5FC] text-[#17132E] p-6" role="status">
        Loading reservation…
      </div>
    );
  }
  if (!reservation || !restaurant) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#F6F5FC] text-[#17132E] p-6">
        Reservation not found.
      </div>
    );
  }

  const start = new Date(reservation.startAt);
  const isConfirmed = reservation.status === 'confirmed';
  const venueDisplayName = localizedEntityText(language, restaurant.name, restaurant.nameAr, label);

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
      className="min-h-dvh bg-[#F6F5FC] text-[#17132E] p-4"
    >
      <div className="max-w-md mx-auto py-3 space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <DingziMark size={38} />
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate leading-tight">{venueDisplayName}</h1>
              <p className="text-xs text-[#57507A] font-medium">
                <span className="lowercase font-display font-extrabold text-[#6236FF]" dir="ltr" lang="en">
                  dingzi
                </span>{' '}
                · {t('Table Reservation')}
              </p>
            </div>
          </div>
          <MenuLanguageSwitch />
        </header>

        {/* Apple-Wallet Style Hospitality Pass */}
        <section
          className="rounded-3xl border border-[#E5E2F2] bg-white overflow-hidden shadow-lg"
          role="status"
          aria-live="polite"
        >
          <div className="bg-[#17132E] text-white p-5 flex items-center justify-between gap-3">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-extrabold uppercase px-3 py-1 rounded-full ${
                isConfirmed ? 'bg-[#C8FF42] text-[#17132E]' : 'bg-[#EFEAFF] text-[#4B1FE0]'
              }`}
            >
              <CalendarCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{reservation.status.replace('_', ' ')}</span>
            </span>
            <span className="font-mono font-extrabold text-sm px-3 py-1 rounded-xl bg-[#241E42] text-[#C8FF42]">
              {tableDisplayLabel}
            </span>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <span className="text-xs text-[#57507A] block">Reserved for</span>
              <strong className="text-xl font-bold block">{reservation.guestName}</strong>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="rounded-2xl bg-[#F6F5FC] border border-[#E5E2F2] p-3 space-y-0.5">
                <span className="text-[#57507A] flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[#6236FF]" aria-hidden="true" />
                  <span>Date &amp; Time</span>
                </span>
                <strong className="block text-sm font-mono text-[#17132E]">
                  {start.toLocaleString(language === 'ar' ? 'ar-QA' : 'en-GB', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </strong>
              </div>

              <div className="rounded-2xl bg-[#F6F5FC] border border-[#E5E2F2] p-3 space-y-0.5">
                <span className="text-[#57507A] flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-[#6236FF]" aria-hidden="true" />
                  <span>Party &amp; Zone</span>
                </span>
                <strong className="block text-sm text-[#17132E] truncate">
                  {reservation.partySize} Guests
                  {zone ? ` · ${language === 'ar' && zone.nameAr ? zone.nameAr : zone.name}` : ''}
                </strong>
              </div>
            </div>

            {restaurant.address && (
              <p className="flex items-center gap-2 text-xs text-[#57507A]">
                <MapPin className="w-4 h-4 text-[#6236FF] shrink-0" aria-hidden="true" />
                <span>{restaurant.address}</span>
              </p>
            )}

            {reservation.notes && (
              <p className="text-xs rounded-xl bg-[#F6F5FC] border border-[#E5E2F2] px-3 py-2 text-[#57507A]">
                “{reservation.notes}”
              </p>
            )}

            {reservation.status === 'pending_deposit' && pendingDepositCheckout && (
              <div className="rounded-2xl border-2 border-[#6236FF]/30 bg-[#EFEAFF]/70 p-4 space-y-2.5">
                <p className="text-xs font-semibold text-[#4B1FE0]">
                  Complete your {reservation.depositAmount} {restaurant.currency} deposit to confirm {tableDisplayLabel}.
                </p>
                <Button
                  type="button"
                  onClick={() => confirmDepositMutation.mutate()}
                  disabled={confirmDepositMutation.isPending}
                  className="w-full min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white cursor-pointer gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>
                    {confirmDepositMutation.isPending
                      ? 'Verifying Deposit…'
                      : `Pay ${reservation.depositAmount} ${restaurant.currency} Deposit`}
                  </span>
                </Button>
              </div>
            )}

            <Link href={`/menu/${restaurant.id}`}>
              <Button className="w-full min-h-12 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer gap-2">
                <UtensilsCrossed className="w-4 h-4" />
                <span>Explore {venueDisplayName} Menu</span>
              </Button>
            </Link>

            {isConfirmed && (
              <div className="grid grid-cols-2 gap-2 pt-1">
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
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full min-h-11 rounded-xl cursor-pointer gap-1.5 text-xs"
                    >
                      <MapPin className="w-4 h-4 text-[#6236FF]" aria-hidden="true" />
                      <span>{t('Directions')}</span>
                    </Button>
                  </a>
                )}
                {restaurant.phone && (
                  <a href={`tel:${restaurant.phone}`} className="flex-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full min-h-11 rounded-xl cursor-pointer gap-1.5 text-xs"
                    >
                      <Phone className="w-4 h-4 text-[#6236FF]" aria-hidden="true" />
                      <span>{t('Call café')}</span>
                    </Button>
                  </a>
                )}
              </div>
            )}

            {(isConfirmed || reservation.status === 'pending_deposit') && (
              <div className="pt-2 border-t border-[#E5E2F2]">
                {!confirmCancel ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full min-h-11 rounded-xl text-destructive hover:text-destructive cursor-pointer gap-2 text-xs"
                    onClick={() => setConfirmCancel(true)}
                  >
                    <XCircle className="w-4 h-4" aria-hidden="true" />
                    <span>{t('Cancel Reservation')}</span>
                  </Button>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 rounded-xl cursor-pointer text-xs"
                      onClick={() => setConfirmCancel(false)}
                    >
                      Keep Table
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      className="min-h-11 rounded-xl cursor-pointer text-xs"
                      disabled={cancelMutation.isPending}
                      onClick={() => cancelMutation.mutate()}
                    >
                      {cancelMutation.isPending ? 'Cancelling…' : 'Confirm Cancel'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <PwaInstallBanner compact />
      </div>
    </div>
  );
}
