import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  BarChart3,
  Building2,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { StaffRole } from '@shared/schema';

const ROLE_DESCRIPTIONS: Record<StaffRole, { label: string; summary: string }> = {
  prep_barista: {
    label: 'Barista / Prep / Runner',
    summary: 'Advance live pager & order states (Preparing → Ready → Collected), view arrived bay cars, and 1-tap snooze items/modifiers.',
  },
  host_cashier: {
    label: 'Host / Cashier',
    summary: 'Issue POS & Auto-Number pagers, seat walk-in waitlist parties, manage floor bookings, and confirm Pay-at-Venue orders.',
  },
  branch_manager: {
    label: 'Branch Manager',
    summary: 'Full branch control: menus, themes, floor tables, curbside bays, commerce modes, gateway vault, and SLA analytics.',
  },
  tenant_owner: {
    label: 'Tenant Owner (Multi-Branch)',
    summary: 'Switch across all branches in your tenant group, compare branch SLAs side-by-side, and manage branch managers.',
  },
};

export default function AdminTeamPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [staffRole, setStaffRole] = useState<StaffRole>('prep_barista');
  const [applyTenantWide, setApplyTenantWide] = useState(false);

  const teamQuery = useQuery<{
    primaryManager: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
    assignments: {
      id: string;
      userId: string;
      restaurantId: string | null;
      tenantId: string | null;
      staffRole: StaffRole;
      email: string;
      firstName: string | null;
      lastName: string | null;
      createdAt: string;
    }[];
    callerRole: string;
    accessibleBranches: { id: string; name: string; slug: string | null; tenantId: string | null }[];
  }>({
    queryKey: ['/api/hospitality/team'],
  });

  const tenantAnalyticsQuery = useQuery<{
    branches: {
      id: string;
      name: string;
      slug: string | null;
      orderingMode: string;
      currency: string;
      totalTickets: number;
      avgPrepMins: number;
      peakHour: string;
      totalOrders: number;
      revenue: string;
      reservations: number;
      aggregatorClicks: number;
    }[];
  }>({
    enabled: (teamQuery.data?.accessibleBranches?.length || 0) > 1 || user?.staffRole === 'tenant_owner',
    queryKey: ['/api/hospitality/tenant-analytics'],
  });

  const addStaffMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/hospitality/team', {
        email: email.trim().toLowerCase(),
        ...(password.trim() ? { password } : {}),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        staffRole,
        applyTenantWide,
      });
      return res.json();
    },
    onSuccess: data => {
      setEmail('');
      setPassword('');
      setFirstName('');
      setLastName('');
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/team'] });
      toast({
        title: `Assigned ${ROLE_DESCRIPTIONS[staffRole].label}`,
        description: `${data.user.email} can now sign into this workspace.`,
      });
    },
    onError: (e: Error) => toast({ title: 'Could not add team member', description: e.message, variant: 'destructive' }),
  });

  const revokeMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      await apiRequest('DELETE', `/api/hospitality/team/${assignmentId}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/hospitality/team'] });
      toast({ title: 'Staff access revoked & active sessions signed out' });
    },
    onError: (e: Error) => toast({ title: 'Could not revoke access', description: e.message, variant: 'destructive' }),
  });

  const switchBranchMutation = useMutation({
    mutationFn: async (restaurantId: string) => {
      const res = await apiRequest('POST', '/api/hospitality/switch-branch', { restaurantId });
      return res.json();
    },
    onSuccess: updatedUser => {
      queryClient.setQueryData(['/api/auth/user'], updatedUser);
      void queryClient.invalidateQueries();
      toast({ title: `Switched active workspace to ${updatedUser.cafeContext?.name || 'branch'}` });
    },
    onError: (e: Error) => toast({ title: 'Could not switch branch', description: e.message, variant: 'destructive' }),
  });

  const canAssignTenantOwner = user?.role === 'super_admin' || user?.staffRole === 'tenant_owner';
  const hasTenantGroup = Boolean(user?.tenantContext);
  const branches = tenantAnalyticsQuery.data?.branches || [];

  return (
    <div className="space-y-6 max-w-[1300px]">
      <div>
        <p className="manager-eyebrow">ROLE-BASED ACCESS &amp; MULTI-BRANCH WORKSPACE</p>
        <h1 className="text-2xl sm:text-3xl font-bold">Team Roles &amp; Branch Group</h1>
        <p className="text-sm text-muted-foreground">
          Provision dedicated logins for Barista prep tablets, Host stands, Branch Managers, and Multi-Branch Tenant Owners.
        </p>
      </div>

      {/* Multi-Branch Tenant Comparison Panel (Tenant Owner / Multi-Branch Staff) */}
      {branches.length > 0 && (
        <section className="manager-panel p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                {user?.tenantContext ? `${user.tenantContext.name} · Multi-Branch SLA Comparison` : 'Accessible Branches Comparison'}
              </h2>
              <p className="text-xs text-muted-foreground">
                Compare live prep-time SLAs, peak congestion hours, orders, bookings, and delivery clicks across your branches.
              </p>
            </div>
          </div>

          {/* Mobile Branch Cards (< 768px) */}
          <div className="grid gap-3 md:hidden">
            {branches.map(b => {
              const isCurrent = user?.cafeContext?.id === b.id;
              return (
                <article
                  key={b.id}
                  className={`rounded-2xl border p-4 space-y-3 ${isCurrent ? 'border-primary/40 bg-primary/5' : 'bg-card'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <strong className="flex items-center gap-2 text-base">
                        <Building2 className="w-4 h-4 text-primary shrink-0" />
                        <span className="truncate">{b.name}</span>
                      </strong>
                      <Badge variant="outline" className="mt-1 text-[11px] font-mono">
                        {b.orderingMode.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    {isCurrent && <Badge className="bg-[#C8FF42] text-[#17132E] shrink-0">Active</Badge>}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-xl bg-muted/40 p-2.5">
                      <span className="text-[10px] text-muted-foreground block">Pagers</span>
                      <strong className="font-mono text-sm">{b.totalTickets}</strong>
                    </div>
                    <div className="rounded-xl bg-muted/40 p-2.5">
                      <span className="text-[10px] text-muted-foreground block">Avg Prep</span>
                      <strong className="font-mono text-sm">{b.avgPrepMins}m</strong>
                    </div>
                    <div className="rounded-xl bg-muted/40 p-2.5">
                      <span className="text-[10px] text-muted-foreground block">Peak Hour</span>
                      <strong className="font-mono text-sm">{b.peakHour}</strong>
                    </div>
                    <div className="rounded-xl bg-muted/40 p-2.5">
                      <span className="text-[10px] text-muted-foreground block">Orders</span>
                      <strong className="font-mono text-sm">{b.totalOrders}</strong>
                    </div>
                    <div className="rounded-xl bg-muted/40 p-2.5">
                      <span className="text-[10px] text-muted-foreground block">Revenue</span>
                      <strong className="font-mono text-xs truncate block">{b.revenue} {b.currency}</strong>
                    </div>
                    <div className="rounded-xl bg-muted/40 p-2.5">
                      <span className="text-[10px] text-muted-foreground block">Bookings</span>
                      <strong className="font-mono text-sm">{b.reservations}</strong>
                    </div>
                  </div>
                  {!isCurrent && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={switchBranchMutation.isPending}
                      onClick={() => switchBranchMutation.mutate(b.id)}
                      className="w-full min-h-11 rounded-xl cursor-pointer gap-1.5"
                    >
                      <ArrowRightLeft className="w-4 h-4" />
                      <span>Switch Active Workspace</span>
                    </Button>
                  )}
                </article>
              );
            })}
          </div>

          {/* Desktop Comparison Table (md+) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2.5 pr-4">Branch</th>
                  <th className="py-2.5 px-3">Mode</th>
                  <th className="py-2.5 px-3 text-right">Pagers</th>
                  <th className="py-2.5 px-3 text-right">Avg Prep</th>
                  <th className="py-2.5 px-3 text-right">Peak Hour</th>
                  <th className="py-2.5 px-3 text-right">Orders</th>
                  <th className="py-2.5 px-3 text-right">Revenue</th>
                  <th className="py-2.5 px-3 text-right">Bookings</th>
                  <th className="py-2.5 px-3 text-right">Delivery Clicks</th>
                  <th className="py-2.5 pl-3 text-right">Workspace</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {branches.map(b => {
                  const isCurrent = user?.cafeContext?.id === b.id;
                  return (
                    <tr key={b.id} className={isCurrent ? 'bg-primary/5' : ''}>
                      <td className="py-3 pr-4 font-semibold flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-primary shrink-0" />
                        <span>{b.name}</span>
                      </td>
                      <td className="py-3 px-3">
                        <Badge variant="outline" className="text-[11px] font-mono">
                          {b.orderingMode.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-right font-mono">{b.totalTickets}</td>
                      <td className="py-3 px-3 text-right font-mono">{b.avgPrepMins}m</td>
                      <td className="py-3 px-3 text-right font-mono">{b.peakHour}</td>
                      <td className="py-3 px-3 text-right font-mono">{b.totalOrders}</td>
                      <td className="py-3 px-3 text-right font-mono">{b.revenue} {b.currency}</td>
                      <td className="py-3 px-3 text-right font-mono">{b.reservations}</td>
                      <td className="py-3 px-3 text-right font-mono">{b.aggregatorClicks}</td>
                      <td className="py-3 pl-3 text-right">
                        {isCurrent ? (
                          <Badge className="bg-[#C8FF42] text-[#17132E]">Active</Badge>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={switchBranchMutation.isPending}
                            onClick={() => switchBranchMutation.mutate(b.id)}
                            className="min-h-9 rounded-lg cursor-pointer gap-1.5"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            <span>Switch</span>
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Provision Scoped Staff Member */}
      <form
        onSubmit={e => {
          e.preventDefault();
          addStaffMutation.mutate();
        }}
        className="manager-panel p-6 space-y-5"
      >
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Add Branch Staff or Terminal Account
        </h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(['prep_barista', 'host_cashier', 'branch_manager', ...(canAssignTenantOwner && hasTenantGroup ? (['tenant_owner'] as const) : [])] as StaffRole[]).map(
            roleKey => {
              const info = ROLE_DESCRIPTIONS[roleKey];
              const selected = staffRole === roleKey;
              return (
                <button
                  key={roleKey}
                  type="button"
                  data-testid={`button-role-${roleKey}`}
                  onClick={() => setStaffRole(roleKey)}
                  className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                    selected ? 'border-[#6236FF] bg-[#EFEAFF]/60' : 'border-border bg-card'
                  }`}
                >
                  <strong className="block text-sm">{info.label}</strong>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{info.summary}</p>
                </button>
              );
            },
          )}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">First Name *</Label>
            <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Sara" required className="h-11" />
          </div>
          <div>
            <Label className="text-xs">Last Name *</Label>
            <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Al-Marri" required className="h-11" />
          </div>
          <div>
            <Label className="text-xs">Staff Login Email *</Label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="barista.lusail@cafe.qa"
              required
              className="h-11"
            />
          </div>
          <div>
            <Label className="text-xs">Initial Password (10+ chars for new user)</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••••"
              className="h-11"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          {hasTenantGroup && staffRole !== 'tenant_owner' ? (
            <label className="flex items-center gap-2.5 text-xs font-medium cursor-pointer">
              <Switch checked={applyTenantWide} onCheckedChange={setApplyTenantWide} />
              <span>Grant access across all branches in {user?.tenantContext?.name}</span>
            </label>
          ) : (
            <span className="text-xs text-muted-foreground">
              Existing Dingzi staff emails can be assigned to additional branches without resetting their password.
            </span>
          )}

          <Button
            type="submit"
            disabled={!email.trim() || !firstName.trim() || !lastName.trim() || addStaffMutation.isPending}
            data-testid="button-create-staff"
            className="min-h-11 rounded-xl bg-[#6236FF] hover:bg-[#4B1FE0] text-white cursor-pointer gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>{addStaffMutation.isPending ? 'Saving…' : 'Assign Role'}</span>
          </Button>
        </div>
      </form>

      {/* Active Roster */}
      <section className="manager-panel p-6 space-y-3">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Active Branch &amp; Tenant Roster
        </h2>

        {teamQuery.data?.primaryManager && (
          <div className="rounded-2xl border bg-muted/30 p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <strong className="text-sm">
                  {teamQuery.data.primaryManager.firstName} {teamQuery.data.primaryManager.lastName}
                </strong>
                <Badge>Primary Branch Owner</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{teamQuery.data.primaryManager.email}</p>
            </div>
            <span className="text-xs text-muted-foreground">Managed via Platform Accounts</span>
          </div>
        )}

        {(teamQuery.data?.assignments || []).length === 0 ? (
          <p className="text-xs text-muted-foreground pt-2">
            No additional Barista/Prep, Host/Cashier, or Multi-Branch staff roles assigned yet.
          </p>
        ) : (
          <div className="space-y-2">
            {(teamQuery.data?.assignments || []).map(member => (
              <div
                key={member.id}
                data-testid={`row-staff-${member.email}`}
                className="rounded-2xl border p-3.5 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm">
                      {member.firstName} {member.lastName}
                    </strong>
                    <Badge className="bg-[#EFEAFF] text-[#4B1FE0] border border-[#E5E2F2]">
                      {ROLE_DESCRIPTIONS[member.staffRole]?.label || member.staffRole}
                    </Badge>
                    {member.tenantId && (
                      <Badge variant="outline" className="text-[11px]">
                        All Tenant Branches
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{member.email}</p>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => revokeMutation.mutate(member.id)}
                  disabled={revokeMutation.isPending}
                  className="min-h-10 text-destructive hover:text-destructive cursor-pointer gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Revoke</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
