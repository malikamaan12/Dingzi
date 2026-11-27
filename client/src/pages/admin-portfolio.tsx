import { useLocation, Link } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Building2,
  Car,
  Clock,
  ExternalLink,
  Network,
  Receipt,
  UserCog,
  Users,
  Wifi,
} from 'lucide-react';
import { DingziMark } from '@/components/staff-brand';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useRealtimeStream } from '@/lib/useRealtimeStream';

interface TenantBranchSummary {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  theme: string;
  orderingMode: string;
  currency: string;
  isCurrentBranch: boolean;
  activeTickets: number;
  waitingCount: number;
  preparingCount: number;
  readyCount: number;
  arrivedBaysCount: number;
  waitlistWaitingCount: number;
  totalTickets: number;
  avgPrepMins: number;
  peakHour: string;
  totalOrders: number;
  revenue: string;
  reservations: number;
  aggregatorClicks: number;
  qrScans: number;
  nfcTaps: number;
  visibleMenuItems: number;
  soldOutItems: number;
}

interface TenantAnalyticsResponse {
  totals: {
    branchesCount: number;
    activeTicketsNow: number;
    arrivedCurbsideNow: number;
    waitingPartiesNow: number;
    totalTickets: number;
    totalOrders: number;
    combinedRevenue: string;
    currency: string;
    totalQrScans: number;
    totalNfcTaps: number;
    avgPrepMins: number;
  } | null;
  branches: TenantBranchSummary[];
}

export default function AdminPortfolioPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const portfolioQuery = useQuery<TenantAnalyticsResponse>({
    queryKey: ['/api/hospitality/tenant-analytics'],
    refetchInterval: 8_000,
  });

  useRealtimeStream('/api/hospitality/stream', () => {
    void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/tenant-analytics'] });
  });

  const switchBranchMutation = useMutation({
    mutationFn: async ({ restaurantId, targetPath }: { restaurantId: string; targetPath: string }) => {
      const res = await apiRequest('POST', '/api/hospitality/switch-branch', { restaurantId });
      const updated = await res.json();
      return { updated, targetPath };
    },
    onSuccess: ({ updated, targetPath }) => {
      queryClient.setQueryData(['/api/auth/user'], updated);
      void queryClient.invalidateQueries();
      toast({ title: `Switched workspace to ${updated.cafeContext?.name || 'branch'}` });
      navigate(targetPath);
    },
    onError: (e: Error) => {
      toast({ title: 'Could not switch branch', description: e.message, variant: 'destructive' });
    },
  });

  if (portfolioQuery.isLoading) {
    return (
      <div className="p-8 text-sm text-muted-foreground" role="status">
        Loading multi-branch portfolio command center…
      </div>
    );
  }

  const branches = portfolioQuery.data?.branches || [];
  const totals = portfolioQuery.data?.totals;
  const groupName = user?.tenantContext?.name || 'Multi-Branch Portfolio';

  return (
    <div className="space-y-6 max-w-[1500px]" data-testid="page-tenant-portfolio">
      {/* Multi-Branch Tenant Owner Command Hero */}
      <section className="rounded-3xl bg-[#17132E] text-white border border-[#241E42] p-5 sm:p-7 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <DingziMark size={34} />
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C8FF42] text-[#17132E] text-xs font-extrabold">
                <Network className="w-3.5 h-3.5" />
                Tenant Owner Portfolio
              </span>
              <span className="px-3 py-1 rounded-full bg-[#241E42] text-white/85 text-xs font-mono">
                {branches.length} Active {branches.length === 1 ? 'Branch' : 'Branches'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight">
              {groupName}
            </h1>
            <p className="text-sm text-white/75 max-w-2xl">
              Compare live order queues, prep SLAs, curbside arrivals, and settled revenue across every branch in your group — jump into any branch console in one tap.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button asChild className="min-h-11 rounded-2xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-bold cursor-pointer gap-1.5">
              <Link href="/admin">
                <Building2 className="w-4 h-4" />
                <span>Active Branch Console</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11 rounded-2xl border-white/20 bg-[#241E42] text-white hover:bg-[#312959] cursor-pointer gap-1.5">
              <Link href="/admin/team">
                <UserCog className="w-4 h-4" />
                <span>Group Staff &amp; Roles</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11 rounded-2xl border-white/20 bg-[#241E42] text-white hover:bg-[#312959] cursor-pointer gap-1.5">
              <Link href="/admin/analytics">
                <BarChart3 className="w-4 h-4" />
                <span>Deep SLA Analytics</span>
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Group KPI Pulse */}
      {totals && (
        <section className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4" role="status" aria-live="polite">
          <div className="rounded-2xl border bg-card p-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Group Revenue</span>
              <Receipt className="w-4 h-4 text-[#6236FF]" />
            </div>
            <strong className="block text-2xl font-display font-extrabold font-mono">
              {totals.combinedRevenue} {totals.currency}
            </strong>
            <span className="text-xs text-muted-foreground block">{totals.totalOrders} total orders</span>
          </div>

          <div className="rounded-2xl border bg-card p-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Live Queues</span>
              <BellRing className="w-4 h-4 text-[#6236FF]" />
            </div>
            <strong className="block text-2xl font-display font-extrabold font-mono">
              {totals.activeTicketsNow}
            </strong>
            <span className="text-xs text-muted-foreground block">{totals.totalTickets} cumulative pagers</span>
          </div>

          <div className="rounded-2xl border bg-card p-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Avg Prep SLA</span>
              <Clock className="w-4 h-4 text-[#6236FF]" />
            </div>
            <strong className="block text-2xl font-display font-extrabold font-mono">
              {totals.avgPrepMins}m
            </strong>
            <span className="text-xs text-muted-foreground block">Across {totals.branchesCount} branches</span>
          </div>

          <div className="rounded-2xl border bg-card p-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Arrived Cars</span>
              <Car className="w-4 h-4 text-[#6236FF]" />
            </div>
            <strong className="block text-2xl font-display font-extrabold font-mono">
              {totals.arrivedCurbsideNow}
            </strong>
            <span className="text-xs text-muted-foreground block">Curbside &amp; drive-thru</span>
          </div>

          <div className="rounded-2xl border bg-card p-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Waitlist Now</span>
              <Users className="w-4 h-4 text-[#6236FF]" />
            </div>
            <strong className="block text-2xl font-display font-extrabold font-mono">
              {totals.waitingPartiesNow}
            </strong>
            <span className="text-xs text-muted-foreground block">Parties waiting for tables</span>
          </div>

          <div className="rounded-2xl border bg-card p-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>QR &amp; NFC</span>
              <Wifi className="w-4 h-4 text-[#6236FF]" />
            </div>
            <strong className="block text-2xl font-display font-extrabold font-mono">
              {totals.totalQrScans + totals.totalNfcTaps}
            </strong>
            <span className="text-xs text-muted-foreground block">
              {totals.totalQrScans} QR · {totals.totalNfcTaps} NFC
            </span>
          </div>
        </section>
      )}

      {/* Live Branch Matrix Cards */}
      <section className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
        {branches.map(branch => (
          <article
            key={branch.id}
            data-testid={`card-portfolio-branch-${branch.id}`}
            className={`rounded-3xl border p-5 space-y-4 bg-card transition-colors ${
              branch.isCurrentBranch ? 'border-[#6236FF] ring-2 ring-[#6236FF]/25' : 'border-border'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-display font-bold truncate">{branch.name}</h2>
                  {branch.isCurrentBranch && (
                    <span className="px-2.5 py-0.5 rounded-full bg-[#EFEAFF] text-[#4B1FE0] text-xs font-bold">
                      Selected
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  {branch.slug ? `/v/${branch.slug}` : branch.orderingMode}
                </p>
              </div>
              <Badge variant="outline" className="font-mono text-[11px] shrink-0">
                {branch.orderingMode}
              </Badge>
            </div>

            {/* Live Queue Status Breakdown */}
            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-muted/40 p-3 text-center">
              <div>
                <span className="text-xs text-muted-foreground block">Waiting</span>
                <strong className="text-lg font-mono">{branch.waitingCount}</strong>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Preparing</span>
                <strong className="text-lg font-mono text-[#6236FF]">{branch.preparingCount}</strong>
              </div>
              <div className="rounded-xl bg-[#C8FF42]/25 py-0.5">
                <span className="text-xs text-foreground font-semibold block">Ready</span>
                <strong className="text-lg font-mono">{branch.readyCount}</strong>
              </div>
            </div>

            {/* Financial & Operational Metrics */}
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="rounded-xl border p-2.5">
                <span className="text-muted-foreground block">Settled Revenue</span>
                <strong className="font-mono text-sm">
                  {branch.revenue} {branch.currency}
                </strong>
                <span className="text-muted-foreground block mt-0.5">{branch.totalOrders} orders</span>
              </div>
              <div className="rounded-xl border p-2.5">
                <span className="text-muted-foreground block">Avg Prep SLA</span>
                <strong className="font-mono text-sm">{branch.avgPrepMins}m</strong>
                <span className="text-muted-foreground block mt-0.5">Peak {branch.peakHour}</span>
              </div>
              <div className="rounded-xl border p-2.5">
                <span className="text-muted-foreground block">Curbside &amp; Floor</span>
                <strong className="font-mono text-sm">
                  {branch.arrivedBaysCount} Bay · {branch.waitlistWaitingCount} Wait
                </strong>
              </div>
              <div className="rounded-xl border p-2.5">
                <span className="text-muted-foreground block">Menu Stock</span>
                <strong className="font-mono text-sm">
                  {branch.visibleMenuItems} Live
                  {branch.soldOutItems > 0 ? ` · ${branch.soldOutItems} 86'd` : ''}
                </strong>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                type="button"
                disabled={switchBranchMutation.isPending}
                onClick={() =>
                  branch.isCurrentBranch
                    ? navigate('/admin')
                    : switchBranchMutation.mutate({ restaurantId: branch.id, targetPath: '/admin' })
                }
                data-testid={`button-enter-branch-${branch.id}`}
                className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-semibold cursor-pointer gap-1.5"
              >
                <span>Branch Console</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={switchBranchMutation.isPending}
                onClick={() =>
                  branch.isCurrentBranch
                    ? navigate('/admin/pagers')
                    : switchBranchMutation.mutate({ restaurantId: branch.id, targetPath: '/admin/pagers' })
                }
                className="min-h-11 rounded-xl font-semibold cursor-pointer gap-1.5"
              >
                <BellRing className="w-4 h-4" />
                <span>Live Queue</span>
              </Button>
            </div>

            <div className="pt-1 border-t flex items-center justify-between text-xs text-muted-foreground">
              <span>{branch.qrScans} QR scans · {branch.nfcTaps} NFC taps</span>
              <a
                href={branch.slug ? `/v/${branch.slug}` : `/menu/${branch.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[#4B1FE0] font-semibold hover:underline"
              >
                <span>Guest Menu</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
