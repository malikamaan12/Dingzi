import { useEffect, useRef, useState } from 'react';
import { Link, useRoute, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, QrCode, RefreshCw, UtensilsCrossed, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DingziWordmark } from '@/components/staff-brand';
import { saveGuestPass } from '@/lib/guestSession';
import { useRealtimeStream } from '@/lib/useRealtimeStream';
import { queryClient } from '@/lib/queryClient';
import { MenuLanguageProvider, MenuLanguageSwitch, useMenuLanguage } from '@/lib/menuLanguage';

function EntryShell({
  errorTitle,
  errorBody,
}: {
  errorTitle?: string;
  errorBody?: string;
}) {
  return (
    <div className="min-h-screen grid place-items-center bg-[#F6F5FC] text-[#17132E] p-6">
      <div className="max-w-sm w-full rounded-3xl border border-[#E5E2F2] bg-white p-8 text-center shadow-sm space-y-4">
        <div className="flex justify-center">
          <DingziWordmark tone="light" />
        </div>
        {errorTitle ? (
          <>
            <div className="w-12 h-12 rounded-2xl bg-[#EFEAFF] text-[#4B1FE0] grid place-items-center mx-auto">
              <QrCode className="w-6 h-6" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-bold">{errorTitle}</h1>
            <p className="text-sm text-[#57507A]">{errorBody}</p>
            <Link href="/">
              <Button className="w-full min-h-11 rounded-2xl cursor-pointer gap-2">
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                <span>Browse dingzi Venues</span>
              </Button>
            </Link>
          </>
        ) : (
          <p className="text-sm font-medium text-[#57507A] animate-pulse" role="status">
            Opening live venue experience…
          </p>
        )}
      </div>
    </div>
  );
}

export function VenueBySlugEntry() {
  const [, params] = useRoute('/v/:slug');
  const [, navigate] = useLocation();
  const slug = params?.slug || '';

  const query = useQuery<{ restaurant: { id: string } }>({
    enabled: Boolean(slug),
    queryKey: ['/api/public/venue-by-slug', slug],
    queryFn: async () => {
      const res = await fetch(`/api/public/venue-by-slug/${slug}`);
      if (!res.ok) throw new Error('Venue not found');
      return res.json();
    },
  });

  useEffect(() => {
    if (query.data?.restaurant?.id) {
      const search = window.location.search || '';
      navigate(`/menu/${query.data.restaurant.id}${search}`, { replace: true });
    }
  }, [query.data, navigate]);

  if (query.isError) {
    return (
      <EntryShell
        errorTitle="Venue Link Not Found"
        errorBody="This venue link may have changed or is currently offline. Explore active Dingzi venues below."
      />
    );
  }
  return <EntryShell />;
}

export function BayQrEntry() {
  const [, params] = useRoute('/bay/:token');
  const [, navigate] = useLocation();
  const token = params?.token || '';

  const query = useQuery<{ restaurant: { id: string; orderingMode?: string }; bay: { id: string; code: string } }>({
    enabled: Boolean(token),
    queryKey: ['/api/public/bay', token],
    queryFn: async () => {
      const res = await fetch(`/api/public/bay/${token}`);
      if (!res.ok) throw new Error('Bay QR not found');
      return res.json();
    },
  });

  useEffect(() => {
    if (query.data?.restaurant?.id && query.data?.bay?.id) {
      const actionParam = query.data.restaurant.orderingMode === 'browse_and_pager' ? '&action=curbside' : '';
      navigate(`/menu/${query.data.restaurant.id}?bay=${query.data.bay.id}${actionParam}`, { replace: true });
    }
  }, [query.data, navigate]);

  if (query.isError) {
    return (
      <EntryShell
        errorTitle="Parking Bay QR Not Found"
        errorBody="Please rescan the curbside or drive-thru signage QR code, or open the venue menu directly."
      />
    );
  }
  return <EntryShell />;
}

export function TableQrEntry() {
  const [, params] = useRoute('/table/:token');
  const [, navigate] = useLocation();
  const token = params?.token || '';

  const query = useQuery<{ restaurant: { id: string }; table: { id: string; tableCode: string } }>({
    enabled: Boolean(token),
    queryKey: ['/api/public/table', token],
    queryFn: async () => {
      const res = await fetch(`/api/public/table/${token}`);
      if (!res.ok) throw new Error('Table QR not found');
      return res.json();
    },
  });

  useEffect(() => {
    if (query.data?.restaurant?.id && query.data?.table?.tableCode) {
      navigate(
        `/menu/${query.data.restaurant.id}?table=${encodeURIComponent(query.data.table.tableCode)}`,
        { replace: true },
      );
    }
  }, [query.data, navigate]);

  if (query.isError) {
    return (
      <EntryShell
        errorTitle="Table QR Not Found"
        errorBody="This table QR code is inactive. Please scan the venue menu QR or ask a team member."
      />
    );
  }
  return <EntryShell />;
}

interface SmartTagPayload {
  destination: string | null;
  coasterStatus: 'idle' | 'assigned' | null;
  tag: {
    id: string;
    token: string;
    tagCode: string;
    label: string;
    targetType: string;
  };
  restaurant: {
    id: string;
    name: string;
    slug?: string | null;
  };
  ticket?: {
    id: string;
    ticketCode: string;
    status: string;
    trackingToken: string;
  } | null;
}

export function SmartTagEntry() {
  return (
    <MenuLanguageProvider>
      <SmartTagEntryContent />
    </MenuLanguageProvider>
  );
}

function SmartTagEntryContent() {
  const [, params] = useRoute('/tag/:token');
  const [, navigate] = useLocation();
  const { language, dir, t, label } = useMenuLanguage();
  const token = params?.token || '';
  const initialSrc =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('src') === 'nfc'
      ? 'nfc'
      : 'qr';
  const countedInitialRef = useRef(false);
  const [standbySecsLeft, setStandbySecsLeft] = useState(180);
  const pairingArmed = standbySecsLeft > 0;

  const query = useQuery<SmartTagPayload>({
    enabled: Boolean(token),
    queryKey: ['/api/public/tag', token],
    queryFn: async () => {
      const srcParam = countedInitialRef.current ? 'poll' : initialSrc;
      countedInitialRef.current = true;
      const res = await fetch(`/api/public/tag/${token}?src=${srcParam}`);
      if (!res.ok) throw new Error('Smart QR/NFC tag not found');
      return res.json();
    },
    refetchInterval: q => (q.state.data?.coasterStatus === 'idle' && pairingArmed ? 3500 : false),
  });

  useEffect(() => {
    if (query.data?.coasterStatus !== 'idle' || !pairingArmed) return;
    const id = window.setInterval(() => {
      setStandbySecsLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [query.data?.coasterStatus, pairingArmed]);

  useRealtimeStream(
    query.data?.coasterStatus === 'idle' && pairingArmed ? `/api/public/stream/coaster/${token}` : null,
    async () => {
      try {
        const res = await fetch(`/api/public/tag/${token}?src=poll`);
        if (res.ok) {
          const fresh = (await res.json()) as SmartTagPayload;
          queryClient.setQueryData(['/api/public/tag', token], fresh);
        }
      } catch {}
    },
  );

  useEffect(() => {
    const data = query.data;
    if (!data) return;
    if (data.coasterStatus === 'assigned' && data.ticket?.trackingToken) {
      saveGuestPass({
        kind: 'pager',
        trackingToken: data.ticket.trackingToken,
        code: data.ticket.ticketCode,
        restaurantId: data.restaurant.id,
        restaurantName: data.restaurant.name,
      });
      navigate(`/pager/${data.ticket.trackingToken}`, { replace: true });
      return;
    }
    if (data.destination) {
      navigate(data.destination, { replace: true });
    }
  }, [query.data, navigate]);

  if (query.isError) {
    return (
      <EntryShell
        errorTitle="Smart QR / NFC Tag Inactive"
        errorBody="This QR plaque or NFC coaster is not currently active. Scan the venue menu QR or ask a team member."
      />
    );
  }

  if (query.data?.coasterStatus === 'idle') {
    const { restaurant, tag } = query.data;
    return (
      <div
        dir={dir}
        lang={language}
        className="min-h-dvh bg-[#17132E] text-white flex flex-col justify-between p-5 sm:p-8"
      >
        <header className="max-w-md w-full mx-auto flex items-center justify-between gap-3">
          <DingziWordmark tone="dark" />
          <MenuLanguageSwitch />
        </header>

        <main className="max-w-md w-full mx-auto my-8 rounded-3xl border border-white/15 bg-[#241E42] p-6 sm:p-8 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-[#EFEAFF] text-[#4B1FE0] grid place-items-center mx-auto">
            <Wifi className="w-8 h-8 rotate-90 motion-safe:animate-pulse" aria-hidden="true" />
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#C8FF42] text-[#17132E] font-mono text-xs font-extrabold">
            <span>{tag.tagCode}</span>
            <span>·</span>
            <span>{label(restaurant.name)}</span>
          </div>

          <div className="space-y-2" role="status" aria-live="polite">
            <h1 className="text-2xl font-display font-extrabold text-white" data-testid="text-coaster-standby-title">
              {pairingArmed ? t('Smart Pager Coaster Ready') : t('Coaster Pairing Paused')}
            </h1>
            <p className="text-sm text-white/80 leading-relaxed">
              {pairingArmed
                ? t('Keep this screen open — it connects automatically the moment the barista links your order, or explore the menu below.')
                : t('Standby timed out so another guest’s future order never rings your phone. Tap reconnect below if you are still at the counter.')}
            </p>
            {pairingArmed && (
              <p className="text-xs font-mono text-[#C8FF42]">
                1-to-1 counter pairing active ({Math.floor(standbySecsLeft / 60)}:{String(standbySecsLeft % 60).padStart(2, '0')})
              </p>
            )}
          </div>

          {!pairingArmed && (
            <Button
              type="button"
              onClick={() => {
                setStandbySecsLeft(180);
                void query.refetch();
              }}
              className="w-full min-h-12 rounded-2xl bg-[#C8FF42] text-[#17132E] hover:bg-[#b8f230] font-extrabold cursor-pointer gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reconnect Coaster Pairing</span>
            </Button>
          )}

          <Link href={`/menu/${restaurant.id}`}>
            <Button
              type="button"
              data-testid="button-coaster-open-menu"
              className="w-full min-h-12 rounded-2xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer gap-2 mt-2"
            >
              <UtensilsCrossed className="w-4 h-4" />
              <span>{t('Explore the menu')}</span>
            </Button>
          </Link>
        </main>

        <footer className="max-w-md w-full mx-auto text-center text-xs text-white/60">
          <span className="lowercase font-display font-bold text-white/80" dir="ltr" lang="en">dingzi</span> · Contactless NFC &amp; QR Hospitality Pass
        </footer>
      </div>
    );
  }

  return <EntryShell />;
}
