import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, BellRing, CalendarCheck2, Clock, Sparkles, UtensilsCrossed, Users, X } from 'lucide-react';
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
        ? t('Ding! Your food is ready.')
        : status === 'preparing'
          ? t('Preparing Now')
          : t('Waiting in Queue')
      : pass.kind === 'waitlist'
        ? isReady
          ? t('Table Ready!')
          : t('In Waitlist')
        : t('Table Reserved');

  const queueAhead =
    pass.kind === 'pager'
      ? typeof payload?.queueAhead === 'number'
        ? payload.queueAhead
        : null
      : pass.kind === 'waitlist'
        ? typeof payload?.partiesAhead === 'number'
          ? payload.partiesAhead
          : null
        : null;

  const orderLines = Array.isArray(payload?.order?.items) ? payload.order.items : [];
  const preparedLines = orderLines.filter((l: any) => l?.prepared).length;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-2xl border px-3.5 py-3 shadow-sm flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 transition-colors ${
        isReady
          ? 'bg-[#C8FF42] text-[#17132E] border-[#17132E]'
          : 'bg-[#17132E] text-white border-[#241E42]'
      }`}
    >
      <Link href={href} className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer">
        <span
          className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${
            isReady ? 'bg-[#17132E] text-[#C8FF42]' : 'bg-[#6236FF] text-white'
          }`}
        >
          {pass.kind === 'pager' ? (
            isReady ? <BellRing className="w-4 h-4 motion-safe:animate-pulse" /> : <Clock className="w-4 h-4" />
          ) : pass.kind === 'waitlist' ? (
            <Users className="w-4 h-4" />
          ) : (
            <CalendarCheck2 className="w-4 h-4" />
          )}
        </span>
        <div className="min-w-0 text-xs space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5 font-bold">
            <span className="font-mono text-sm">{pass.code}</span>
            <span>·</span>
            <span>{statusLabel}</span>
          </div>
          <div className={`flex flex-wrap items-center gap-2 text-[11px] ${isReady ? 'text-[#17132E]/85' : 'text-white/75'}`}>
            {showVenueName && <span className="font-semibold truncate">{label(pass.restaurantName)}</span>}
            {!isReady && queueAhead !== null && queueAhead > 0 && (
              <span className="font-mono">
                {t('Queue ahead')}: {queueAhead}
              </span>
            )}
            {orderLines.length > 0 && (
              <span className="font-mono">
                {t('{done}/{total} prepared', { done: preparedLines, total: orderLines.length })}
              </span>
            )}
          </div>
        </div>
      </Link>

      <div className="flex items-center gap-1.5 ms-auto shrink-0">
        {showVenueName && pass.restaurantId && (
          <Link
            href={`/menu/${pass.restaurantId}`}
            className={`min-h-11 inline-flex items-center gap-1 px-3 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
              isReady
                ? 'border-[#17132E]/25 text-[#17132E] hover:bg-[#17132E]/10'
                : 'border-[#312959] bg-[#241E42] text-white hover:bg-[#312959]'
            }`}
          >
            <UtensilsCrossed className="w-3.5 h-3.5" />
            <span>{t('Menu')}</span>
          </Link>
        )}
        <Link
          href={href}
          className={`min-h-11 inline-flex items-center gap-1 px-3 rounded-xl text-[11px] font-extrabold shrink-0 cursor-pointer ${
            isReady ? 'bg-[#17132E] text-white' : 'bg-[#C8FF42] text-[#17132E]'
          }`}
        >
          <span>{t('Open')}</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
        <button
          type="button"
          aria-label={t('Dismiss live pass')}
          onClick={() => dismissGuestPass(pass.kind, pass.trackingToken)}
          className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 cursor-pointer ${
            isReady ? 'hover:bg-[#17132E]/10 text-[#17132E]' : 'hover:bg-white/10 text-white/70'
          }`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function ActiveGuestPassesBar({ restaurantId }: { restaurantId?: string }) {
  const { t } = useMenuLanguage();
  const passes = useSavedGuestPasses(restaurantId);
  if (!passes.length) return null;

  return (
    <section
      aria-label={t('My Live Passes')}
      className="space-y-2 my-2"
      data-testid="active-guest-passes-bar"
    >
      {!restaurantId && (
        <div className="flex items-center justify-between px-1">
          <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#4B1FE0]">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('My Live Passes')}</span>
          </span>
          <span className="text-[11px] font-mono text-[#57507A]">
            {passes.length} {t('active')}
          </span>
        </div>
      )}
      {passes.slice(0, 4).map(pass => (
        <SinglePassChip
          key={`${pass.kind}:${pass.trackingToken}`}
          pass={pass}
          showVenueName={!restaurantId}
        />
      ))}
    </section>
  );
}
