import { useMutation, useQuery } from '@tanstack/react-query';
import { BellRing, Check, CreditCard, GlassWater, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { playStaffArrivalChime } from '@/lib/pagerAudio';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useRealtimeStream } from '@/lib/useRealtimeStream';
import type { TableServiceRequest } from '@shared/schema';

const TYPE_META: Record<
  string,
  { label: string; icon: typeof BellRing }
> = {
  call_server: { label: 'Call Server', icon: BellRing },
  request_bill: { label: 'Requested Bill / Card Machine', icon: Receipt },
  water_napkins: { label: 'Water & Napkins', icon: GlassWater },
};

export function LiveTableServiceBanner({ darkSurface = false }: { darkSurface?: boolean }) {
  const { toast } = useToast();

  const requestsQuery = useQuery<{ requests: TableServiceRequest[] }>({
    queryKey: ['/api/hospitality/table-service'],
    refetchInterval: 6000,
  });

  useRealtimeStream('/api/hospitality/stream', ev => {
    if (
      ev.type === 'table.service_requested' ||
      ev.type === 'table.service_resolved' ||
      ev.type === 'table.tab_settled'
    ) {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/table-service'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/orders'] });
      if (ev.type === 'table.service_requested') {
        playStaffArrivalChime();
      }
    }
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('POST', `/api/hospitality/table-service/${id}/resolve`, {});
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/table-service'] });
      toast({ title: 'Table request handled' });
    },
  });

  const settleTabMutation = useMutation({
    mutationFn: async (tableCode: string) => {
      const res = await apiRequest('POST', '/api/hospitality/table-tab/settle', { tableCode });
      return res.json();
    },
    onSuccess: data => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/table-service'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/orders'] });
      toast({
        title: `Table ${data.tableCode} Tab Settled`,
        description: `Marked ${data.settledOrders?.length || 0} open dine-in round(s) Paid.`,
      });
    },
  });

  const requests = requestsQuery.data?.requests || [];
  if (requests.length === 0) return null;

  return (
    <section
      role="alert"
      data-testid="banner-table-service-requests"
      className={`rounded-2xl border-2 p-4 space-y-2.5 ${
        darkSurface
          ? 'bg-[#241E42] border-[#C8FF42] text-white'
          : 'bg-[#EFEAFF] border-[#6236FF]/35 text-[#17132E]'
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-bold">
        <BellRing
          className={`w-4 h-4 motion-safe:animate-pulse shrink-0 ${
            darkSurface ? 'text-[#C8FF42]' : 'text-[#6236FF]'
          }`}
          aria-hidden="true"
        />
        <span>Dine-In Table Service Bell ({requests.length})</span>
      </div>

      <div className="grid sm:grid-cols-2 gap-2.5">
        {requests.map(req => {
          const meta = TYPE_META[req.requestType] || TYPE_META.call_server;
          const Icon = meta.icon;
          return (
            <div
              key={req.id}
              data-testid={`card-table-service-${req.tableCode}`}
              className={`rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 border ${
                darkSurface ? 'bg-[#17132E] border-white/15' : 'bg-white border-[#E5E2F2]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="px-2.5 py-1 rounded-lg bg-[#C8FF42] text-[#17132E] font-mono text-xs font-black shrink-0">
                  {req.tableCode}
                </span>
                <div className="min-w-0 text-xs">
                  <strong className="inline-flex items-center gap-1 font-semibold">
                    <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{meta.label}</span>
                  </strong>
                  {req.note && <span className="block opacity-75 truncate">“{req.note}”</span>}
                </div>
              </div>

              <div className="flex items-center gap-1.5 ms-auto">
                {req.requestType === 'request_bill' && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={settleTabMutation.isPending}
                    onClick={() => settleTabMutation.mutate(req.tableCode)}
                    className="min-h-9 rounded-lg bg-[#6236FF] hover:bg-[#4B1FE0] text-white text-xs cursor-pointer gap-1"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Settle Tab</span>
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={resolveMutation.isPending}
                  data-testid={`button-resolve-table-${req.tableCode}`}
                  onClick={() => resolveMutation.mutate(req.id)}
                  className={`min-h-9 rounded-lg text-xs cursor-pointer gap-1 ${
                    darkSurface ? 'border-white/20 bg-[#241E42] text-white hover:bg-[#312959]' : ''
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Done</span>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
