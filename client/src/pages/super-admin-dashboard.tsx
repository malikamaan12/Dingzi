import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Ban,
  BarChart3,
  BellRing,
  Building2,
  CalendarDays,
  CheckCircle,
  Eye,
  History,
  LibraryBig,
  Network,
  Phone,
  Plus,
  QrCode,
  Receipt,
  Search,
  Settings,
  Users,
  UtensilsCrossed,
  Wifi,
} from 'lucide-react';
import { OpenCafeAccount } from '@/components/open-cafe-account';
import PermanentMenuQR from '@/components/permanent-menu-qr';
import { DingziMark } from '@/components/staff-brand';
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

function PortfolioAnalyticsPanel({ branches }: { branches: PortfolioBranchMetric[] }) {
  if (!branches.length) return null;

  return (
    <Card className="rounded-3xl border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          Multi-Branch Portfolio SLA, Revenue &amp; QR/NFC Demand
        </CardTitle>
        <CardDescription>
          Live side-by-side comparison across all dingzi venues on the platform.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:hidden">
          {branches.map(b => (
            <article key={b.id} className="rounded-2xl border p-3.5 space-y-2.5 bg-card">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm truncate">{b.name}</strong>
                <Badge variant="outline" className="text-[11px] font-mono shrink-0">
                  {b.orderingMode}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl bg-muted/40 p-2">
                  <span className="text-xs text-muted-foreground block">Live / Total</span>
                  <strong className="font-mono">{b.activeTickets || 0} / {b.totalTickets}</strong>
                </div>
                <div className="rounded-xl bg-muted/40 p-2">
                  <span className="text-xs text-muted-foreground block">Avg Prep</span>
                  <strong className="font-mono">{b.avgPrepMins}m</strong>
                </div>
                <div className="rounded-xl bg-muted/40 p-2">
                  <span className="text-xs text-muted-foreground block">Orders</span>
                  <strong className="font-mono">{b.totalOrders}</strong>
                </div>
                <div className="rounded-xl bg-muted/40 p-2">
                  <span className="text-xs text-muted-foreground block">Revenue</span>
                  <strong className="font-mono">{b.revenue || '0.00'} {b.currency}</strong>
                </div>
                <div className="rounded-xl bg-muted/40 p-2">
                  <span className="text-xs text-muted-foreground block">Bookings</span>
                  <strong className="font-mono">{b.reservations}</strong>
                </div>
                <div className="rounded-xl bg-muted/40 p-2">
                  <span className="text-xs text-muted-foreground block">QR + NFC</span>
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
                <th className="py-2.5 pr-4">Branch</th>
                <th className="py-2.5 px-3">Commerce Mode</th>
                <th className="py-2.5 px-3 text-right">Live Queue</th>
                <th className="py-2.5 px-3 text-right">Total Pagers</th>
                <th className="py-2.5 px-3 text-right">Avg Prep SLA</th>
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
                    <Badge variant="outline" className="text-[11px] font-mono">
                      {b.orderingMode}
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
                    {(b.qrScans || 0)} QR / {(b.nfcTaps || 0)} NFC
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

function SuspendRestaurantDialog({
  restaurant,
  open,
  onOpenChange,
}: {
  restaurant: RestaurantWithOwner;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');

  const suspendMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('PUT', `/api/super-admin/restaurants/${restaurant.id}/suspend`, { reason });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/super-admin/restaurants'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/super-admin/portfolio-analytics'] });
      toast({
        title: 'Restaurant Suspended',
        description: 'Restaurant has been suspended successfully',
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to suspend restaurant',
        variant: 'destructive',
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Suspend Restaurant</DialogTitle>
          <DialogDescription>
            Suspend {restaurant.name}. The restaurant will be hidden from public view.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Suspension Reason</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g., Temporarily closed for renovations..."
              rows={3}
              required
              data-testid="input-suspension-reason"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-suspend" className="min-h-11 cursor-pointer">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => suspendMutation.mutate()}
            disabled={suspendMutation.isPending || !reason}
            data-testid="button-confirm-suspend"
            className="min-h-11 cursor-pointer"
          >
            {suspendMutation.isPending ? 'Suspending...' : 'Suspend Restaurant'}
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
      toast({ title: 'Multi-branch tenant group created' });
    },
    onError: (e: Error) => toast({ title: 'Could not create tenant group', description: e.message, variant: 'destructive' }),
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
      toast({ title: 'Branch tenant assignment updated' });
    },
    onError: (e: Error) => toast({ title: 'Could not update branch group', description: e.message, variant: 'destructive' }),
  });

  const tenantsList = tenantsQuery.data?.tenants || [];
  const eligibleOwners = (usersQuery.data || []).filter(u => u.role === 'admin');

  return (
    <Card className="rounded-3xl border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Network className="w-5 h-5 text-primary" />
          Multi-Branch Brand &amp; Tenant Groups
        </CardTitle>
        <CardDescription>
          Group multiple branches under one hospitality brand so a Tenant Owner gets a live portfolio dashboard and instant branch switching.
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
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Urban Hospitality Group" required className="min-h-11" />
          </div>
          <div>
            <Label className="text-xs">Group Slug (optional)</Label>
            <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="urban-group" className="min-h-11 font-mono" />
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
          <Button type="submit" disabled={!name.trim() || createTenantMutation.isPending} className="min-h-11 cursor-pointer gap-1.5">
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
          <div className="pt-2 border-t grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {restaurants.map(r => (
              <div key={r.id} className="rounded-2xl border p-2.5 flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold truncate">{r.name}</span>
                <select
                  aria-label={`Assign tenant group for ${r.name}`}
                  className="manager-select min-h-11 text-xs max-w-[170px]"
                  value={(r as any).tenantId || ''}
                  onChange={e =>
                    linkBranchMutation.mutate({
                      restaurantId: r.id,
                      tenantId: e.target.value || null,
                    })
                  }
                >
                  <option value="">Standalone Café</option>
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

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('PUT', `/api/super-admin/restaurants/${id}/activate`, {});
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/super-admin/restaurants'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/super-admin/portfolio-analytics'] });
      toast({
        title: 'Restaurant Activated',
        description: 'Restaurant has been activated successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to activate restaurant',
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
    <div className="space-y-6 max-w-[1500px]">
      {/* Platform Super-Admin Command Hero */}
      <section className="rounded-3xl bg-[#17132E] text-white border border-[#241E42] p-5 sm:p-7 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <DingziMark size={34} />
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C8FF42] text-[#17132E] text-xs font-extrabold">
                Platform Super-Admin Console
              </span>
              <span className="px-3 py-1 rounded-full bg-[#241E42] text-white/85 text-xs font-mono">
                {restaurants?.length || 0} Venues · {totals?.tenantGroupsCount ?? 0} Brand Groups
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight" data-testid="heading-super-admin">
              Platform Network Command Center
            </h1>
            <p className="text-sm text-white/75 max-w-2xl">
              Provision café workspaces, manage multi-branch hospitality groups, audit staff access, and monitor live pager, order, and QR/NFC traffic across the entire network.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button asChild className="min-h-11 rounded-2xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white font-bold cursor-pointer gap-1.5">
              <Link href="/super-admin/restaurants/new">
                <Plus className="w-4 h-4" />
                <span>Add Café</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11 rounded-2xl border-white/20 bg-[#241E42] text-white hover:bg-[#312959] cursor-pointer gap-1.5">
              <Link href="/super-admin/accounts">
                <Users className="w-4 h-4" />
                <span>Accounts &amp; Roles</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11 rounded-2xl border-white/20 bg-[#241E42] text-white hover:bg-[#312959] cursor-pointer gap-1.5">
              <Link href="/admin/library">
                <LibraryBig className="w-4 h-4" />
                <span>Global Library</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11 rounded-2xl border-white/20 bg-[#241E42] text-white hover:bg-[#312959] cursor-pointer gap-1.5">
              <Link href="/super-admin/access-history">
                <History className="w-4 h-4" />
                <span>Audit Log</span>
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* 6-Card Platform Network Pulse */}
      <section className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4" role="status" aria-live="polite">
        <div className="rounded-2xl border bg-card p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Live Menus</span>
            <Eye className="w-4 h-4 text-[#6236FF]" />
          </div>
          <strong className="block text-2xl font-display font-extrabold font-mono">
            {liveCount} / {restaurants?.length || 0}
          </strong>
          <span className="text-xs text-muted-foreground block">{pausedCount} paused or hidden</span>
        </div>

        <div className="rounded-2xl border bg-card p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Active Queues</span>
            <BellRing className="w-4 h-4 text-[#6236FF]" />
          </div>
          <strong className="block text-2xl font-display font-extrabold font-mono">
            {totals?.activeTicketsNow ?? 0}
          </strong>
          <span className="text-xs text-muted-foreground block">{totals?.totalTickets ?? 0} total issued</span>
        </div>

        <div className="rounded-2xl border bg-card p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Network Orders</span>
            <Receipt className="w-4 h-4 text-[#6236FF]" />
          </div>
          <strong className="block text-2xl font-display font-extrabold font-mono">
            {totals?.totalOrders ?? 0}
          </strong>
          <span className="text-xs text-muted-foreground block font-mono">{totals?.settledRevenueTotal ?? '0.00'} QAR</span>
        </div>

        <div className="rounded-2xl border bg-card p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>QR &amp; NFC Taps</span>
            <Wifi className="w-4 h-4 text-[#6236FF]" />
          </div>
          <strong className="block text-2xl font-display font-extrabold font-mono">
            {(totals?.totalQrScans ?? 0) + (totals?.totalNfcTaps ?? 0)}
          </strong>
          <span className="text-xs text-muted-foreground block">{totals?.smartTagsCount ?? 0} smart tags</span>
        </div>

        <div className="rounded-2xl border bg-card p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Floor &amp; Waitlist</span>
            <CalendarDays className="w-4 h-4 text-[#6236FF]" />
          </div>
          <strong className="block text-2xl font-display font-extrabold font-mono">
            {totals?.reservationsCount ?? 0}
          </strong>
          <span className="text-xs text-muted-foreground block">{totals?.waitlistWaitingNow ?? 0} in waitlist now</span>
        </div>

        <div className="rounded-2xl border bg-card p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Staff Accounts</span>
            <Users className="w-4 h-4 text-[#6236FF]" />
          </div>
          <strong className="block text-2xl font-display font-extrabold font-mono">
            {totals?.totalUsers ?? 0}
          </strong>
          <span className="text-xs text-muted-foreground block">{totals?.tenantGroupsCount ?? 0} brand groups</span>
        </div>
      </section>

      <PortfolioAnalyticsPanel branches={portfolioQuery.data?.branches || []} />

      <MultiBranchTenantGroupsPanel restaurants={restaurants || []} />

      {/* Venue Fleet Directory + Search & Filter */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 sm:max-w-md">
            <Search className="w-4 h-4 text-muted-foreground absolute top-3.5 start-3.5 pointer-events-none" />
            <Input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search venues, slugs, or manager emails…"
              aria-label="Search venues"
              className="min-h-11 ps-10 rounded-2xl"
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
                className={`min-h-11 px-4 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
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
            <Card className="col-span-full rounded-3xl">
              <CardContent className="p-8 text-center">
                <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No restaurants match this filter</p>
              </CardContent>
            </Card>
          )}

          {filteredRestaurants.map(restaurant => {
            const metric = metricsByBranchId.get(restaurant.id);
            return (
              <Card key={restaurant.id} className="staff-restaurant-card" data-testid={`card-restaurant-${restaurant.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="staff-restaurant-avatar !mb-3">
                      {restaurant.logoUrl ? (
                        <img src={restaurant.logoUrl} alt={`${restaurant.name} logo`} />
                      ) : (
                        <Building2 size={23} />
                      )}
                    </div>
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {restaurant.orderingMode}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-xl">{restaurant.name}</CardTitle>
                      {restaurant.status === 'suspended' ? (
                        <Badge variant="destructive">Suspended</Badge>
                      ) : (
                        <Badge variant="default">Active</Badge>
                      )}
                    </div>
                    <CardDescription className="flex flex-wrap items-center gap-2 text-sm">
                      {restaurant.owner && <span data-restaurant-owner>{restaurant.owner.email}</span>}
                      {restaurant.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" /> {restaurant.phone}
                        </span>
                      )}
                      {restaurant.cuisineType && (
                        <span className="inline-flex items-center gap-1">
                          <UtensilsCrossed className="w-3.5 h-3.5" /> {restaurant.cuisineType}
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
                      <strong className="font-mono text-sm">{metric?.totalOrders ?? 0}</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">QR + NFC</span>
                      <strong className="font-mono text-sm">
                        {(metric?.qrScans ?? 0) + (metric?.nfcTaps ?? 0)}
                      </strong>
                    </div>
                  </div>

                  {restaurant.suspensionReason && (
                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl">
                      <p className="text-sm text-destructive">
                        <strong>Suspension Reason:</strong> {restaurant.suspensionReason}
                      </p>
                    </div>
                  )}

                  <div className="staff-restaurant-actions flex flex-wrap gap-2 pt-1">
                    <OpenCafeAccount id={restaurant.id} name={restaurant.name} />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => (window.location.href = `/super-admin/restaurant/${restaurant.id}`)}
                      data-testid={`button-manage-${restaurant.id}`}
                      className="min-h-11 cursor-pointer"
                    >
                      <Settings className="h-4 w-4 mr-1" />
                      Platform controls
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setQrRestaurant(restaurant)}
                      data-testid={`button-menu-qr-${restaurant.id}`}
                      className="min-h-11 cursor-pointer"
                    >
                      <QrCode className="h-4 w-4 mr-1" />
                      Menu QR
                    </Button>
                    {restaurant.status === 'suspended' ? (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => activateMutation.mutate(restaurant.id)}
                        disabled={activateMutation.isPending}
                        data-testid={`button-activate-${restaurant.id}`}
                        className="min-h-11 cursor-pointer"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Activate
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setSuspendRestaurant(restaurant)}
                        data-testid={`button-suspend-${restaurant.id}`}
                        className="min-h-11 cursor-pointer"
                      >
                        <Ban className="h-4 w-4 mr-1" />
                        Suspend
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {qrRestaurant && (
        <Dialog open onOpenChange={open => !open && setQrRestaurant(null)}>
          <DialogContent className="max-w-4xl max-h-[90dvh] overflow-y-auto rounded-3xl">
            <DialogHeader>
              <DialogTitle>{qrRestaurant.name} menu QR</DialogTitle>
              <DialogDescription>One permanent menu link for this restaurant.</DialogDescription>
            </DialogHeader>
            <PermanentMenuQR key={qrRestaurant.id} restaurant={qrRestaurant} />
          </DialogContent>
        </Dialog>
      )}

      {suspendRestaurant && (
        <SuspendRestaurantDialog
          restaurant={suspendRestaurant}
          open={!!suspendRestaurant}
          onOpenChange={open => !open && setSuspendRestaurant(null)}
        />
      )}
    </div>
  );
}
