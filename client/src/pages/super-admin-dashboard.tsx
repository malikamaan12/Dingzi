import { useState } from "react";
import { Link } from 'wouter';
import { OpenCafeAccount } from '@/components/open-cafe-account';
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Building2, 
  Ban, 
  CheckCircle, 
  Settings, QrCode, Eye, EyeOff, Plus, Phone, UtensilsCrossed, BarChart3, Network
} from "lucide-react";
import type { Restaurant } from "@shared/schema";
import PermanentMenuQR from "@/components/permanent-menu-qr";

interface RestaurantWithOwner extends Restaurant {
  owner: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
}

function PortfolioAnalyticsPanel() {
  const portfolioQuery = useQuery<{
    branches: {
      id: string;
      name: string;
      slug: string | null;
      orderingMode: string;
      currency: string;
      totalTickets: number;
      avgPrepMins: number;
      totalOrders: number;
      reservations: number;
      aggregatorClicks: number;
    }[];
  }>({
    queryKey: ['/api/super-admin/portfolio-analytics'],
  });

  const branches = portfolioQuery.data?.branches || [];
  if (!branches.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          Multi-Branch Portfolio SLA &amp; Demand Comparison
        </CardTitle>
        <CardDescription>
          Side-by-side comparison of virtual pagers, prep-time SLA, in-app orders, table bookings, and outbound aggregator clicks across all Dingzi venues.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Mobile Branch Comparison Cards (< 768px) */}
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
                  <span className="text-xs text-muted-foreground block">Pagers</span>
                  <strong className="font-mono">{b.totalTickets}</strong>
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
                  <span className="text-xs text-muted-foreground block">Bookings</span>
                  <strong className="font-mono">{b.reservations}</strong>
                </div>
                <div className="rounded-xl bg-muted/40 p-2 col-span-2">
                  <span className="text-xs text-muted-foreground block">Delivery Clicks</span>
                  <strong className="font-mono">{b.aggregatorClicks}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Desktop Portfolio Table (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b text-xs uppercase text-muted-foreground">
                <th className="py-2.5 pr-4">Branch</th>
                <th className="py-2.5 px-3">Commerce Mode</th>
                <th className="py-2.5 px-3 text-right">Pagers</th>
                <th className="py-2.5 px-3 text-right">Avg Prep SLA</th>
                <th className="py-2.5 px-3 text-right">Orders</th>
                <th className="py-2.5 px-3 text-right">Bookings</th>
                <th className="py-2.5 pl-3 text-right">Delivery Clicks</th>
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
                  <td className="py-2.5 px-3 text-right font-mono">{b.totalTickets}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{b.avgPrepMins}m</td>
                  <td className="py-2.5 px-3 text-right font-mono">{b.totalOrders}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{b.reservations}</td>
                  <td className="py-2.5 pl-3 text-right font-mono">{b.aggregatorClicks}</td>
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
  onOpenChange 
}: { 
  restaurant: RestaurantWithOwner;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");

  const suspendMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/super-admin/restaurants/${restaurant.id}/suspend`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/restaurants"] });
      toast({
        title: "Restaurant Suspended",
        description: "Restaurant has been suspended successfully",
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to suspend restaurant",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Temporarily closed for renovations..."
              rows={3}
              required
              data-testid="input-suspension-reason"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-suspend">
            Cancel
          </Button>
          <Button 
            variant="destructive"
            onClick={() => suspendMutation.mutate()} 
            disabled={suspendMutation.isPending || !reason}
            data-testid="button-confirm-suspend"
          >
            {suspendMutation.isPending ? "Suspending..." : "Suspend Restaurant"}
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
      toast({ title: 'Branch tenant assignment updated' });
    },
    onError: (e: Error) => toast({ title: 'Could not update branch group', description: e.message, variant: 'destructive' }),
  });

  const tenantsList = tenantsQuery.data?.tenants || [];
  const eligibleOwners = (usersQuery.data || []).filter(u => u.role === 'admin');

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Network className="w-5 h-5 text-primary" />
          Multi-Branch Brand &amp; Tenant Groups
        </CardTitle>
        <CardDescription>
          Group multiple branches under one hospitality brand so a Tenant Owner can switch branches and compare SLAs side-by-side.
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
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Urban Hospitality Group" required className="h-10" />
          </div>
          <div>
            <Label className="text-xs">Group Slug (optional)</Label>
            <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="urban-group" className="h-10 font-mono" />
          </div>
          <div>
            <Label className="text-xs">Tenant Owner Account</Label>
            <select
              className="manager-select w-full h-10 text-sm"
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
          <Button type="submit" disabled={!name.trim() || createTenantMutation.isPending} className="h-10 cursor-pointer gap-1.5">
            <Plus className="w-4 h-4" />
            <span>Create Brand Group</span>
          </Button>
        </form>

        {tenantsList.length > 0 && (
          <div className="grid md:grid-cols-2 gap-3 pt-2">
            {tenantsList.map(t => (
              <div key={t.id} className="rounded-xl border p-3.5 space-y-2 text-sm">
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
              <div key={r.id} className="rounded-xl border p-2.5 flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold truncate">{r.name}</span>
                <select
                  aria-label={`Assign tenant group for ${r.name}`}
                  className="manager-select h-8 text-xs max-w-[160px]"
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

  const { data: restaurants, isLoading } = useQuery<RestaurantWithOwner[]>({
    queryKey: ["/api/super-admin/restaurants"],
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PUT", `/api/super-admin/restaurants/${id}/activate`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/restaurants"] });
      toast({
        title: "Restaurant Activated",
        description: "Restaurant has been activated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to activate restaurant",
        variant: "destructive",
      });
    },
  });

  const stats = [
    { label:'Total cafés', count:restaurants?.length || 0, icon:Building2 },
    { label:'Live customer menus', count:restaurants?.filter(r=>r.status==='active' && !r.hidden).length || 0, icon:Eye },
    { label:'Paused cafés', count:restaurants?.filter(r=>r.status!=='active').length || 0, icon:Ban },
    { label:'Hidden menus', count:restaurants?.filter(r=>r.hidden).length || 0, icon:EyeOff },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading restaurants...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="staff-platform-heading">
        <div><p className="manager-eyebrow">YOUR WORKSPACE, AT A GLANCE</p>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-super-admin">
          Your cafés, beautifully managed.
        </h1>
        <p className="text-muted-foreground mt-1">
          Every restaurant, menu and team. One connected workspace.
        </p>
        </div><Button asChild><Link href="/super-admin/restaurants/new"><Plus/>Add café</Link></Button>
      </div>

      <div className="manager-stats">{stats.map(stat=><div className="manager-stat" key={stat.label}><stat.icon/><strong>{stat.count}</strong><span>{stat.label}</span></div>)}</div>

      <PortfolioAnalyticsPanel />

      <MultiBranchTenantGroupsPanel restaurants={restaurants || []} />

      <div className="staff-platform-grid">
        {restaurants && restaurants.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No restaurants registered yet</p>
            </CardContent>
          </Card>
        )}

        {restaurants && restaurants.map((restaurant) => (
          <Card key={restaurant.id} className="staff-restaurant-card" data-testid={`card-restaurant-${restaurant.id}`}>
            <CardHeader>
              <div className="staff-restaurant-avatar">{restaurant.logoUrl ? <img src={restaurant.logoUrl} alt={`${restaurant.name} logo`}/> : <Building2 size={23}/>}</div>
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-primary" />
                    <CardTitle className="text-xl">{restaurant.name}</CardTitle>
                    {restaurant.status === "suspended" ? (
                      <Badge variant="destructive">Suspended</Badge>
                    ) : (
                      <Badge variant="default">Active</Badge>
                    )}
                  </div>
                  <CardDescription className="flex flex-wrap items-center gap-2 text-sm">
                    {restaurant.owner && (
                      <span data-restaurant-owner>{restaurant.owner.email}</span>
                    )}
                    {restaurant.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {restaurant.phone}</span>}
                    {restaurant.cuisineType && <span className="inline-flex items-center gap-1"><UtensilsCrossed className="w-3.5 h-3.5" /> {restaurant.cuisineType}</span>}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="staff-restaurant-meta grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                <div><p className="text-xs text-muted-foreground">Customer menu</p><p className="text-sm font-medium">{restaurant.status === 'active' && !restaurant.hidden ? 'Visible to guests' : 'Currently unavailable to guests'}</p></div>
                <div><p className="text-xs text-muted-foreground">Menu identity</p><p className="text-sm font-medium">One permanent restaurant QR</p></div>
              </div>

              {restaurant.suspensionReason && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                  <p className="text-sm text-destructive">
                    <strong>Suspension Reason:</strong> {restaurant.suspensionReason}
                  </p>
                </div>
              )}

              <div className="staff-restaurant-actions flex flex-wrap gap-2 pt-2">
                <OpenCafeAccount id={restaurant.id} name={restaurant.name}/>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.location.href = `/super-admin/restaurant/${restaurant.id}`}
                  data-testid={`button-manage-${restaurant.id}`}
                >
                  <Settings className="h-4 w-4 mr-1" />
                  Platform controls
                </Button>
                <Button size="sm" variant="outline" onClick={() => setQrRestaurant(restaurant)} data-testid={`button-menu-qr-${restaurant.id}`}><QrCode className="h-4 w-4 mr-1"/>Menu QR</Button>
                {restaurant.status === "suspended" ? (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => activateMutation.mutate(restaurant.id)}
                    disabled={activateMutation.isPending}
                    data-testid={`button-activate-${restaurant.id}`}
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
                  >
                    <Ban className="h-4 w-4 mr-1" />
                    Suspend
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {qrRestaurant && <Dialog open onOpenChange={open => !open && setQrRestaurant(null)}><DialogContent className="max-w-4xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{qrRestaurant.name} menu QR</DialogTitle><DialogDescription>One permanent menu link for this restaurant.</DialogDescription></DialogHeader><PermanentMenuQR key={qrRestaurant.id} restaurant={qrRestaurant}/></DialogContent></Dialog>}

      {suspendRestaurant && (
        <SuspendRestaurantDialog
          restaurant={suspendRestaurant}
          open={!!suspendRestaurant}
          onOpenChange={(open) => !open && setSuspendRestaurant(null)}
        />
      )}
    </div>
  );
}
