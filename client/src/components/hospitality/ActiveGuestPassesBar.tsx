import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, BellRing, CalendarCheck2, Clock, Users, X } from 'lucide-react';
import { dismissGuestPass, useSavedGuestPasses, type SavedGuestPass } from '@/lib/guestSession';
import { useMenuLanguage } from '@/lib/menuLanguage';

function SinglePassChip({ pass, showVenueName }: { pass: SavedGuestPass; showVenueName: boolean }) {
  const { t, label } = useMenuLanguage();

  const statusQuery = useQuery<any>({
    queryKey: ['/api/public/pass-live', pass.kind, pass.trackingToken],
    queryFn: async () => {
      const endpoint =
        pass.kind === 'pager'
          ? `/api/public/pager/${pass.trackingToken}`
          : pass.kind === 'waitlist'
            ? `/api/public/waitlist-ticket/${pass.trackingToken}`
            : `/api/public/booking/${pass.trackingToken}`;
      const res = await fetch(endpoint);
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: pass.kind === 'booking' ? 20_000 : 4_000,
  });

  const payload = statusQuery.data;
  if (statusQuery.isFetched && !payload) return null;

  const status =
    pass.kind === 'pager'
      ? payload?.ticket?.status
      : pass.kind === 'waitlist'
        ? payload?.entry?.status
        : payload?.reservation?.status;

  if (status && ['collected', 'no_show', 'cancelled', 'released', 'completed'].includes(status)) {
    return null;
  }

  const isReady = status === 'ready';
  const href =
    pass.kind === 'pager'
      ? `/pager/${pass.trackingToken}`
      : pass.kind === 'waitlist'
        ? `/waitlist/${pass.trackingToken}`
        : `/booking/${pass.trackingToken}`;

  const statusLabel =
    pass.kind === 'pager'
      ? isReady
        ? t('Ready for Pickup!')
        : status === 'preparing'
          ? t('Preparing Now')
          : t('Waiting in Queue')
      : pass.kind === 'waitlist'
        ? isReady
          ? t('Table Ready!')
          : t('In Waitlist')
        : t('Table Reserved');

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-2xl border px-3.5 py-2.5 shadow-sm flex items-center justify-between gap-2.5 transition-colors ${
        isReady
          ? 'bg-[#C8FF42] text-[#17132E] border-[#17132E]'
          : 'bg-[#17132E] text-white border-[#241E42]'
      }`}
    >
      <Link href={href} className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
        <span
          className={`w-8 h-8 rounded-xl grid place-items-center shrink-0 ${
            isReady ? 'bg-[#17132E] text-[#C8FF42]' : 'bg-[#6236FF] text-white'
          }`}
        >
          {pass.kind === 'pager' ? (
            isReady ? <BellRing className="w-4 h-4 animate-bounce" /> : <Clock className="w-4 h-4" />
          ) : pass.kind === 'waitlist' ? (
            <Users className="w-4 h-4" />
          ) : (
            <CalendarCheck2 className="w-4 h-4" />
          )}
        </span>
        <div className="min-w-0 text-xs">
          <div className="flex items-center gap-1.5 font-bold truncate">
            <span className="font-mono">{pass.code}</span>
            <span>·</span>
            <span>{statusLabel}</span>
          </div>
          {showVenueName && (
            <span className={`block truncate text-[11px] ${isReady ? 'text-[#17132E]/80' : 'text-white/70'}`}>
              {label(pass.restaurantName)}
            </span>
          )}
        </div>
        <span
          className={`ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-extrabold shrink-0 ${
            isReady ? 'bg-[#17132E] text-white' : 'bg-[#C8FF42] text-[#17132E]'
          }`}
        >
          <span>{t('Open')}</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </span>
      </Link>
      <button
        type="button"
        aria-label={t('Dismiss live pass')}
        onClick={() => dismissGuestPass(pass.kind, pass.trackingToken)}
        className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 cursor-pointer ${
          isReady ? 'hover:bg-[#17132E]/10 text-[#17132E]' : 'hover:bg-white/10 text-white/70'
        }`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function ActiveGuestPassesBar({ restaurantId }: { restaurantId?: string }) {
  const passes = useSavedGuestPasses(restaurantId);
  if (!passes.length) return null;

  return (
    <div className="space-y-2 my-2" data-testid="active-guest-passes-bar">
      {passes.slice(0, 3).map(pass => (
        <SinglePassChip
          key={`${pass.kind}:${pass.trackingToken}`}
          pass={pass}
          showVenueName={!restaurantId}
        />
      ))}
    </div>
  );
}
