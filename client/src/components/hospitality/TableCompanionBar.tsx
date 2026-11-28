import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Bell, CheckCircle2, GlassWater, Receipt, UtensilsCrossed } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { BrandedReceiptSheet } from '@/components/hospitality/BrandedReceiptSheet';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { formatCurrencyForLocale, resolveVenueConfig } from '@shared/venueConfig';
import type { PublicCafe, TableServiceRequestType } from '@shared/schema';

export function TableCompanionBar({
  restaurant,
  tableCode,
  language,
  dir,
}: {
  restaurant: PublicCafe;
  tableCode: string;
  language: 'en' | 'ar';
  dir: 'ltr' | 'rtl';
}) {
  const [checkOpen, setCheckOpen] = useState(false);
  const [lastSentType, setLastSentType] = useState<TableServiceRequestType | null>(null);
  const venueCfg = resolveVenueConfig(restaurant.venueConfig);
  const currencyDisplay = formatCurrencyForLocale(restaurant.currency, language, venueCfg.currencySymbolAr);

  const sessionQuery = useQuery<any>({
    queryKey: ['/api/public/table-session', restaurant.id, tableCode],
    queryFn: async () => {
      const res = await fetch(
        `/api/public/table-session/${restaurant.id}?table=${encodeURIComponent(tableCode)}`,
      );
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 6000,
  });

  const serviceMutation = useMutation({
    mutationFn: async (requestType: TableServiceRequestType) => {
      const res = await apiRequest('POST', `/api/public/table-service/${restaurant.id}`, {
        tableCode,
        requestType,
      });
      return { data: await res.json(), requestType };
    },
    onSuccess: ({ requestType }) => {
      setLastSentType(requestType);
      void queryClient.invalidateQueries({
        queryKey: ['/api/public/table-session', restaurant.id, tableCode],
      });
    },
  });

  const summary = sessionQuery.data?.tabSummary;
  const openRequests: any[] = sessionQuery.data?.openRequests || [];
  const hasOpenTab = Boolean(summary && summary.roundsCount > 0);
  const isRequested = (type: TableServiceRequestType) =>
    lastSentType === type || openRequests.some(r => r.requestType === type);

  return (
    <>
      <section
        aria-label={`Table ${tableCode} service`}
        data-testid="table-companion-bar"
        className="my-2 rounded-2xl border border-[#E5E2F2] bg-[#F6F5FC] px-3.5 py-3 space-y-2.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-xs font-bold text-[#17132E]">
            <span className="w-6 h-6 rounded-lg bg-[#17132E] text-[#C8FF42] grid place-items-center shrink-0">
              <UtensilsCrossed className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
            <span>
              {language === 'ar' ? `طاولة ${tableCode}` : `Table ${tableCode}`}
            </span>
            {hasOpenTab && (
              <span className="font-mono font-normal text-[#57507A]">
                · {summary.roundsCount} {summary.roundsCount === 1 ? 'round' : 'rounds'}
              </span>
            )}
          </span>

          {hasOpenTab && (
            <button
              type="button"
              data-testid="button-open-table-check"
              onClick={() => setCheckOpen(true)}
              className="min-h-9 px-3 rounded-full bg-[#17132E] text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#241E42] transition-colors cursor-pointer"
            >
              <Receipt className="w-3.5 h-3.5 text-[#C8FF42]" aria-hidden="true" />
              <span>
                {language === 'ar' ? 'الفاتورة وتقسيم الحساب' : 'Table Check'} ·{' '}
                <strong className="font-mono">{summary.total}</strong> {currencyDisplay}
              </span>
            </button>
          )}
        </div>

        <div className="flex flex-nowrap overflow-x-auto no-scrollbar gap-1.5">
          {(
            [
              {
                type: 'call_server' as const,
                icon: Bell,
                en: 'Call Server',
                ar: 'طلب النادل',
                doneEn: 'Server Notified',
                doneAr: 'تم إبلاغ النادل',
              },
              {
                type: 'water_napkins' as const,
                icon: GlassWater,
                en: 'Water / Napkins',
                ar: 'ماء / مناديل',
                doneEn: 'Requested',
                doneAr: 'تم الطلب',
              },
              {
                type: 'request_bill' as const,
                icon: Receipt,
                en: 'Request Bill',
                ar: 'طلب الحساب',
                doneEn: 'Bill Requested',
                doneAr: 'تم طلب الحساب',
              },
            ]
          ).map(btn => {
            const active = isRequested(btn.type);
            const Icon = active ? CheckCircle2 : btn.icon;
            return (
              <button
                key={btn.type}
                type="button"
                disabled={serviceMutation.isPending}
                data-testid={`button-table-${btn.type}`}
                onClick={() => serviceMutation.mutate(btn.type)}
                className={`min-h-10 px-3 rounded-full border text-xs font-medium inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#EFEAFF] border-[#6236FF]/35 text-[#4B1FE0] font-semibold'
                    : 'bg-white border-[#E5E2F2] text-[#17132E] hover:bg-[#EFEAFF]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {active
                    ? language === 'ar'
                      ? btn.doneAr
                      : btn.doneEn
                    : language === 'ar'
                      ? btn.ar
                      : btn.en}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <Dialog open={checkOpen} onOpenChange={setCheckOpen}>
        <DialogContent dir={dir} lang={language} className="max-w-md max-h-[90vh] overflow-y-auto rounded-3xl">
          <DialogTitle className="text-base font-bold">
            {language === 'ar' ? `فاتورة طاولة ${tableCode}` : `Table ${tableCode} · Running Check`}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {language === 'ar'
              ? 'يمكنكم إضافة المزيد من الطلبات من القائمة أو تقسيم الفاتورة أدناه.'
              : 'Add another round anytime from the menu, split the check below, or tap Request Bill when ready.'}
          </DialogDescription>
          {hasOpenTab && (
            <BrandedReceiptSheet
              venue={restaurant}
              order={{
                orderNumber: `TAB-${tableCode}`,
                createdAt: sessionQuery.data?.orders?.[0]?.createdAt || new Date(),
                channel: 'dine_in',
                paymentStatus: 'pay_at_venue',
                customerName: sessionQuery.data?.orders?.[0]?.customerName || `Table ${tableCode}`,
                tableCode,
                currency: summary.currency,
                subtotal: summary.subtotal,
                total: summary.total,
                lineItems: summary.combinedLines,
                roundsCount: summary.roundsCount,
              }}
              qrUrl={typeof window !== 'undefined' ? window.location.href : null}
              qrCaption={`Table ${tableCode} · Order another round`}
              allowSplitCalculator
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
