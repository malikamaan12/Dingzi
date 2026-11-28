import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  BellRing,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  History,
  Network,
  PauseCircle,
  Phone,
  PlayCircle,
  Plus,
  QrCode,
  Receipt,
  Search,
  Settings,
  SlidersHorizontal,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { OpenCafeAccount } from '@/components/open-cafe-account';
import PermanentMenuQR from '@/components/permanent-menu-qr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { Restaurant } from '@shared/schema';

interface RestaurantWithOwner extends Restaurant {
  owner: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
}

interface PortfolioBranchMetric {
  id: string;
  name: string;
  slug: string | null;
  status?: string;
  hidden?: boolean;
  tenantId?: string | null;
  orderingMode: string;
  currency: string;
  activeTickets?: number;
  totalTickets: number;
  avgPrepMins: number;
  totalOrders: number;
  revenue?: string;
  reservations: number;
  waitlistWaiting?: number;
  aggregatorClicks: number;
  smartTagsCount?: number;
  qrScans?: number;
  nfcTaps?: number;
}

interface PortfolioAnalyticsResponse {
  totals?: {
    totalRestaurants: number;
    livePublicMenus: number;
    pausedRestaurants: number;
    tenantGroupsCount: number;
    totalUsers: number;
    activeTicketsNow: number;
    totalTickets: number;
    totalOrders: number;
    settledRevenueTotal: string;
    reservationsCount: number;
    waitlistWaitingNow: number;
    smartTagsCount: number;
    totalQrScans: number;
    totalNfcTaps: number;
  };
  branches: PortfolioBranchMetric[];
}

const ORDERING_MODE_LABELS: Record<string, string> = {
  browse_and_pager: 'Counter Pager',
  cart_pay_at_venue: 'Pay at Venue',
  full_online_checkout: 'Online Payment',
};

function PortfolioAnalyticsPanel({ branches }: { branches: PortfolioBranchMetric[] }) {
  if (!branches.length) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No venue activity recorded yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          <span>Side-by-Side Branch SLA, Revenue &amp; QR/NFC Demand</span>
        </CardTitle>
        <CardDescription>
          Live performance comparison across every venue on the platform.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:hidden">
          {branches.map(b => (
            <article key={b.id} className="rounded-2xl border p-3.5 space-y-2.5 bg-card">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm truncate">{b.name}</strong>
                <Badge variant="outline" className="text-[11px] shrink-0">
                  {ORDERING_MODE_LABELS[b.orderingMode] || b.orderingMode}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl bg-muted/40 p-2">
                  <span className="text-muted-foreground block">Queue</span>
                  <strong className="font-mono">{b.activeTickets || 0} / {b.totalTickets}</strong>
                </div>
                <div className="rounded-xl bg-muted/40 p-2">
                  <span className="text-muted-foreground block">Avg Prep</span>
                  <strong className="font-mono">{b.avgPrepMins}m</strong>
                </div>
                <div className="rounded-xl bg-muted/40 p-2">
                  <span className="text-muted-foreground block">Orders</span>
                  <strong className="font-mono">{b.totalOrders}</strong>
                </div>
                <div className="rounded-xl bg-muted/40 p-2">
                  <span className="text-muted-foreground block">Revenue</span>
                  <strong className="font-mono">{b.revenue || '0.00'} {b.currency}</strong>
                </div>
                <div className="rounded-xl bg-muted/40 p-2">
                  <span className="text-muted-foreground block">Bookings</span>
                  <strong className="font-mono">{b.reservations}</strong>
                </div>
                <div className="rounded-xl bg-muted/40 p-2">
                  <span className="text-muted-foreground block">QR + NFC</span>
                  <strong className="font-mono">{(b.qrScans || 0) + (b.nfcTaps || 0)}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b text-xs uppercase text-muted-foreground">
                <th className="py-2.5 pr-4">Venue</th>
                <th className="py-2.5 px-3">Mode</th>
                <th className="py-2.5 px-3 text-right">Live Queue</th>
                <th className="py-2.5 px-3 text-right">Total Pagers</th>
                <th className="py-2.5 px-3 text-right">Avg Prep</th>
                <th className="py-2.5 px-3 text-right">Orders &amp; Revenue</th>
                <th className="py-2.5 px-3 text-right">Bookings</th>
                <th className="py-2.5 pl-3 text-right">QR / NFC</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {branches.map(b => (
                <tr key={b.id}>
                  <td className="py-2.5 pr-4 font-semibold">{b.name}</td>
                  <td className="py-2.5 px-3">
                    <Badge variant="outline" className="text-[11px]">
                      {ORDERING_MODE_LABELS[b.orderingMode] || b.orderingMode}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-[#6236FF]">
                    {b.activeTickets || 0}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono">{b.totalTickets}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{b.avgPrepMins}m</td>
                  <td className="py-2.5 px-3 text-right font-mono">
                    {b.totalOrders} · {b.revenue || '0.00'} {b.currency}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono">{b.reservations}</td>
                  <td className="py-2.5 pl-3 text-right font-mono">
                    {b.qrScans || 0} QR / {b.nfcTaps || 0} NFC
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function PauseVenueDialog({
  restaurant,
  open,
  onOpenChange,
}: {
  restaurant: RestaurantWithOwner;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState('Seasonal pause / owner offboarding request');
  const [freezeExclusiveStaff, setFreezeExclusiveStaff] = useState(true);

  const pauseMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', `/api/super-admin/restaurants/${restaurant.id}/offboard`, {
        stage: 'pause_venue',
        reason: reason.trim(),
        freezeExclusiveStaff,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/super-admin/restaurants'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/super-admin/portfolio-analytics'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/super-admin/users'] });
      toast({
        title: `${restaurant.name} paused`,
        description: 'Public menu hidden and dangling pagers closed. All menus, orders, and QRs remain preserved.',
      });
      onOpenChange(false);
    },
    onError: (e: Error) => {
      toast({
        title: 'Could not pause venue',
        description: e.message || 'Check reason and try again',
        variant: 'destructive',
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl max-w-lg">
        <DialogHeader>
          <DialogTitle>Pause or Offboard {restaurant.name}</DialogTitle>
          <DialogDescription>
            Safely pauses public guest access, closes active pager tickets, and preserves 100% of menus, orders, and QR codes. Need to download a full JSON archive or permanently delete this venue? Open{' '}
            <Link
              href={`/super-admin/restaurant/${restaurant.id}?tab=lifecycle`}
              onClick={() => onOpenChange(false)}
              className="text-[#4B1FE0] font-semibold underline"
            >
              Lifecycle &amp; Offboarding
            </Link>
            .
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="reason">Pause / Offboarding Reason</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Closed for summer renovations…"
              rows={3}
              required
              data-testid="input-suspension-reason"
            />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={freezeExclusiveStaff}
              onChange={e => setFreezeExclusiveStaff(e.target.checked)}
              className="accent-[#6236FF]"
            />
            <span>Also freeze staff logins assigned exclusively to this branch</span>
          </label>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-suspend"
            className="min-h-11 rounded-xl cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => pauseMutation.mutate()}
            disabled={pauseMutation.isPending || reason.trim().length < 5}
            data-testid="button-confirm-suspend"
            className="min-h-11 rounded-xl cursor-pointer"
          >
            {pauseMutation.isPending ? 'Pausing…' : 'Pause Venue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MultiBranchTenantGroupsPanel({ restaurants }: { restaurants: RestaurantWithOwner[] }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('');

  const tenantsQuery = useQuery<{
    tenants: {
      id: string;
      name: string;
      slug: string | null;
      ownerUserId: string | null;
      ownerEmail: string | null;
      branches: { id: string; name: string; slug: string | null }[];
    }[];
  }>({
    queryKey: ['/api/super-admin/tenants'],
  });

  const usersQuery = useQuery<{ id: string; email: string; role: string }[]>({
    queryKey: ['/api/super-admin/users'],
  });

  const createTenantMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/super-admin/tenants', {
        name: name.trim(),
        slug: slug.trim().toLowerCase() || null,
        ownerUserId: ownerUserId || null,
      });
      return res.json();
    },
    onSuccess: () => {
      setName('');
      setSlug('');
      setOwnerUserId('');
      void queryClient.invalidateQueries({ queryKey: ['/api/super-admin/tenants'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/super-admin/portfolio-analytics'] });
      toast({ title: 'Multi-branch brand group created' });
    },
    onError: (e: Error) =>
      toast({ title: 'Could not create brand group', description: e.message, variant: 'destructive' }),
  });

  const linkBranchMutation = useMutation({
    mutationFn: async ({ restaurantId, tenantId }: { restaurantId: string; tenantId: string | null }) => {
      const res = await apiRequest('PUT', `/api/super-admin/restaurants/${restaurantId}/tenant`, { tenantId });
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/super-admin/tenants'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/super-admin/restaurants'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/super-admin/portfolio-analytics'] });
      toast({ title: 'Branch brand group updated' });
    },
    onError: (e: Error) =>
      toast({ title: 'Could not update branch group', description: e.message, variant: 'destructive' }),
  });

  const tenantsList = tenantsQuery.data?.tenants || [];
  const eligibleOwners = (usersQuery.data || []).filter(u => u.role === 'admin');

  return (
    <Card className="rounded-2xl border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Network className="w-5 h-5 text-primary" />
          <span>Multi-Branch Brand &amp; Tenant Groups</span>
        </CardTitle>
        <CardDescription>
          Group branches under one hospitality organization so its Tenant Owner gets a unified portfolio dashboard and instant branch switcher.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={e => {
            e.preventDefault();
            createTenantMutation.mutate();
          }}
          className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end"
        >
          <div>
            <Label className="text-xs">Brand / Group Name *</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Urban Hospitality Group"
              required
              className="min-h-11"
            />
          </div>
          <div>
            <Label className="text-xs">Group Slug (optional)</Label>
            <Input
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder="urban-group"
              className="min-h-11 font-mono"
            />
          </div>
          <div>
            <Label className="text-xs">Tenant Owner Account</Label>
            <select
              className="manager-select w-full min-h-11 text-sm"
              value={ownerUserId}
              onChange={e => setOwnerUserId(e.target.value)}
            >
              <option value="">Assign later…</option>
              {eligibleOwners.map(u => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="submit"
            disabled={!name.trim() || createTenantMutation.isPending}
            className="min-h-11 rounded-xl cursor-pointer gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Create Brand Group</span>
          </Button>
        </form>

        {tenantsList.length > 0 && (
          <div className="grid md:grid-cols-2 gap-3 pt-2">
            {tenantsList.map(t => (
              <div key={t.id} className="rounded-2xl border p-3.5 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <strong>{t.name}</strong>
                  <Badge variant="outline">{t.branches.length} branches</Badge>
                </div>
                {t.ownerEmail && <p className="text-xs text-muted-foreground">Owner: {t.ownerEmail}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {t.branches.map(b => (
                    <Badge key={b.id} className="bg-[#EFEAFF] text-[#4B1FE0] border border-[#E5E2F2]">
                      {b.name}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tenantsList.length > 0 && restaurants.length > 0 && (
          <div className="pt-3 border-t grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {restaurants.map(r => (
              <div key={r.id} className="rounded-2xl border p-2.5 flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold truncate">{r.name}</span>
                <select
                  aria-label={`Assign tenant group for ${r.name}`}
                  className="manager-select min-h-11 text-xs max-w-[170px]"
                  value={r.tenantId || ''}
                  onChange={e =>
                    linkBranchMutation.mutate({
                      restaurantId: r.id,
                      tenantId: e.target.value || null,
                    })
                  }
                >
                  <option value="">Standalone Venue</option>
                  {tenantsList.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SuperAdminDashboard() {
  const { toast } = useToast();
  const [qrRestaurant, setQrRestaurant] = useState<RestaurantWithOwner | null>(null);
  const [suspendRestaurant, setSuspendRestaurant] = useState<RestaurantWithOwner | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'live' | 'paused' | 'grouped'>('all');

  const { data: restaurants, isLoading } = useQuery<RestaurantWithOwner[]>({
    queryKey: ['/api/super-admin/restaurants'],
  });

  const portfolioQuery = useQuery<PortfolioAnalyticsResponse>({
    queryKey: ['/api/super-admin/portfolio-analytics'],
    refetchInterval: 10_000,
  });

  const reactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('POST', `/api/super-admin/restaurants/${id}/reactivate`, {});
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/super-admin/restaurants'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/super-admin/portfolio-analytics'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/super-admin/users'] });
      toast({
        title: 'Venue reactivated',
        description: 'Public menu, QR/NFC smart tags, and staff logins are back online.',
      });
    },
    onError: () => {
      toast({
        title: 'Could not reactivate venue',
        variant: 'destructive',
      });
    },
  });

  const metricsByBranchId = useMemo(() => {
    const map = new Map<string, PortfolioBranchMetric>();
    for (const b of portfolioQuery.data?.branches || []) {
      map.set(b.id, b);
    }
    return map;
  }, [portfolioQuery.data?.branches]);

  const filteredRestaurants = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (restaurants || []).filter(r => {
      if (statusFilter === 'live' && (r.status !== 'active' || r.hidden)) return false;
      if (statusFilter === 'paused' && r.status === 'active' && !r.hidden) return false;
      if (statusFilter === 'grouped' && !r.tenantId) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.slug || '').toLowerCase().includes(q) ||
        (r.owner?.email || '').toLowerCase().includes(q) ||
        (r.cuisineType || '').toLowerCase().includes(q)
      );
    });
  }, [restaurants, search, statusFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-8" role="status">
        <p className="text-muted-foreground">Loading platform network…</p>
      </div>
    );
  }

  const totals = portfolioQuery.data?.totals;
  const liveCount = restaurants?.filter(r => r.status === 'active' && !r.hidden).length || 0;
  const pausedCount = restaurants?.filter(r => r.status !== 'active' || r.hidden).length || 0;

  return (
    <div className="space-y-6 max-w-[1440px]">
      {/* Clean Operational Header */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight" data-testid="heading-super-admin">
            Venues &amp; Network
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Onboard cafés and restaurants, manage multi-branch brand groups, monitor live traffic, or safely offboard venues.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            asChild
            data-testid="button-onboard-venue"
            className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-bold cursor-pointer gap-1.5"
          >
            <Link href="/super-admin/restaurants/new">
              <Plus className="w-4 h-4" />
              <span>Onboard Venue</span>
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 rounded-xl cursor-pointer gap-1.5">
            <Link href="/super-admin/accounts">
              <Users className="w-4 h-4" />
              <span>Accounts &amp; PINs</span>
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 rounded-xl cursor-pointer gap-1.5">
            <Link href="/super-admin/settings">
              <SlidersHorizontal className="w-4 h-4" />
              <span>Platform CMS</span>
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 rounded-xl cursor-pointer gap-1.5">
            <Link href="/super-admin/access-history">
              <History className="w-4 h-4" />
              <span>Audit Log</span>
            </Link>
          </Button>
        </div>
      </header>

      {/* Focused 4-Metric Network Pulse */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" role="status" aria-live="polite">
        <div className="rounded-2xl border bg-card p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Live Venues</span>
            <Eye className="w-4 h-4 text-[#6236FF]" />
          </div>
          <strong className="block text-2xl font-display font-extrabold font-mono">
            {liveCount} / {restaurants?.length || 0}
          </strong>
          <span className="text-xs text-muted-foreground block">
            {pausedCount > 0 ? `${pausedCount} paused or hidden` : 'All venues accepting guests'}
          </span>
        </div>

        <div className="rounded-2xl border bg-card p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Active Queues &amp; Taps</span>
            <BellRing className="w-4 h-4 text-[#6236FF]" />
          </div>
          <strong className="block text-2xl font-display font-extrabold font-mono">
            {totals?.activeTicketsNow ?? 0} live
          </strong>
          <span className="text-xs text-muted-foreground block font-mono">
            {(totals?.totalQrScans ?? 0) + (totals?.totalNfcTaps ?? 0)} QR/NFC scans
          </span>
        </div>

        <div className="rounded-2xl border bg-card p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Settled Revenue</span>
            <Receipt className="w-4 h-4 text-[#6236FF]" />
          </div>
          <strong className="block text-2xl font-display font-extrabold font-mono">
            {totals?.settledRevenueTotal ?? '0.00'} QAR
          </strong>
          <span className="text-xs text-muted-foreground block font-mono">
            {totals?.totalOrders ?? 0} orders · {totals?.reservationsCount ?? 0} bookings
          </span>
        </div>

        <div className="rounded-2xl border bg-card p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Tenants &amp; Staff</span>
            <Users className="w-4 h-4 text-[#6236FF]" />
          </div>
          <strong className="block text-2xl font-display font-extrabold font-mono">
            {totals?.tenantGroupsCount ?? 0} brands
          </strong>
          <span className="text-xs text-muted-foreground block font-mono">
            {totals?.totalUsers ?? 0} staff accounts
          </span>
        </div>
      </section>

      {/*Focused 3-Tab Operational Workspace */}
      <Tabs defaultValue="venues" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1.5 rounded-2xl w-fit">
          <TabsTrigger value="venues" className="min-h-10 rounded-xl cursor-pointer gap-1.5">
            <Building2 className="w-4 h-4" />
            <span>Venues ({restaurants?.length || 0})</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="min-h-10 rounded-xl cursor-pointer gap-1.5">
            <BarChart3 className="w-4 h-4" />
            <span>Branch Comparison</span>
          </TabsTrigger>
          <TabsTrigger value="tenants" className="min-h-10 rounded-xl cursor-pointer gap-1.5">
            <Network className="w-4 h-4" />
            <span>Brand Groups ({totals?.tenantGroupsCount ?? 0})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="venues" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 sm:max-w-md">
              <Search className="w-4 h-4 text-muted-foreground absolute top-3.5 start-3.5 pointer-events-none" />
              <Input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search venues, /v/ slugs, or owner emails…"
                aria-label="Search venues"
                className="min-h-11 ps-10 rounded-xl"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'all' as const, label: `All (${restaurants?.length || 0})` },
                { id: 'live' as const, label: `Live (${liveCount})` },
                { id: 'paused' as const, label: `Paused / Hidden (${pausedCount})` },
                { id: 'grouped' as const, label: 'Multi-Branch' },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={statusFilter === tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`min-h-11 px-4 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-[#6236FF] text-white border-[#6236FF]'
                      : 'bg-card text-foreground border-border hover:bg-muted'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="staff-platform-grid">
            {filteredRestaurants.length === 0 && (
              <Card className="col-span-full rounded-2xl">
                <CardContent className="p-8 text-center space-y-3">
                  <Building2 className="h-10 w-10 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No venues match this filter.</p>
                </CardContent>
              </Card>
            )}

            {filteredRestaurants.map(restaurant => {
              const metric = metricsByBranchId.get(restaurant.id);
              const isPaused = restaurant.status === 'suspended';
              return (
                <Card
                  key={restaurant.id}
                  className="staff-restaurant-card"
                  data-testid={`card-restaurant-${restaurant.id}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="staff-restaurant-avatar !mb-2">
                        {restaurant.logoUrl ? (
                          <img src={restaurant.logoUrl} alt={`${restaurant.name} logo`} />
                        ) : (
                          <Building2 size={22} />
                        )}
                      </div>
                      <Badge variant="outline" className="text-[11px]">
                        {ORDERING_MODE_LABELS[restaurant.orderingMode] || restaurant.orderingMode}
                      </Badge>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-lg">{restaurant.name}</CardTitle>
                        {isPaused ? (
                          <Badge variant="destructive" className="gap-1">
                            <PauseCircle className="w-3 h-3" aria-hidden="true" />
                            <span>Paused</span>
                          </Badge>
                        ) : restaurant.hidden ? (
                          <Badge variant="secondary" className="gap-1">
                            <EyeOff className="w-3 h-3" aria-hidden="true" />
                            <span>Hidden</span>
                          </Badge>
                        ) : (
                          <Badge className="bg-[#C8FF42] text-[#17132E] hover:bg-[#C8FF42] border-0 gap-1 font-bold">
                            <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                            <span>Live</span>
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        {restaurant.slug && <span className="font-mono">/v/{restaurant.slug}</span>}
                        {restaurant.owner && <span data-restaurant-owner>{restaurant.owner.email}</span>}
                        {restaurant.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {restaurant.phone}
                          </span>
                        )}
                        {restaurant.cuisineType && (
                          <span className="inline-flex items-center gap-1">
                            <UtensilsCrossed className="w-3 h-3" /> {restaurant.cuisineType}
                          </span>
                        )}
                      </CardDescription>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-2 p-3 bg-muted/40 rounded-xl text-xs">
                      <div>
                        <span className="text-muted-foreground block">Live Queue</span>
                        <strong className="font-mono text-sm">{metric?.activeTickets ?? 0}</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Orders</span>
                        <strong className="font-mono text-sm">
                          {metric?.totalOrders ?? 0} · {metric?.revenue || '0.00'} {restaurant.currency || 'QAR'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">QR + NFC</span>
                        <strong className="font-mono text-sm">
                          {(metric?.qrScans ?? 0) + (metric?.nfcTaps ?? 0)}
                        </strong>
                      </div>
                    </div>

                    {restaurant.suspensionReason && (
                      <div className="p-2.5 bg-destructive/10 border border-destructive/20 rounded-xl">
                        <p className="text-xs text-destructive">
                          <strong>Paused:</strong> {restaurant.suspensionReason}
                        </p>
                      </div>
                    )}

                    <div className="staff-restaurant-actions flex flex-wrap gap-2 pt-1">
                      <OpenCafeAccount id={restaurant.id} name={restaurant.name} />
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        data-testid={`button-manage-${restaurant.id}`}
                        className="min-h-11 rounded-xl cursor-pointer gap-1.5"
                      >
                        <Link href={`/super-admin/restaurant/${restaurant.id}`}>
                          <Settings className="h-4 w-4" />
                          <span>Lifecycle &amp; Offboard</span>
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setQrRestaurant(restaurant)}
                        data-testid={`button-menu-qr-${restaurant.id}`}
                        className="min-h-11 rounded-xl cursor-pointer gap-1.5"
                      >
                        <QrCode className="h-4 w-4" />
                        <span>Menu QR</span>
                      </Button>
                      {isPaused ? (
                        <Button
                          size="sm"
                          onClick={() => reactivateMutation.mutate(restaurant.id)}
                          disabled={reactivateMutation.isPending}
                          data-testid={`button-activate-${restaurant.id}`}
                          className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white cursor-pointer gap-1.5"
                        >
                          <PlayCircle className="h-4 w-4" />
                          <span>Reactivate</span>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSuspendRestaurant(restaurant)}
                          data-testid={`button-suspend-${restaurant.id}`}
                          className="min-h-11 rounded-xl text-destructive hover:text-destructive cursor-pointer gap-1.5"
                        >
                          <PauseCircle className="h-4 w-4" />
                          <span>Pause</span>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="analytics">
          <PortfolioAnalyticsPanel branches={portfolioQuery.data?.branches || []} />
        </TabsContent>

        <TabsContent value="tenants">
          <MultiBranchTenantGroupsPanel restaurants={restaurants || []} />
        </TabsContent>
      </Tabs>

      {qrRestaurant && (
        <Dialog open={!!qrRestaurant} onOpenChange={open => !open && setQrRestaurant(null)}>
          <DialogContent className="max-w-lg rounded-3xl">
            <PermanentMenuQR key={qrRestaurant.id} restaurant={qrRestaurant} />
          </DialogContent>
        </Dialog>
      )}

      {suspendRestaurant && (
        <PauseVenueDialog
          restaurant={suspendRestaurant}
          open={!!suspendRestaurant}
          onOpenChange={open => !open && setSuspendRestaurant(null)}
        />
      )}
    </div>
  );
}
